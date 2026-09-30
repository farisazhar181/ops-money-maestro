DROP FUNCTION public.create_job(text,uuid,date,text,text,text,text,text,text,numeric,numeric);
DROP FUNCTION private.create_job_impl(text,uuid,date,text,text,text,text,text,text,numeric,numeric);

CREATE OR REPLACE FUNCTION private.create_job_impl(_job_sheet_no text, _customer_id uuid, _order_date date, _service_type text, _unit_type text, _quantity text, _volume_weight text, _origin text, _destination text, _estimated_selling numeric, _estimated_buying numeric, _commodity text DEFAULT NULL::text, _etd date DEFAULT NULL::date, _eta date DEFAULT NULL::date)
 RETURNS jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE v_user uuid := private.assert_any_actor(); v_fin boolean; v_job public.jobs; v_f public.job_financials;
BEGIN
  v_fin := private.has_role(v_user,'owner') OR private.has_role(v_user,'finance');
  IF trim(COALESCE(_job_sheet_no,''))='' THEN RAISE EXCEPTION 'Job sheet number is required'; END IF;
  IF NOT v_fin AND (_estimated_selling IS NOT NULL OR _estimated_buying IS NOT NULL) THEN RAISE EXCEPTION 'Only Management or Finance can set job pricing'; END IF;
  IF v_fin AND (COALESCE(_estimated_selling,0)<=0 OR COALESCE(_estimated_buying,0)<=0) THEN RAISE EXCEPTION 'Estimated selling and estimated buying must both be greater than zero'; END IF;
  INSERT INTO public.jobs(job_sheet_no,customer_id,order_date,service_type,unit_type,quantity,volume_weight,origin,destination,commodity,etd,eta,status,created_by)
  VALUES(trim(_job_sheet_no),_customer_id,COALESCE(_order_date,private.jkt_today()),_service_type,_unit_type,_quantity,_volume_weight,_origin,_destination,NULLIF(trim(COALESCE(_commodity,'')),''),_etd,_eta,'Pipeline',v_user)
  RETURNING * INTO v_job;
  IF v_fin THEN
    INSERT INTO public.job_financials(job_id,estimated_selling,estimated_buying) VALUES(v_job.id,_estimated_selling,_estimated_buying) RETURNING * INTO v_f;
    PERFORM private.log_change(v_user,'created','job_financials',v_job.id,v_job.id,'Set job estimates',NULL,to_jsonb(v_f));
  END IF;
  RETURN v_job;
END $function$;

CREATE OR REPLACE FUNCTION private.set_job_estimates_impl(_job_id uuid, _estimated_selling numeric, _estimated_buying numeric)
 RETURNS job_financials LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE v_user uuid := private.assert_finance_actor(); v_old public.job_financials; v_new public.job_financials;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND NOT is_void) THEN RAISE EXCEPTION 'Active job not found'; END IF;
  IF COALESCE(_estimated_selling,0)<=0 OR COALESCE(_estimated_buying,0)<=0 THEN RAISE EXCEPTION 'Estimated selling and estimated buying must both be greater than zero'; END IF;
  SELECT * INTO v_old FROM public.job_financials WHERE job_id=_job_id FOR UPDATE;
  INSERT INTO public.job_financials(job_id,estimated_selling,estimated_buying) VALUES(_job_id,_estimated_selling,_estimated_buying)
  ON CONFLICT (job_id) DO UPDATE SET estimated_selling=EXCLUDED.estimated_selling,estimated_buying=EXCLUDED.estimated_buying,updated_at=now()
  RETURNING * INTO v_new;
  PERFORM private.log_change(v_user,CASE WHEN v_old.job_id IS NULL THEN 'created' ELSE 'edited' END,'job_financials',_job_id,_job_id,'Updated job estimates',CASE WHEN v_old.job_id IS NOT NULL THEN to_jsonb(v_old) END,to_jsonb(v_new));
  RETURN v_new;
END $function$;

