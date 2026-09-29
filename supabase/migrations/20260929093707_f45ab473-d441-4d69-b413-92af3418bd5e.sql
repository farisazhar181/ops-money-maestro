-- ===== Shared Jakarta date =====
CREATE OR REPLACE FUNCTION private.jkt_today() RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date $$;
REVOKE ALL ON FUNCTION private.jkt_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.jkt_today() TO authenticated, service_role;

ALTER TABLE public.jobs ALTER COLUMN order_date SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;
ALTER TABLE public.accounts_receivable ALTER COLUMN invoice_date SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;
ALTER TABLE public.payment_transactions ALTER COLUMN transaction_date SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;
ALTER TABLE public.overhead_costs ALTER COLUMN cost_date SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;
ALTER TABLE public.investor_transactions ALTER COLUMN transaction_date SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;

CREATE OR REPLACE FUNCTION public.sync_ar_status()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','private'
AS $function$
BEGIN
  IF NEW.status <> 'Draft'::public.ar_status THEN
    NEW.status := CASE WHEN NEW.paid_amount >= NEW.amount AND NEW.amount > 0 THEN 'Paid'::public.ar_status
                       WHEN NEW.paid_amount > 0 THEN 'Partially Paid'::public.ar_status
                       WHEN NEW.due_date < private.jkt_today() THEN 'Overdue'::public.ar_status
                       ELSE 'Issued'::public.ar_status END;
  END IF;
  RETURN NEW;
END; $function$;

-- ===== AP bill date =====
ALTER TABLE public.accounts_payable ADD COLUMN bill_date date;
ALTER TABLE public.accounts_payable DISABLE TRIGGER ap_activity;
UPDATE public.accounts_payable SET bill_date = (created_at AT TIME ZONE 'Asia/Jakarta')::date WHERE bill_date IS NULL;
ALTER TABLE public.accounts_payable ENABLE TRIGGER ap_activity;
ALTER TABLE public.accounts_payable ALTER COLUMN bill_date SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;
ALTER TABLE public.accounts_payable ALTER COLUMN bill_date SET NOT NULL;

-- ===== Job actuals: null means not set =====
ALTER TABLE public.job_financials ALTER COLUMN actual_selling DROP DEFAULT;
ALTER TABLE public.job_financials ALTER COLUMN actual_buying DROP DEFAULT;
ALTER TABLE public.job_financials ALTER COLUMN actual_selling DROP NOT NULL;
ALTER TABLE public.job_financials ALTER COLUMN actual_buying DROP NOT NULL;
UPDATE public.job_financials f SET actual_selling = NULLIF(f.actual_selling,0), actual_buying = NULLIF(f.actual_buying,0)
  FROM public.jobs j WHERE j.id = f.job_id AND j.status <> 'Closed';
DROP POLICY IF EXISTS "job financials update" ON public.job_financials;
REVOKE UPDATE, DELETE ON public.job_financials FROM authenticated, anon;

CREATE OR REPLACE FUNCTION private.job_financials_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Direct client inserts may set estimates only; actuals are set at closing through close_job_financials.
  IF current_user IN ('authenticated','anon') THEN NEW.actual_selling := NULL; NEW.actual_buying := NULL; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER job_financials_insert_guard BEFORE INSERT ON public.job_financials FOR EACH ROW EXECUTE FUNCTION private.job_financials_insert_guard();

ALTER TABLE public.jobs ADD COLUMN closed_at timestamptz;
ALTER TABLE public.jobs DISABLE TRIGGER jobs_activity;
UPDATE public.jobs j SET closed_at = COALESCE(f.updated_at, j.updated_at) FROM public.job_financials f WHERE f.job_id = j.id AND j.status = 'Closed';
ALTER TABLE public.jobs ENABLE TRIGGER jobs_activity;

CREATE OR REPLACE FUNCTION private.job_close_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_s numeric; v_b numeric;
BEGIN
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
END; $$;
CREATE TRIGGER jobs_close_guard BEFORE INSERT OR UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION private.job_close_guard();

