DROP FUNCTION public.report_summary();
DROP FUNCTION private.report_summary_impl();
CREATE FUNCTION private.report_summary_impl()
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
       jb AS (SELECT count(*) total, count(*) FILTER (WHERE status='Closed') closed FROM public.jobs WHERE NOT is_void)
  SELECT ar.inv, ap.billed, oh.total, ar.inv - ap.billed - oh.total, pv.total,
         ar.paid, ar.rem, ap.paid, ap.rem, CASE WHEN ar.inv > 0 THEN ap.rem / ar.inv END,
         cf.cin, cf.cout, cf.cin - cf.cout, fin.fin_in, fin.fin_out, fin.fin_in - fin.fin_out,
         jb.total, jb.closed,
         cf.cin - cf.cout,
         CASE WHEN ap.rem > 0 THEN (cf.cin - cf.cout + ar.rem) / ap.rem END
  FROM ar, ap, oh, pv, cf, fin, jb;
END; $function$;
CREATE FUNCTION public.report_summary()
 RETURNS TABLE(revenue numeric, cost numeric, overhead numeric, net_profit numeric, pipeline_value numeric, ar_received numeric, ar_outstanding numeric, ap_paid numeric, ap_outstanding numeric, liabilities_to_revenue numeric, op_cash_in numeric, op_cash_out numeric, net_operating_cash numeric, financing_in numeric, financing_out numeric, net_financing numeric, jobs_total bigint, jobs_closed bigint, cash_position numeric, liquidity_ratio numeric)
 LANGUAGE sql STABLE SET search_path TO 'public', 'private'
AS $function$ SELECT * FROM private.report_summary_impl() $function$;

DROP FUNCTION public.report_balances(date, date);
DROP FUNCTION private.report_balances_impl(date, date);
CREATE FUNCTION private.report_balances_impl(_from date, _to date)
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
    COALESCE((SELECT sum(CASE WHEN t.reference_type='AR_RECEIPT' THEN t.amount ELSE -t.amount END)
              FROM public.payment_transactions t WHERE NOT t.is_void AND t.transaction_date<=m.me),0) AS cash
  FROM m)
  SELECT b.mo, b.ar_o, b.ap_o, b.cash, CASE WHEN b.ap_o > 0 THEN (b.cash + b.ar_o) / b.ap_o END
  FROM b ORDER BY 1;
END $function$;
CREATE FUNCTION public.report_balances(_from date, _to date)
 RETURNS TABLE(month date, ar_outstanding numeric, ap_outstanding numeric, cash_position numeric, liquidity_ratio numeric)
 LANGUAGE sql STABLE SET search_path TO 'public', 'private'
AS $function$ SELECT * FROM private.report_balances_impl(_from,_to) $function$;

REVOKE ALL ON FUNCTION private.report_summary_impl() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.report_balances_impl(date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_balances(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.report_summary_impl() TO authenticated;
GRANT EXECUTE ON FUNCTION private.report_balances_impl(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_balances(date,date) TO authenticated;