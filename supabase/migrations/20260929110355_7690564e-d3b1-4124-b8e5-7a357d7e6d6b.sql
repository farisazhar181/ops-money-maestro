CREATE OR REPLACE FUNCTION private.report_balances_impl(_from date, _to date)
RETURNS TABLE(month date, ar_outstanding numeric, ap_outstanding numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','private' AS $$
BEGIN
  PERFORM private.assert_finance_actor();
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  RETURN QUERY
  WITH m AS (SELECT mo, (mo + interval '1 month' - interval '1 day')::date AS me
             FROM generate_series(date_trunc('month',_from)::date, date_trunc('month',_to)::date, interval '1 month') AS g(mo))
  SELECT m.mo::date,
    COALESCE((SELECT sum(a.amount) FROM public.accounts_receivable a WHERE NOT a.is_void AND a.status<>'Draft' AND a.invoice_date<=m.me),0)
    - COALESCE((SELECT sum(p.amount) FROM public.ar_payments p JOIN public.accounts_receivable a ON a.id=p.ar_id
                WHERE NOT p.is_void AND NOT a.is_void AND a.status<>'Draft' AND p.payment_date<=m.me),0),
    COALESCE((SELECT sum(a.invoice_amount) FROM public.accounts_payable a WHERE NOT a.is_void AND a.bill_date<=m.me),0)
    - COALESCE((SELECT sum(p.amount) FROM public.ap_payments p JOIN public.accounts_payable a ON a.id=p.ap_id
                WHERE NOT p.is_void AND NOT a.is_void AND p.payment_date<=m.me),0)
  FROM m ORDER BY 1;
END $$;

CREATE OR REPLACE FUNCTION private.report_top_parties_impl(_kind text, _from date, _to date, _limit integer)
RETURNS TABLE(party text, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','private' AS $$
BEGIN
  PERFORM private.assert_finance_actor();
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF _kind='customers' THEN
    RETURN QUERY SELECT COALESCE(c.company_name,'(No customer)'), sum(a.amount)
      FROM public.accounts_receivable a LEFT JOIN public.customers c ON c.id=a.customer_id
      WHERE NOT a.is_void AND a.status<>'Draft' AND a.invoice_date BETWEEN _from AND _to
      GROUP BY 1 ORDER BY 2 DESC LIMIT COALESCE(_limit,5);
  ELSIF _kind='vendors' THEN
    RETURN QUERY SELECT COALESCE(v.vendor_name,'(No vendor)'), sum(a.invoice_amount)
      FROM public.accounts_payable a LEFT JOIN public.subcontractors_vendors v ON v.id=a.vendor_id
      WHERE NOT a.is_void AND a.bill_date BETWEEN _from AND _to
      GROUP BY 1 ORDER BY 2 DESC LIMIT COALESCE(_limit,5);
  ELSE RAISE EXCEPTION 'Unknown ranking'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.report_balances(_from date, _to date)
RETURNS TABLE(month date, ar_outstanding numeric, ap_outstanding numeric)
LANGUAGE sql STABLE SET search_path TO 'public','private' AS $$ SELECT * FROM private.report_balances_impl(_from,_to) $$;
CREATE OR REPLACE FUNCTION public.report_top_parties(_kind text, _from date, _to date, _limit integer DEFAULT 5)
RETURNS TABLE(party text, total numeric)
LANGUAGE sql STABLE SET search_path TO 'public','private' AS $$ SELECT * FROM private.report_top_parties_impl(_kind,_from,_to,_limit) $$;

REVOKE ALL ON FUNCTION private.report_balances_impl(date,date), private.report_top_parties_impl(text,date,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.report_balances_impl(date,date), private.report_top_parties_impl(text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.report_balances(date,date), public.report_top_parties(text,date,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_balances(date,date), public.report_top_parties(text,date,date,integer) TO authenticated;