CREATE OR REPLACE FUNCTION private.close_job_financials_impl(_job_id uuid, _actual_selling numeric, _actual_buying numeric, _status job_status)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_user uuid:=private.assert_finance_actor(); v_old jsonb; v_new jsonb;
BEGIN
  IF _actual_selling < 0 OR _actual_buying < 0 THEN RAISE EXCEPTION 'Financial amounts cannot be negative'; END IF;
  IF _status = 'Closed' AND (_actual_selling IS NULL OR _actual_selling <= 0 OR _actual_buying IS NULL OR _actual_buying <= 0) THEN
    RAISE EXCEPTION 'Actual selling and actual buying must both be greater than zero to close a job';
  END IF;
  SELECT jsonb_build_object('status',j.status,'actual_selling',f.actual_selling,'actual_buying',f.actual_buying)
  INTO v_old FROM public.jobs j LEFT JOIN public.job_financials f ON f.job_id=j.id WHERE j.id=_job_id FOR UPDATE OF j;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id=_job_id AND is_void) THEN RAISE EXCEPTION 'Voided jobs cannot be edited'; END IF;
  INSERT INTO public.job_financials(job_id,actual_selling,actual_buying) VALUES(_job_id,_actual_selling,_actual_buying)
  ON CONFLICT(job_id) DO UPDATE SET actual_selling=EXCLUDED.actual_selling,actual_buying=EXCLUDED.actual_buying,updated_at=now();
  UPDATE public.jobs SET status=_status,updated_at=now() WHERE id=_job_id;
  v_new:=jsonb_build_object('status',_status,'actual_selling',_actual_selling,'actual_buying',_actual_buying);
  PERFORM private.log_change(v_user,'financials_edited','job_financials',_job_id,_job_id,'Updated actual selling, buying, and job stage',v_old,v_new);
END; $function$;

-- ===== Payment date rules =====
CREATE OR REPLACE FUNCTION private.record_ap_payment_impl(_ap_id uuid, _payment_date date, _amount numeric)
 RETURNS accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_ap public.accounts_payable; v_user uuid:=private.assert_finance_actor(); v_tx uuid;
BEGIN
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF _payment_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  SELECT * INTO v_ap FROM public.accounts_payable WHERE id=_ap_id FOR UPDATE;
  IF NOT FOUND OR v_ap.is_void THEN RAISE EXCEPTION 'Active vendor cost not found'; END IF;
  IF _payment_date < v_ap.bill_date THEN RAISE EXCEPTION 'Payment date cannot be earlier than the bill date (%)', v_ap.bill_date; END IF;
  IF _amount>v_ap.balance_remaining THEN RAISE EXCEPTION 'Payment exceeds the remaining balance'; END IF;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by) VALUES('AP_PAYMENT',_ap_id,_payment_date,_amount,'Bank Transfer','Vendor payment',v_user) RETURNING id INTO v_tx;
  INSERT INTO public.ap_payments(ap_id,payment_date,amount,created_by,payment_transaction_id) VALUES(_ap_id,_payment_date,_amount,v_user,v_tx);
  UPDATE public.accounts_payable SET paid_amount=paid_amount+_amount,updated_at=now() WHERE id=_ap_id RETURNING * INTO v_ap;
  PERFORM private.log_change(v_user,'paid','accounts_payable',_ap_id,v_ap.job_id,'Recorded vendor payment of IDR '||trim(to_char(_amount,'FM999G999G999G999G990')),NULL,jsonb_build_object('payment_transaction_id',v_tx,'amount',_amount));
  RETURN v_ap;
END; $function$;

CREATE OR REPLACE FUNCTION private.record_ar_payment_impl(_ar_id uuid, _payment_date date, _amount numeric)
 RETURNS accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_ar public.accounts_receivable; v_user uuid:=private.assert_finance_actor(); v_tx uuid;
BEGIN
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF _payment_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id=_ar_id FOR UPDATE;
  IF NOT FOUND OR v_ar.is_void THEN RAISE EXCEPTION 'Active invoice not found'; END IF;
  IF _payment_date < v_ar.invoice_date THEN RAISE EXCEPTION 'Payment date cannot be earlier than the invoice date (%)', v_ar.invoice_date; END IF;
  IF _amount>v_ar.remaining_amount THEN RAISE EXCEPTION 'Payment exceeds the remaining balance'; END IF;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by) VALUES('AR_RECEIPT',_ar_id,_payment_date,_amount,'Bank Transfer','Customer receipt',v_user) RETURNING id INTO v_tx;
  INSERT INTO public.ar_payments(ar_id,payment_date,amount,created_by,payment_transaction_id) VALUES(_ar_id,_payment_date,_amount,v_user,v_tx);
  UPDATE public.accounts_receivable SET paid_amount=paid_amount+_amount,updated_at=now() WHERE id=_ar_id RETURNING * INTO v_ar;
  PERFORM private.log_change(v_user,'paid','accounts_receivable',_ar_id,v_ar.job_id,'Recorded customer receipt of IDR '||trim(to_char(_amount,'FM999G999G999G999G990')),NULL,jsonb_build_object('payment_transaction_id',v_tx,'amount',_amount));
  RETURN v_ar;