CREATE OR REPLACE FUNCTION private.job_close_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_s numeric; v_b numeric; v_es numeric; v_eb numeric;
BEGIN
  IF NEW.status IN ('Active','Closed') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT estimated_selling, estimated_buying INTO v_es, v_eb FROM public.job_financials WHERE job_id = NEW.id;
    IF COALESCE(v_es,0) <= 0 OR COALESCE(v_eb,0) <= 0 THEN
      RAISE EXCEPTION 'Set estimated selling and estimated buying (both greater than zero) before moving this job to Active or Closed';
    END IF;
  END IF;
  IF NEW.status = 'Closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Closed') THEN
    SELECT actual_selling, actual_buying INTO v_s, v_b FROM public.job_financials WHERE job_id = NEW.id;
    IF v_s IS NULL OR v_s <= 0 OR v_b IS NULL OR v_b <= 0 THEN
      RAISE EXCEPTION 'Actual selling and actual buying must both be greater than zero to close a job';
    END IF;
    NEW.closed_at := now();
  ELSIF NEW.status <> 'Closed' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END; $function$;

-- Opening cash balance (single row)
CREATE TABLE public.opening_cash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  amount numeric NOT NULL DEFAULT 0,
  as_of date,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.opening_cash TO authenticated;
GRANT ALL ON public.opening_cash TO service_role;
ALTER TABLE public.opening_cash ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance and Management read opening cash" ON public.opening_cash FOR SELECT TO authenticated
USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
INSERT INTO public.opening_cash(amount, as_of) VALUES (0, NULL);

CREATE OR REPLACE FUNCTION private.set_opening_cash_impl(_amount numeric, _as_of date)
 RETURNS public.opening_cash LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_user uuid := private.assert_finance_actor(); v_old public.opening_cash; v_new public.opening_cash;
BEGIN
  IF _amount IS NULL THEN RAISE EXCEPTION 'Amount is required'; END IF;
  IF _as_of IS NULL THEN RAISE EXCEPTION 'As-of date is required'; END IF;
  SELECT * INTO v_old FROM public.opening_cash WHERE singleton FOR UPDATE;
  UPDATE public.opening_cash SET amount=_amount, as_of=_as_of, updated_by=v_user, updated_at=now() WHERE singleton RETURNING * INTO v_new;
  PERFORM private.log_change(v_user,'edited','opening_cash',v_new.id,NULL,'Updated opening cash balance',
    jsonb_build_object('amount',v_old.amount,'as_of',v_old.as_of), jsonb_build_object('amount',v_new.amount,'as_of',v_new.as_of));
  RETURN v_new;
END $function$;
CREATE FUNCTION public.set_opening_cash(_amount numeric, _as_of date)
 RETURNS public.opening_cash LANGUAGE sql SET search_path TO 'public','private'