END; $function$;

CREATE OR REPLACE FUNCTION private.edit_cash_transaction_impl(_id uuid, _date date, _amount numeric, _method payment_method, _notes text)
 RETURNS payment_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_row public.payment_transactions; v_user uuid:=private.assert_finance_actor(); v_old jsonb; v_delta numeric; v_ap uuid; v_ar uuid;
BEGIN
  SELECT * INTO v_row FROM public.payment_transactions WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Voided transactions cannot be edited'; END IF;
  IF v_row.reference_type='OPERATIONAL_EXPENSE' THEN RAISE EXCEPTION 'Overhead payments are corrected from their overhead entry'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_old:=to_jsonb(v_row); v_delta:=_amount-v_row.amount;
  IF v_row.reference_type='AP_PAYMENT' THEN
    SELECT ap_id INTO v_ap FROM public.ap_payments WHERE payment_transaction_id=_id AND NOT is_void FOR UPDATE;
    IF v_ap IS NULL THEN RAISE EXCEPTION 'Linked vendor payment not found'; END IF;
    IF _date < (SELECT bill_date FROM public.accounts_payable WHERE id=v_ap) THEN RAISE EXCEPTION 'Payment date cannot be earlier than the bill date'; END IF;
    IF v_delta > (SELECT balance_remaining FROM public.accounts_payable WHERE id=v_ap) THEN RAISE EXCEPTION 'Payment exceeds remaining balance'; END IF;
    UPDATE public.ap_payments SET payment_date=_date,amount=_amount,updated_at=now() WHERE payment_transaction_id=_id;
    UPDATE public.accounts_payable SET paid_amount=paid_amount+v_delta,updated_at=now() WHERE id=v_ap;
  ELSIF v_row.reference_type='AR_RECEIPT' THEN
    SELECT ar_id INTO v_ar FROM public.ar_payments WHERE payment_transaction_id=_id AND NOT is_void FOR UPDATE;
    IF v_ar IS NULL THEN RAISE EXCEPTION 'Linked customer receipt not found'; END IF;
    IF _date < (SELECT invoice_date FROM public.accounts_receivable WHERE id=v_ar) THEN RAISE EXCEPTION 'Payment date cannot be earlier than the invoice date'; END IF;
    IF v_delta > (SELECT remaining_amount FROM public.accounts_receivable WHERE id=v_ar) THEN RAISE EXCEPTION 'Receipt exceeds remaining balance'; END IF;
    UPDATE public.ar_payments SET payment_date=_date,amount=_amount,updated_at=now() WHERE payment_transaction_id=_id;
    UPDATE public.accounts_receivable SET paid_amount=paid_amount+v_delta,updated_at=now() WHERE id=v_ar;
  END IF;
  UPDATE public.payment_transactions SET transaction_date=_date,amount=_amount,payment_method=_method,notes=_notes,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','payment_transactions',_id,NULL,'Corrected cash-flow transaction',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $function$;

-- edit_ap gains an optional bill date
DROP FUNCTION public.edit_ap(uuid,uuid,text,numeric,integer,date);
DROP FUNCTION private.edit_ap_impl(uuid,uuid,text,numeric,integer,date);
CREATE FUNCTION private.edit_ap_impl(_id uuid, _vendor_id uuid, _description text, _amount numeric, _terms integer, _due_date date, _bill_date date DEFAULT NULL)
 RETURNS accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_row public.accounts_payable; v_user uuid:=private.assert_finance_actor(); v_old jsonb; v_bill date;
BEGIN
  SELECT * INTO v_row FROM public.accounts_payable WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor cost not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Voided costs cannot be edited'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF _amount < v_row.paid_amount THEN RAISE EXCEPTION 'Corrected amount cannot be less than amount already paid'; END IF;
  v_bill := COALESCE(_bill_date, v_row.bill_date);
  IF EXISTS (SELECT 1 FROM public.ap_payments WHERE ap_id=_id AND NOT is_void AND payment_date < v_bill) THEN
    RAISE EXCEPTION 'Bill date cannot be later than an existing payment date';
  END IF;
  v_old:=to_jsonb(v_row);
  UPDATE public.accounts_payable SET vendor_id=_vendor_id,item_cost_description=_description,invoice_amount=_amount,payment_terms_days=_terms,due_date=_due_date,bill_date=v_bill,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','accounts_payable',_id,v_row.job_id,'Corrected vendor cost',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $function$;
CREATE FUNCTION public.edit_ap(_id uuid, _vendor_id uuid, _description text, _amount numeric, _terms integer, _due_date date, _bill_date date DEFAULT NULL)
 RETURNS accounts_payable LANGUAGE sql SET search_path TO 'public','private'
AS $function$ SELECT private.edit_ap_impl(_id,_vendor_id,_description,_amount,_terms,_due_date,_bill_date) $function$;
REVOKE ALL ON FUNCTION private.edit_ap_impl(uuid,uuid,text,numeric,integer,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_ap(uuid,uuid,text,numeric,integer,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.edit_ap_impl(uuid,uuid,text,numeric,integer,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_ap(uuid,uuid,text,numeric,integer,date,date) TO authenticated, service_role;

-- ===== Overhead payments: one linked cash transaction, no free-form expenses =====
DROP POLICY IF EXISTS "pt insert" ON public.payment_transactions;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM authenticated, anon;

ALTER TABLE public.overhead_costs ADD COLUMN payment_transaction_id uuid REFERENCES public.payment_transactions(id);
CREATE UNIQUE INDEX payment_transactions_one_active_overhead ON public.payment_transactions(reference_id)
  WHERE reference_type = 'OPERATIONAL_EXPENSE' AND NOT is_void;

CREATE OR REPLACE FUNCTION private.payment_reference_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reference_type = 'OPERATIONAL_EXPENSE' AND NOT NEW.is_void AND NOT EXISTS (
       SELECT 1 FROM public.overhead_costs WHERE id = NEW.reference_id AND NOT is_void) THEN
    RAISE EXCEPTION 'An expense payment must be linked to an active overhead entry';
  END IF;
  IF NEW.reference_type IN ('AP_PAYMENT','AR_RECEIPT') AND NEW.reference_id IS NULL THEN
    RAISE EXCEPTION 'A payment must be linked to its bill or invoice';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payment_reference_guard BEFORE INSERT ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION private.payment_reference_guard();

CREATE FUNCTION private.pay_overhead_impl(_id uuid, _payment_date date, _method payment_method)
 RETURNS overhead_costs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_row public.overhead_costs; v_user uuid:=auth.uid(); v_tx uuid;
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage overhead costs'; END IF;
  IF _payment_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  SELECT * INTO v_row FROM public.overhead_costs WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR v_row.is_void THEN RAISE EXCEPTION 'Active overhead cost not found'; END IF;
  IF v_row.payment_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.payment_transactions WHERE id=v_row.payment_transaction_id AND NOT is_void) THEN
    RAISE EXCEPTION 'This overhead cost is already paid';
  END IF;
  IF _payment_date < v_row.cost_date THEN RAISE EXCEPTION 'Payment date cannot be earlier than the cost date (%)', v_row.cost_date; END IF;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by)
  VALUES('OPERATIONAL_EXPENSE',_id,_payment_date,v_row.amount,COALESCE(_method,'Bank Transfer'),'Overhead: '||v_row.note,v_user) RETURNING id INTO v_tx;
  UPDATE public.overhead_costs SET payment_transaction_id=v_tx,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'paid','overhead_costs',_id,NULL,'Paid overhead cost',NULL,jsonb_build_object('payment_transaction_id',v_tx,'amount',v_row.amount));
  RETURN v_row;
END; $function$;
CREATE FUNCTION public.pay_overhead(_id uuid, _payment_date date, _method payment_method DEFAULT 'Bank Transfer')
 RETURNS overhead_costs LANGUAGE sql SET search_path TO 'public','private'