AS $function$ SELECT * FROM private.set_opening_cash_impl(_amount,_as_of) $function$;
REVOKE ALL ON FUNCTION private.set_opening_cash_impl(numeric,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_opening_cash(numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_opening_cash_impl(numeric,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_opening_cash(numeric,date) TO authenticated;

-- Cash position at a date: opening (from as_of) + all cash in/out incl. financing, dated from as_of up to _at (capped at today)
CREATE OR REPLACE FUNCTION private.cash_position_at(_at date)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
  WITH o AS (SELECT amount, as_of FROM public.opening_cash WHERE singleton),
       d AS (SELECT LEAST(_at, private.jkt_today()) AS d)
  SELECT CASE WHEN o.as_of IS NULL OR o.as_of <= d.d THEN COALESCE(o.amount,0) ELSE 0 END
   + COALESCE((SELECT sum(CASE WHEN t.reference_type='AR_RECEIPT' THEN t.amount ELSE -t.amount END)
               FROM public.payment_transactions t WHERE NOT t.is_void AND t.transaction_date <= d.d
               AND (o.as_of IS NULL OR t.transaction_date >= o.as_of)),0)
   + COALESCE((SELECT sum(CASE WHEN i.transaction_type='Loan In' THEN i.amount ELSE -i.amount END)
               FROM public.investor_transactions i WHERE NOT i.is_void AND i.transaction_date <= d.d
               AND (o.as_of IS NULL OR i.transaction_date >= o.as_of)),0)
  FROM d LEFT JOIN o ON true
$function$;
REVOKE ALL ON FUNCTION private.cash_position_at(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cash_position_at(date) TO authenticated;

CREATE OR REPLACE FUNCTION private.report_summary_impl()
 RETURNS TABLE(revenue numeric, cost numeric, overhead numeric, net_profit numeric, pipeline_value numeric, ar_received numeric, ar_outstanding numeric, ap_paid numeric, ap_outstanding numeric, liabilities_to_revenue numeric, op_cash_in numeric, op_cash_out numeric, net_operating_cash numeric, financing_in numeric, financing_out numeric, net_financing numeric, jobs_total bigint, jobs_closed bigint, cash_position numeric, liquidity_ratio numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
BEGIN
  PERFORM private.assert_finance_actor();
  RETURN QUERY
  WITH ar AS (SELECT COALESCE(sum(amount),0) inv, COALESCE(sum(paid_amount),0) paid, COALESCE(sum(remaining_amount),0) rem FROM public.accounts_receivable WHERE NOT is_void AND status <> 'Draft'),
       ap AS (SELECT COALESCE(sum(invoice_amount),0) billed, COALESCE(sum(paid_amount),0) paid, COALESCE(sum(balance_remaining),0) rem FROM public.accounts_payable WHERE NOT is_void),
       oh AS (SELECT COALESCE(sum(amount),0) total FROM public.overhead_costs WHERE NOT is_void),
       pv AS (SELECT COALESCE(sum(f.estimated_selling),0) total FROM public.jobs j JOIN public.job_financials f ON f.job_id=j.id WHERE NOT j.is_void AND j.status IN ('Pipeline','Active')),
       cf AS (SELECT COALESCE(sum(amount) FILTER (WHERE reference_type='AR_RECEIPT'),0) cin,
                     COALESCE(sum(amount) FILTER (WHERE reference_type IN ('AP_PAYMENT','OPERATIONAL_EXPENSE')),0) cout
              FROM public.payment_transactions WHERE NOT is_void AND transaction_date <= private.jkt_today()),
       fin AS (SELECT COALESCE(sum(amount) FILTER (WHERE transaction_type='Loan In'),0) fin_in,
                      COALESCE(sum(amount) FILTER (WHERE transaction_type='Repayment'),0) fin_out
               FROM public.investor_transactions WHERE NOT is_void),
       jb AS (SELECT count(*) total, count(*) FILTER (WHERE status='Closed') closed FROM public.jobs WHERE NOT is_void),
       cp AS (SELECT private.cash_position_at(private.jkt_today()) v)
  SELECT ar.inv, ap.billed, oh.total, ar.inv - ap.billed - oh.total, pv.total,
         ar.paid, ar.rem, ap.paid, ap.rem, CASE WHEN ar.inv > 0 THEN ap.rem / ar.inv END,
         cf.cin, cf.cout, cf.cin - cf.cout, fin.fin_in, fin.fin_out, fin.fin_in - fin.fin_out,
         jb.total, jb.closed,
         cp.v,
         CASE WHEN ap.rem > 0 THEN (cp.v + ar.rem) / ap.rem END
  FROM ar, ap, oh, pv, cf, fin, jb, cp;
END; $function$;

CREATE OR REPLACE FUNCTION private.report_balances_impl(_from date, _to date)
 RETURNS TABLE(month date, ar_outstanding numeric, ap_outstanding numeric, cash_position numeric, liquidity_ratio numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
BEGIN
  PERFORM private.assert_finance_actor();
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  RETURN QUERY
  WITH m AS (SELECT mo, (mo + interval '1 month' - interval '1 day')::date AS me
             FROM generate_series(date_trunc('month',_from)::date, date_trunc('month',_to)::date, interval '1 month') AS g(mo)),
  b AS (
  SELECT m.mo::date AS mo,
    COALESCE((SELECT sum(a.amount) FROM public.accounts_receivable a WHERE NOT a.is_void AND a.status<>'Draft' AND a.invoice_date<=m.me),0)
    - COALESCE((SELECT sum(p.amount) FROM public.ar_payments p JOIN public.accounts_receivable a ON a.id=p.ar_id
                WHERE NOT p.is_void AND NOT a.is_void AND a.status<>'Draft' AND p.payment_date<=m.me),0) AS ar_o,
    COALESCE((SELECT sum(a.invoice_amount) FROM public.accounts_payable a WHERE NOT a.is_void AND a.bill_date<=m.me),0)
    - COALESCE((SELECT sum(p.amount) FROM public.ap_payments p JOIN public.accounts_payable a ON a.id=p.ap_id
                WHERE NOT p.is_void AND NOT a.is_void AND p.payment_date<=m.me),0) AS ap_o,
    private.cash_position_at(m.me) AS cash
  FROM m)
  SELECT b.mo, b.ar_o, b.ap_o, b.cash, CASE WHEN b.ap_o > 0 THEN (b.cash + b.ar_o) / b.ap_o END
  FROM b ORDER BY 1;
END $function$;