AS $function$ SELECT private.pay_overhead_impl(_id,_payment_date,_method) $function$;
REVOKE ALL ON FUNCTION private.pay_overhead_impl(uuid,date,payment_method) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_overhead(uuid,date,payment_method) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pay_overhead_impl(uuid,date,payment_method) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_overhead(uuid,date,payment_method) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.void_overhead_impl(_id uuid, _reason text)
 RETURNS overhead_costs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_row public.overhead_costs; v_user uuid:=auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage overhead costs'; END IF;
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  UPDATE public.overhead_costs SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id AND NOT is_void RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active overhead cost not found'; END IF;
  UPDATE public.payment_transactions SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now()
   WHERE reference_type='OPERATIONAL_EXPENSE' AND reference_id=_id AND NOT is_void;
  PERFORM private.log_change(v_user,'voided','overhead_costs',_id,NULL,'Voided overhead cost: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION private.edit_overhead_impl(_id uuid, _date date, _type overhead_type, _amount numeric, _note text)
 RETURNS overhead_costs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_row public.overhead_costs; v_user uuid:=auth.uid(); v_old jsonb; v_paid date;
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage overhead costs'; END IF;
  SELECT * INTO v_row FROM public.overhead_costs WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR v_row.is_void THEN RAISE EXCEPTION 'Active overhead cost not found'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  SELECT transaction_date INTO v_paid FROM public.payment_transactions WHERE reference_type='OPERATIONAL_EXPENSE' AND reference_id=_id AND NOT is_void;
  IF v_paid IS NOT NULL AND _date > v_paid THEN RAISE EXCEPTION 'Cost date cannot be later than its payment date'; END IF;
  v_old:=to_jsonb(v_row);
  UPDATE public.overhead_costs SET cost_date=_date,cost_type=_type,amount=_amount,note=_note,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  UPDATE public.payment_transactions SET amount=_amount,notes='Overhead: '||_note,updated_at=now()
   WHERE reference_type='OPERATIONAL_EXPENSE' AND reference_id=_id AND NOT is_void;
  PERFORM private.log_change(v_user,'edited','overhead_costs',_id,NULL,'Corrected overhead cost',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION private.void_cash_transaction_impl(_id uuid, _reason text)
 RETURNS payment_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $function$
DECLARE v_row public.payment_transactions; v_user uuid:=private.assert_finance_actor(); v_ap uuid; v_ar uuid; v_job uuid;
BEGIN
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  SELECT * INTO v_row FROM public.payment_transactions WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Transaction is already voided'; END IF;
  IF v_row.reference_type='AP_PAYMENT' THEN
    SELECT ap_id INTO v_ap FROM public.ap_payments WHERE payment_transaction_id=_id AND NOT is_void FOR UPDATE;
    IF v_ap IS NULL THEN RAISE EXCEPTION 'Linked vendor payment not found'; END IF;
    UPDATE public.ap_payments SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE payment_transaction_id=_id;
    UPDATE public.accounts_payable SET paid_amount=paid_amount-v_row.amount,updated_at=now() WHERE id=v_ap RETURNING job_id INTO v_job;
  ELSIF v_row.reference_type='AR_RECEIPT' THEN
    SELECT ar_id INTO v_ar FROM public.ar_payments WHERE payment_transaction_id=_id AND NOT is_void FOR UPDATE;
    IF v_ar IS NULL THEN RAISE EXCEPTION 'Linked customer receipt not found'; END IF;
    UPDATE public.ar_payments SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE payment_transaction_id=_id;
    UPDATE public.accounts_receivable SET paid_amount=paid_amount-v_row.amount,updated_at=now() WHERE id=v_ar RETURNING job_id INTO v_job;
  ELSIF v_row.reference_type='OPERATIONAL_EXPENSE' THEN
    UPDATE public.overhead_costs SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now()
     WHERE id=v_row.reference_id AND NOT is_void;
  END IF;
  UPDATE public.payment_transactions SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'voided','payment_transactions',_id,v_job,'Voided cash-flow transaction: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $function$;

-- ===== Master data: Finance can create/edit; referenced records cannot be deleted =====
DROP POLICY IF EXISTS "customers insert" ON public.customers;
DROP POLICY IF EXISTS "customers update" ON public.customers;
DROP POLICY IF EXISTS "vendors insert" ON public.subcontractors_vendors;
DROP POLICY IF EXISTS "vendors update" ON public.subcontractors_vendors;
CREATE POLICY "customers insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations'))) WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
CREATE POLICY "vendors insert" ON public.subcontractors_vendors FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
CREATE POLICY "vendors update" ON public.subcontractors_vendors FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations'))) WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));

ALTER TABLE public.jobs DROP CONSTRAINT jobs_customer_id_fkey, ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.accounts_receivable DROP CONSTRAINT accounts_receivable_customer_id_fkey, ADD CONSTRAINT accounts_receivable_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.accounts_payable DROP CONSTRAINT accounts_payable_vendor_id_fkey, ADD CONSTRAINT accounts_payable_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.subcontractors_vendors(id) ON DELETE RESTRICT;

-- ===== Audit gaps: master data changes and job estimate entry =====
CREATE OR REPLACE FUNCTION private.log_master_data() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_name text; v_label text := CASE WHEN TG_TABLE_NAME='customers' THEN 'customer' ELSE 'vendor' END;
BEGIN
  v_name := CASE WHEN TG_TABLE_NAME='customers' THEN COALESCE(NEW.company_name, OLD.company_name) ELSE COALESCE(NEW.vendor_name, OLD.vendor_name) END;
  PERFORM private.log_change(auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'edited' ELSE 'deleted' END,
    TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), NULL,
    initcap(CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END)||' '||v_label||' '||v_name,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER customers_activity AFTER INSERT OR UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION private.log_master_data();
CREATE TRIGGER vendors_activity AFTER INSERT OR UPDATE OR DELETE ON public.subcontractors_vendors FOR EACH ROW EXECUTE FUNCTION private.log_master_data();

CREATE OR REPLACE FUNCTION private.log_job_financials_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    PERFORM private.log_change(auth.uid(),'created','job_financials',NEW.job_id,NEW.job_id,'Set job estimates',NULL,to_jsonb(NEW));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER job_financials_activity AFTER INSERT ON public.job_financials FOR EACH ROW EXECUTE FUNCTION private.log_job_financials_insert();

-- ===== Reporting: one source of truth, Owner/Finance only =====
CREATE FUNCTION private.report_summary_impl()
RETURNS TABLE(revenue numeric, cost numeric, overhead numeric, net_profit numeric, pipeline_value numeric,
  ar_received numeric, ar_outstanding numeric, ap_paid numeric, ap_outstanding numeric, liabilities_to_revenue numeric,
  op_cash_in numeric, op_cash_out numeric, net_operating_cash numeric, financing_in numeric, financing_out numeric, net_financing numeric,
  jobs_total bigint, jobs_closed bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  PERFORM private.assert_finance_actor();
  RETURN QUERY
  WITH ar AS (SELECT COALESCE(sum(amount),0) inv, COALESCE(sum(paid_amount),0) paid, COALESCE(sum(remaining_amount),0) rem FROM public.accounts_receivable WHERE NOT is_void AND status <> 'Draft'),
       ap AS (SELECT COALESCE(sum(invoice_amount),0) billed, COALESCE(sum(paid_amount),0) paid, COALESCE(sum(balance_remaining),0) rem FROM public.accounts_payable WHERE NOT is_void),
       oh AS (SELECT COALESCE(sum(amount),0) total FROM public.overhead_costs WHERE NOT is_void),
       pv AS (SELECT COALESCE(sum(f.estimated_selling),0) total FROM public.jobs j JOIN public.job_financials f ON f.job_id=j.id WHERE NOT j.is_void AND j.status IN ('Pipeline','Active')),
       cf AS (SELECT COALESCE(sum(amount) FILTER (WHERE reference_type='AR_RECEIPT'),0) cin,
                     COALESCE(sum(amount) FILTER (WHERE reference_type IN ('AP_PAYMENT','OPERATIONAL_EXPENSE')),0) cout
              FROM public.payment_transactions WHERE NOT is_void),
       fin AS (SELECT COALESCE(sum(amount) FILTER (WHERE transaction_type='Loan In'),0) fin_in,
                      COALESCE(sum(amount) FILTER (WHERE transaction_type='Repayment'),0) fin_out
               FROM public.investor_transactions WHERE NOT is_void),
       jb AS (SELECT count(*) total, count(*) FILTER (WHERE status='Closed') closed FROM public.jobs WHERE NOT is_void)
  SELECT ar.inv, ap.billed, oh.total, ar.inv - ap.billed - oh.total, pv.total,
         ar.paid, ar.rem, ap.paid, ap.rem, CASE WHEN ar.inv > 0 THEN ap.rem / ar.inv END,
         cf.cin, cf.cout, cf.cin - cf.cout, fin.fin_in, fin.fin_out, fin.fin_in - fin.fin_out,
         jb.total, jb.closed
  FROM ar, ap, oh, pv, cf, fin, jb;
END; $$;

CREATE FUNCTION private.report_monthly_impl(_from date, _to date)
RETURNS TABLE(month date, revenue numeric, cost numeric, overhead numeric, net_profit numeric,
  closed_jobs bigint, closed_selling numeric, closed_buying numeric, closed_margin numeric,
  op_cash_in numeric, op_cash_out numeric, financing_in numeric, financing_out numeric, jobs_created bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  PERFORM private.assert_finance_actor();
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  RETURN QUERY
  WITH m AS (SELECT generate_series(date_trunc('month',_from)::date, date_trunc('month',_to)::date, interval '1 month')::date AS mo),
  rev AS (SELECT date_trunc('month',invoice_date)::date mo, sum(amount) v FROM public.accounts_receivable WHERE NOT is_void AND status <> 'Draft' GROUP BY 1),
  cst AS (SELECT date_trunc('month',bill_date)::date mo, sum(invoice_amount) v FROM public.accounts_payable WHERE NOT is_void GROUP BY 1),
  oh AS (SELECT date_trunc('month',cost_date)::date mo, sum(amount) v FROM public.overhead_costs WHERE NOT is_void GROUP BY 1),
  cj AS (SELECT date_trunc('month',(j.closed_at AT TIME ZONE 'Asia/Jakarta'))::date mo, count(*) n, sum(f.actual_selling) s, sum(f.actual_buying) b
         FROM public.jobs j JOIN public.job_financials f ON f.job_id=j.id
         WHERE NOT j.is_void AND j.status='Closed' AND j.closed_at IS NOT NULL AND f.actual_selling IS NOT NULL AND f.actual_buying IS NOT NULL GROUP BY 1),
  cf AS (SELECT date_trunc('month',transaction_date)::date mo,
                sum(amount) FILTER (WHERE reference_type='AR_RECEIPT') cin,
                sum(amount) FILTER (WHERE reference_type IN ('AP_PAYMENT','OPERATIONAL_EXPENSE')) cout
         FROM public.payment_transactions WHERE NOT is_void GROUP BY 1),
  fin AS (SELECT date_trunc('month',transaction_date)::date mo,
                 sum(amount) FILTER (WHERE transaction_type='Loan In') fi, sum(amount) FILTER (WHERE transaction_type='Repayment') fo
          FROM public.investor_transactions WHERE NOT is_void GROUP BY 1),
  jc AS (SELECT date_trunc('month',order_date)::date mo, count(*) n FROM public.jobs WHERE NOT is_void GROUP BY 1)
  SELECT m.mo, COALESCE(rev.v,0), COALESCE(cst.v,0), COALESCE(oh.v,0), COALESCE(rev.v,0)-COALESCE(cst.v,0)-COALESCE(oh.v,0),
         COALESCE(cj.n,0), COALESCE(cj.s,0), COALESCE(cj.b,0), COALESCE(cj.s,0)-COALESCE(cj.b,0),
         COALESCE(cf.cin,0), COALESCE(cf.cout,0), COALESCE(fin.fi,0), COALESCE(fin.fo,0), COALESCE(jc.n,0)
  FROM m LEFT JOIN rev ON rev.mo=m.mo LEFT JOIN cst ON cst.mo=m.mo LEFT JOIN oh ON oh.mo=m.mo LEFT JOIN cj ON cj.mo=m.mo
         LEFT JOIN cf ON cf.mo=m.mo LEFT JOIN fin ON fin.mo=m.mo LEFT JOIN jc ON jc.mo=m.mo
  ORDER BY m.mo;
END; $$;

CREATE FUNCTION private.report_aging_impl(_kind text)
RETURNS TABLE(id uuid, reference text, party text, job_sheet_no text, doc_date date, due_date date,
  amount numeric, paid numeric, balance numeric, days_overdue integer, bucket text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_today date := private.jkt_today();
BEGIN
  PERFORM private.assert_finance_actor();
  IF _kind = 'ar' THEN
    RETURN QUERY
    SELECT a.id, a.invoice_no, c.company_name, j.job_sheet_no, a.invoice_date, a.due_date, a.amount, a.paid_amount, a.remaining_amount,
           GREATEST(v_today - a.due_date, 0),
           CASE WHEN a.due_date IS NULL OR v_today - a.due_date <= 0 THEN 'Current' WHEN v_today - a.due_date <= 30 THEN '1–30 days'
                WHEN v_today - a.due_date <= 60 THEN '31–60 days' WHEN v_today - a.due_date <= 90 THEN '61–90 days' ELSE '90+ days' END
    FROM public.accounts_receivable a LEFT JOIN public.customers c ON c.id=a.customer_id LEFT JOIN public.jobs j ON j.id=a.job_id
    WHERE NOT a.is_void AND a.status <> 'Draft' AND a.remaining_amount > 0 ORDER BY a.due_date NULLS LAST;
  ELSIF _kind = 'ap' THEN
    RETURN QUERY
    SELECT a.id, a.item_cost_description, v.vendor_name, j.job_sheet_no, a.bill_date, a.due_date, a.invoice_amount, a.paid_amount, a.balance_remaining,
           CASE WHEN a.due_date IS NULL THEN 0 ELSE GREATEST(v_today - a.due_date, 0) END,
           CASE WHEN a.due_date IS NULL OR v_today - a.due_date <= 0 THEN 'Current' WHEN v_today - a.due_date <= 30 THEN '1–30 days'
                WHEN v_today - a.due_date <= 60 THEN '31–60 days' WHEN v_today - a.due_date <= 90 THEN '61–90 days' ELSE '90+ days' END
    FROM public.accounts_payable a LEFT JOIN public.subcontractors_vendors v ON v.id=a.vendor_id LEFT JOIN public.jobs j ON j.id=a.job_id
    WHERE NOT a.is_void AND a.balance_remaining > 0 ORDER BY a.due_date NULLS LAST;
  ELSE
    RAISE EXCEPTION 'Unknown aging report';
  END IF;
END; $$;

CREATE FUNCTION public.report_summary() RETURNS SETOF record LANGUAGE sql AS $$ SELECT 1 $$;
DROP FUNCTION public.report_summary();
CREATE FUNCTION public.report_summary()
RETURNS TABLE(revenue numeric, cost numeric, overhead numeric, net_profit numeric, pipeline_value numeric,
  ar_received numeric, ar_outstanding numeric, ap_paid numeric, ap_outstanding numeric, liabilities_to_revenue numeric,
  op_cash_in numeric, op_cash_out numeric, net_operating_cash numeric, financing_in numeric, financing_out numeric, net_financing numeric,
  jobs_total bigint, jobs_closed bigint)
LANGUAGE sql STABLE SET search_path = public, private AS $$ SELECT * FROM private.report_summary_impl() $$;
CREATE FUNCTION public.report_monthly(_from date, _to date)
RETURNS TABLE(month date, revenue numeric, cost numeric, overhead numeric, net_profit numeric,
  closed_jobs bigint, closed_selling numeric, closed_buying numeric, closed_margin numeric,
  op_cash_in numeric, op_cash_out numeric, financing_in numeric, financing_out numeric, jobs_created bigint)
LANGUAGE sql STABLE SET search_path = public, private AS $$ SELECT * FROM private.report_monthly_impl(_from,_to) $$;
CREATE FUNCTION public.report_aging(_kind text)
RETURNS TABLE(id uuid, reference text, party text, job_sheet_no text, doc_date date, due_date date,
  amount numeric, paid numeric, balance numeric, days_overdue integer, bucket text)
LANGUAGE sql STABLE SET search_path = public, private AS $$ SELECT * FROM private.report_aging_impl(_kind) $$;

REVOKE ALL ON FUNCTION private.report_summary_impl(), private.report_monthly_impl(date,date), private.report_aging_impl(text),
  public.report_summary(), public.report_monthly(date,date), public.report_aging(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.report_summary_impl(), private.report_monthly_impl(date,date), private.report_aging_impl(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_summary(), public.report_monthly(date,date), public.report_aging(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.job_financials_insert_guard(), private.job_close_guard(), private.payment_reference_guard(),
  private.log_master_data(), private.log_job_financials_insert() FROM PUBLIC, anon;