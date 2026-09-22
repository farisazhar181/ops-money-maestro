-- Exact job lifecycle vocabulary.
ALTER TYPE public.job_status RENAME TO job_status_legacy;
CREATE TYPE public.job_status AS ENUM ('Pipeline', 'Active', 'Closed');

DROP FUNCTION public.close_job_financials(uuid,numeric,numeric,public.job_status_legacy);
DROP FUNCTION private.close_job_financials_impl(uuid,numeric,numeric,public.job_status_legacy);

ALTER TABLE public.jobs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.jobs ALTER COLUMN status TYPE public.job_status USING (
  CASE status::text
    WHEN 'Draft' THEN 'Pipeline'::public.job_status
    WHEN 'In Progress' THEN 'Active'::public.job_status
    WHEN 'Completed' THEN 'Closed'::public.job_status
    WHEN 'Cancelled' THEN 'Pipeline'::public.job_status
  END
);
ALTER TABLE public.jobs ALTER COLUMN status SET DEFAULT 'Pipeline'::public.job_status;
DROP TYPE public.job_status_legacy;

-- Soft-void metadata and editable-record timestamps.
ALTER TABLE public.jobs
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
  ADD COLUMN void_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.accounts_payable
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
  ADD COLUMN void_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.accounts_receivable
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
  ADD COLUMN void_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.payment_transactions
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
  ADD COLUMN void_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ap_payments
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
  ADD COLUMN void_reason text,
  ADD COLUMN payment_transaction_id uuid REFERENCES public.payment_transactions(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ar_payments
  ADD COLUMN is_void boolean NOT NULL DEFAULT false,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
  ADD COLUMN void_reason text,
  ADD COLUMN payment_transaction_id uuid REFERENCES public.payment_transactions(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.activity_log
  ADD COLUMN old_values jsonb,
  ADD COLUMN new_values jsonb;

-- Existing cancelled jobs become retained voided records.
UPDATE public.jobs
SET is_void = true,
    voided_at = COALESCE(updated_at, created_at),
    void_reason = 'Migrated from Cancelled status'
WHERE status = 'Pipeline' AND EXISTS (
  SELECT 1 FROM public.activity_log a
  WHERE a.entity_type = 'jobs' AND a.entity_id = jobs.id AND a.description ILIKE '%cancel%'
);

CREATE TYPE public.overhead_type AS ENUM ('Fixed', 'Variable');
CREATE TABLE public.overhead_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_date date NOT NULL DEFAULT current_date,
  cost_type public.overhead_type NOT NULL,
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  note text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  is_void boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id),
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.overhead_costs TO authenticated;
GRANT ALL ON public.overhead_costs TO service_role;
ALTER TABLE public.overhead_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overhead readable" ON public.overhead_costs FOR SELECT TO authenticated USING (
  private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance'))
);
CREATE POLICY "finance creates overhead" ON public.overhead_costs FOR INSERT TO authenticated WITH CHECK (
  private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'finance') AND created_by = auth.uid() AND NOT is_void
);

CREATE TYPE public.investor_transaction_type AS ENUM ('Loan In', 'Repayment');
CREATE TABLE public.investor_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date date NOT NULL DEFAULT current_date,
  transaction_type public.investor_transaction_type NOT NULL,
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  note text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  is_void boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id),
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.investor_transactions TO authenticated;
GRANT ALL ON public.investor_transactions TO service_role;
ALTER TABLE public.investor_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investor transactions readable" ON public.investor_transactions FOR SELECT TO authenticated USING (
  private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance'))
);
CREATE POLICY "finance creates investor transactions" ON public.investor_transactions FOR INSERT TO authenticated WITH CHECK (
  private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'finance') AND created_by = auth.uid() AND NOT is_void
);

-- All sensitive edits are forced through validated RPCs.
REVOKE UPDATE, DELETE ON public.jobs FROM authenticated;
REVOKE UPDATE, DELETE ON public.accounts_payable FROM authenticated;
REVOKE UPDATE, DELETE ON public.accounts_receivable FROM authenticated;
REVOKE UPDATE, DELETE ON public.payment_transactions FROM authenticated;
REVOKE UPDATE, DELETE ON public.overhead_costs FROM authenticated;
REVOKE UPDATE, DELETE ON public.investor_transactions FROM authenticated;
DROP POLICY IF EXISTS "jobs delete" ON public.jobs;
DROP POLICY IF EXISTS "ap delete" ON public.accounts_payable;
DROP POLICY IF EXISTS "ar delete" ON public.accounts_receivable;
DROP POLICY IF EXISTS "pt delete" ON public.payment_transactions;
DROP POLICY IF EXISTS "ap update" ON public.accounts_payable;
DROP POLICY IF EXISTS "ar update" ON public.accounts_receivable;
DROP POLICY IF EXISTS "pt update" ON public.payment_transactions;

CREATE OR REPLACE FUNCTION private.assert_finance_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT (private.has_role(v_user,'owner') OR private.has_role(v_user,'finance')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN v_user;
END; $$;
REVOKE ALL ON FUNCTION private.assert_finance_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.assert_finance_actor() TO authenticated;

CREATE OR REPLACE FUNCTION private.log_change(_user uuid,_action text,_entity text,_entity_id uuid,_job_id uuid,_description text,_old jsonb DEFAULT NULL,_new jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description,old_values,new_values)
  VALUES(_user,_action,_entity,_entity_id,_job_id,_description,_old,_new)
$$;
REVOKE ALL ON FUNCTION private.log_change(uuid,text,text,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.close_job_financials_impl(_job_id uuid,_actual_selling numeric,_actual_buying numeric,_status public.job_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid:=private.assert_finance_actor(); v_old jsonb; v_new jsonb;
BEGIN
  IF _actual_selling < 0 OR _actual_buying < 0 THEN RAISE EXCEPTION 'Financial amounts cannot be negative'; END IF;
  SELECT jsonb_build_object('status',j.status,'actual_selling',f.actual_selling,'actual_buying',f.actual_buying)
  INTO v_old FROM public.jobs j LEFT JOIN public.job_financials f ON f.job_id=j.id WHERE j.id=_job_id FOR UPDATE OF j;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id=_job_id AND is_void) THEN RAISE EXCEPTION 'Voided jobs cannot be edited'; END IF;
  INSERT INTO public.job_financials(job_id,actual_selling,actual_buying) VALUES(_job_id,_actual_selling,_actual_buying)
  ON CONFLICT(job_id) DO UPDATE SET actual_selling=EXCLUDED.actual_selling,actual_buying=EXCLUDED.actual_buying,updated_at=now();
  UPDATE public.jobs SET status=_status,updated_at=now() WHERE id=_job_id;
  v_new:=jsonb_build_object('status',_status,'actual_selling',_actual_selling,'actual_buying',_actual_buying);
  PERFORM private.log_change(v_user,'financials_edited','jobs',_job_id,_job_id,'Updated actual selling, buying, and job stage',v_old,v_new);
END; $$;
REVOKE ALL ON FUNCTION private.close_job_financials_impl(uuid,numeric,numeric,public.job_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.close_job_financials_impl(uuid,numeric,numeric,public.job_status) TO authenticated;
CREATE FUNCTION public.close_job_financials(_job_id uuid,_actual_selling numeric,_actual_buying numeric,_status public.job_status)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.close_job_financials_impl(_job_id,_actual_selling,_actual_buying,_status) $$;
REVOKE ALL ON FUNCTION public.close_job_financials(uuid,numeric,numeric,public.job_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_job_financials(uuid,numeric,numeric,public.job_status) TO authenticated;

CREATE OR REPLACE FUNCTION private.update_job_operations_impl(_job_id uuid,_customer_id uuid,_order_date date,_service_type text,_unit_type text,_quantity text,_volume_weight text,_origin text,_destination text)
RETURNS public.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_job public.jobs; v_user uuid:=auth.uid(); v_old jsonb;
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT (private.has_role(v_user,'owner') OR private.has_role(v_user,'operations')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF v_job.is_void THEN RAISE EXCEPTION 'Voided jobs cannot be edited'; END IF;
  IF v_job.status='Closed' AND private.has_role(v_user,'operations') THEN RAISE EXCEPTION 'Closed jobs cannot be edited by Operations'; END IF;
  v_old:=to_jsonb(v_job);
  UPDATE public.jobs SET customer_id=_customer_id,order_date=_order_date,service_type=_service_type,unit_type=_unit_type,quantity=_quantity,volume_weight=_volume_weight,origin=_origin,destination=_destination,updated_at=now() WHERE id=_job_id RETURNING * INTO v_job;
  PERFORM private.log_change(v_user,'edited','jobs',_job_id,_job_id,'Updated cargo and route details',v_old,to_jsonb(v_job));
  RETURN v_job;
END; $$;

CREATE OR REPLACE FUNCTION private.void_job_impl(_job_id uuid,_reason text)
RETURNS public.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_job public.jobs; v_user uuid:=private.assert_finance_actor();
BEGIN
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF v_job.is_void THEN RAISE EXCEPTION 'Job is already voided'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounts_payable WHERE job_id=_job_id AND NOT is_void) OR EXISTS(SELECT 1 FROM public.accounts_receivable WHERE job_id=_job_id AND NOT is_void) THEN RAISE EXCEPTION 'Void active AP and AR records first'; END IF;
  UPDATE public.jobs SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_job_id RETURNING * INTO v_job;
  PERFORM private.log_change(v_user,'voided','jobs',_job_id,_job_id,'Voided job: '||trim(_reason),NULL,to_jsonb(v_job));
  RETURN v_job;
END; $$;
REVOKE ALL ON FUNCTION private.void_job_impl(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.void_job_impl(uuid,text) TO authenticated;
CREATE FUNCTION public.void_job(_job_id uuid,_reason text) RETURNS public.jobs LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.void_job_impl(_job_id,_reason) $$;
REVOKE ALL ON FUNCTION public.void_job(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_job(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.edit_ap_impl(_id uuid,_vendor_id uuid,_description text,_amount numeric,_terms integer,_due_date date)
RETURNS public.accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.accounts_payable; v_user uuid:=private.assert_finance_actor(); v_old jsonb;
BEGIN
  SELECT * INTO v_row FROM public.accounts_payable WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor cost not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Voided costs cannot be edited'; END IF;
  IF _amount < v_row.paid_amount THEN RAISE EXCEPTION 'Corrected amount cannot be less than amount already paid'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_old:=to_jsonb(v_row);
  UPDATE public.accounts_payable SET vendor_id=_vendor_id,item_cost_description=_description,invoice_amount=_amount,payment_terms_days=_terms,due_date=_due_date,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','accounts_payable',_id,v_row.job_id,'Corrected vendor cost',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.void_ap_impl(_id uuid,_reason text)
RETURNS public.accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.accounts_payable; v_user uuid:=private.assert_finance_actor();
BEGIN
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  SELECT * INTO v_row FROM public.accounts_payable WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor cost not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Vendor cost is already voided'; END IF;
  IF EXISTS(SELECT 1 FROM public.ap_payments WHERE ap_id=_id AND NOT is_void) THEN RAISE EXCEPTION 'Void recorded payments first'; END IF;
  UPDATE public.accounts_payable SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'voided','accounts_payable',_id,v_row.job_id,'Voided vendor cost: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.edit_ar_impl(_id uuid,_invoice_no text,_customer_id uuid,_invoice_date date,_amount numeric,_terms integer,_due_date date)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.accounts_receivable; v_user uuid:=private.assert_finance_actor(); v_old jsonb;
BEGIN
  SELECT * INTO v_row FROM public.accounts_receivable WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Voided invoices cannot be edited'; END IF;
  IF _amount < v_row.paid_amount THEN RAISE EXCEPTION 'Corrected amount cannot be less than amount already received'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_old:=to_jsonb(v_row);
  UPDATE public.accounts_receivable SET invoice_no=_invoice_no,customer_id=_customer_id,invoice_date=_invoice_date,amount=_amount,payment_terms_days=_terms,due_date=_due_date,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','accounts_receivable',_id,v_row.job_id,'Corrected customer invoice',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.void_ar_impl(_id uuid,_reason text)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.accounts_receivable; v_user uuid:=private.assert_finance_actor();
BEGIN
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  SELECT * INTO v_row FROM public.accounts_receivable WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Invoice is already voided'; END IF;
  IF EXISTS(SELECT 1 FROM public.ar_payments WHERE ar_id=_id AND NOT is_void) THEN RAISE EXCEPTION 'Void recorded receipts first'; END IF;
  UPDATE public.accounts_receivable SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'voided','accounts_receivable',_id,v_row.job_id,'Voided customer invoice: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.edit_cash_transaction_impl(_id uuid,_date date,_amount numeric,_method public.payment_method,_notes text)
RETURNS public.payment_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.payment_transactions; v_user uuid:=private.assert_finance_actor(); v_old jsonb; v_delta numeric; v_ap uuid; v_ar uuid;
BEGIN
  SELECT * INTO v_row FROM public.payment_transactions WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_row.is_void THEN RAISE EXCEPTION 'Voided transactions cannot be edited'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_old:=to_jsonb(v_row); v_delta:=_amount-v_row.amount;
  IF v_row.reference_type='AP_PAYMENT' THEN
    SELECT ap_id INTO v_ap FROM public.ap_payments WHERE payment_transaction_id=_id AND NOT is_void FOR UPDATE;
    IF v_ap IS NULL THEN RAISE EXCEPTION 'Linked vendor payment not found'; END IF;
    IF v_delta > (SELECT balance_remaining FROM public.accounts_payable WHERE id=v_ap) THEN RAISE EXCEPTION 'Payment exceeds remaining balance'; END IF;
    UPDATE public.ap_payments SET payment_date=_date,amount=_amount,updated_at=now() WHERE payment_transaction_id=_id;
    UPDATE public.accounts_payable SET paid_amount=paid_amount+v_delta,updated_at=now() WHERE id=v_ap;
  ELSIF v_row.reference_type='AR_RECEIPT' THEN
    SELECT ar_id INTO v_ar FROM public.ar_payments WHERE payment_transaction_id=_id AND NOT is_void FOR UPDATE;
    IF v_ar IS NULL THEN RAISE EXCEPTION 'Linked customer receipt not found'; END IF;
    IF v_delta > (SELECT remaining_amount FROM public.accounts_receivable WHERE id=v_ar) THEN RAISE EXCEPTION 'Receipt exceeds remaining balance'; END IF;
    UPDATE public.ar_payments SET payment_date=_date,amount=_amount,updated_at=now() WHERE payment_transaction_id=_id;
    UPDATE public.accounts_receivable SET paid_amount=paid_amount+v_delta,updated_at=now() WHERE id=v_ar;
  END IF;
  UPDATE public.payment_transactions SET transaction_date=_date,amount=_amount,payment_method=_method,notes=_notes,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','payment_transactions',_id,NULL,'Corrected cash-flow transaction',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.void_cash_transaction_impl(_id uuid,_reason text)
RETURNS public.payment_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
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
  END IF;
  UPDATE public.payment_transactions SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'voided','payment_transactions',_id,v_job,'Voided cash-flow transaction: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.edit_overhead_impl(_id uuid,_date date,_type public.overhead_type,_amount numeric,_note text)
RETURNS public.overhead_costs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.overhead_costs; v_user uuid:=auth.uid(); v_old jsonb;
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage overhead costs'; END IF;
  SELECT * INTO v_row FROM public.overhead_costs WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR v_row.is_void THEN RAISE EXCEPTION 'Active overhead cost not found'; END IF;
  IF _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_old:=to_jsonb(v_row);
  UPDATE public.overhead_costs SET cost_date=_date,cost_type=_type,amount=_amount,note=_note,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','overhead_costs',_id,NULL,'Corrected overhead cost',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $$;
CREATE OR REPLACE FUNCTION private.void_overhead_impl(_id uuid,_reason text)
RETURNS public.overhead_costs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.overhead_costs; v_user uuid:=auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage overhead costs'; END IF;
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  UPDATE public.overhead_costs SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id AND NOT is_void RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active overhead cost not found'; END IF;
  PERFORM private.log_change(v_user,'voided','overhead_costs',_id,NULL,'Voided overhead cost: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION private.edit_investor_transaction_impl(_id uuid,_date date,_type public.investor_transaction_type,_amount numeric,_note text)
RETURNS public.investor_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.investor_transactions; v_user uuid:=auth.uid(); v_old jsonb;
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage investor transactions'; END IF;
  SELECT * INTO v_row FROM public.investor_transactions WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR v_row.is_void THEN RAISE EXCEPTION 'Active investor transaction not found'; END IF;
  IF _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  v_old:=to_jsonb(v_row);
  UPDATE public.investor_transactions SET transaction_date=_date,transaction_type=_type,amount=_amount,note=_note,updated_at=now() WHERE id=_id RETURNING * INTO v_row;
  PERFORM private.log_change(v_user,'edited','investor_transactions',_id,NULL,'Corrected investor transaction',v_old,to_jsonb(v_row));
  RETURN v_row;
END; $$;
CREATE OR REPLACE FUNCTION private.void_investor_transaction_impl(_id uuid,_reason text)
RETURNS public.investor_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_row public.investor_transactions; v_user uuid:=auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT private.has_role(v_user,'finance') THEN RAISE EXCEPTION 'Only Finance can manage investor transactions'; END IF;
  IF trim(COALESCE(_reason,''))='' THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  UPDATE public.investor_transactions SET is_void=true,voided_at=now(),voided_by=v_user,void_reason=trim(_reason),updated_at=now() WHERE id=_id AND NOT is_void RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active investor transaction not found'; END IF;
  PERFORM private.log_change(v_user,'voided','investor_transactions',_id,NULL,'Voided investor transaction: '||trim(_reason),NULL,to_jsonb(v_row));
  RETURN v_row;
END; $$;

-- Public invoker wrappers.
CREATE FUNCTION public.edit_ap(_id uuid,_vendor_id uuid,_description text,_amount numeric,_terms integer,_due_date date) RETURNS public.accounts_payable LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.edit_ap_impl(_id,_vendor_id,_description,_amount,_terms,_due_date) $$;
CREATE FUNCTION public.void_ap(_id uuid,_reason text) RETURNS public.accounts_payable LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.void_ap_impl(_id,_reason) $$;
CREATE FUNCTION public.edit_ar(_id uuid,_invoice_no text,_customer_id uuid,_invoice_date date,_amount numeric,_terms integer,_due_date date) RETURNS public.accounts_receivable LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.edit_ar_impl(_id,_invoice_no,_customer_id,_invoice_date,_amount,_terms,_due_date) $$;
CREATE FUNCTION public.void_ar(_id uuid,_reason text) RETURNS public.accounts_receivable LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.void_ar_impl(_id,_reason) $$;
CREATE FUNCTION public.edit_cash_transaction(_id uuid,_date date,_amount numeric,_method public.payment_method,_notes text) RETURNS public.payment_transactions LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.edit_cash_transaction_impl(_id,_date,_amount,_method,_notes) $$;
CREATE FUNCTION public.void_cash_transaction(_id uuid,_reason text) RETURNS public.payment_transactions LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.void_cash_transaction_impl(_id,_reason) $$;
CREATE FUNCTION public.edit_overhead(_id uuid,_date date,_type public.overhead_type,_amount numeric,_note text) RETURNS public.overhead_costs LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.edit_overhead_impl(_id,_date,_type,_amount,_note) $$;
CREATE FUNCTION public.void_overhead(_id uuid,_reason text) RETURNS public.overhead_costs LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.void_overhead_impl(_id,_reason) $$;
CREATE FUNCTION public.edit_investor_transaction(_id uuid,_date date,_type public.investor_transaction_type,_amount numeric,_note text) RETURNS public.investor_transactions LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.edit_investor_transaction_impl(_id,_date,_type,_amount,_note) $$;
CREATE FUNCTION public.void_investor_transaction(_id uuid,_reason text) RETURNS public.investor_transactions LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.void_investor_transaction_impl(_id,_reason) $$;

REVOKE ALL ON FUNCTION private.edit_ap_impl(uuid,uuid,text,numeric,integer,date),private.void_ap_impl(uuid,text),private.edit_ar_impl(uuid,text,uuid,date,numeric,integer,date),private.void_ar_impl(uuid,text),private.edit_cash_transaction_impl(uuid,date,numeric,public.payment_method,text),private.void_cash_transaction_impl(uuid,text),private.edit_overhead_impl(uuid,date,public.overhead_type,numeric,text),private.void_overhead_impl(uuid,text),private.edit_investor_transaction_impl(uuid,date,public.investor_transaction_type,numeric,text),private.void_investor_transaction_impl(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.edit_ap_impl(uuid,uuid,text,numeric,integer,date),private.void_ap_impl(uuid,text),private.edit_ar_impl(uuid,text,uuid,date,numeric,integer,date),private.void_ar_impl(uuid,text),private.edit_cash_transaction_impl(uuid,date,numeric,public.payment_method,text),private.void_cash_transaction_impl(uuid,text),private.edit_overhead_impl(uuid,date,public.overhead_type,numeric,text),private.void_overhead_impl(uuid,text),private.edit_investor_transaction_impl(uuid,date,public.investor_transaction_type,numeric,text),private.void_investor_transaction_impl(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.edit_ap(uuid,uuid,text,numeric,integer,date),public.void_ap(uuid,text),public.edit_ar(uuid,text,uuid,date,numeric,integer,date),public.void_ar(uuid,text),public.edit_cash_transaction(uuid,date,numeric,public.payment_method,text),public.void_cash_transaction(uuid,text),public.edit_overhead(uuid,date,public.overhead_type,numeric,text),public.void_overhead(uuid,text),public.edit_investor_transaction(uuid,date,public.investor_transaction_type,numeric,text),public.void_investor_transaction(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_ap(uuid,uuid,text,numeric,integer,date),public.void_ap(uuid,text),public.edit_ar(uuid,text,uuid,date,numeric,integer,date),public.void_ar(uuid,text),public.edit_cash_transaction(uuid,date,numeric,public.payment_method,text),public.void_cash_transaction(uuid,text),public.edit_overhead(uuid,date,public.overhead_type,numeric,text),public.void_overhead(uuid,text),public.edit_investor_transaction(uuid,date,public.investor_transaction_type,numeric,text),public.void_investor_transaction(uuid,text) TO authenticated;

-- Update payment creation to link each immutable payment row to its cash-flow transaction.
CREATE OR REPLACE FUNCTION private.record_ap_payment_impl(_ap_id uuid,_payment_date date,_amount numeric)
RETURNS public.accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_ap public.accounts_payable; v_user uuid:=private.assert_finance_actor(); v_tx uuid;
BEGIN
  IF _amount<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT * INTO v_ap FROM public.accounts_payable WHERE id=_ap_id FOR UPDATE;
  IF NOT FOUND OR v_ap.is_void THEN RAISE EXCEPTION 'Active vendor cost not found'; END IF;
  IF _amount>v_ap.balance_remaining THEN RAISE EXCEPTION 'Payment exceeds the remaining balance'; END IF;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by) VALUES('AP_PAYMENT',_ap_id,_payment_date,_amount,'Bank Transfer','Vendor payment',v_user) RETURNING id INTO v_tx;
  INSERT INTO public.ap_payments(ap_id,payment_date,amount,created_by,payment_transaction_id) VALUES(_ap_id,_payment_date,_amount,v_user,v_tx);
  UPDATE public.accounts_payable SET paid_amount=paid_amount+_amount,updated_at=now() WHERE id=_ap_id RETURNING * INTO v_ap;
  PERFORM private.log_change(v_user,'paid','accounts_payable',_ap_id,v_ap.job_id,'Recorded vendor payment of IDR '||trim(to_char(_amount,'FM999G999G999G999G990')),NULL,jsonb_build_object('payment_transaction_id',v_tx,'amount',_amount));
  RETURN v_ap;
END; $$;

CREATE OR REPLACE FUNCTION private.record_ar_payment_impl(_ar_id uuid,_payment_date date,_amount numeric)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_ar public.accounts_receivable; v_user uuid:=private.assert_finance_actor(); v_tx uuid;
BEGIN
  IF _amount<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id=_ar_id FOR UPDATE;
  IF NOT FOUND OR v_ar.is_void THEN RAISE EXCEPTION 'Active invoice not found'; END IF;
  IF _amount>v_ar.remaining_amount THEN RAISE EXCEPTION 'Payment exceeds the remaining balance'; END IF;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by) VALUES('AR_RECEIPT',_ar_id,_payment_date,_amount,'Bank Transfer','Customer receipt',v_user) RETURNING id INTO v_tx;
  INSERT INTO public.ar_payments(ar_id,payment_date,amount,created_by,payment_transaction_id) VALUES(_ar_id,_payment_date,_amount,v_user,v_tx);
  UPDATE public.accounts_receivable SET paid_amount=paid_amount+_amount,updated_at=now() WHERE id=_ar_id RETURNING * INTO v_ar;
  PERFORM private.log_change(v_user,'paid','accounts_receivable',_ar_id,v_ar.job_id,'Recorded customer receipt of IDR '||trim(to_char(_amount,'FM999G999G999G999G990')),NULL,jsonb_build_object('payment_transaction_id',v_tx,'amount',_amount));
  RETURN v_ar;
END; $$;

-- Prevent Finance from changing an existing Owner.
CREATE OR REPLACE FUNCTION private.assign_user_role_impl(_user_id uuid,_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_actor uuid:=auth.uid(); v_target_role public.app_role;
BEGIN
  IF v_actor=_user_id THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
  IF NOT private.is_active_user(v_actor) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id=_user_id LIMIT 1;
  IF private.has_role(v_actor,'owner') THEN NULL;
  ELSIF private.has_role(v_actor,'finance') AND v_target_role IS DISTINCT FROM 'owner' AND _role IN ('finance','operations') THEN NULL;
  ELSE RAISE EXCEPTION 'Not authorized to assign this role'; END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id;
  INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,_role);
  UPDATE public.profiles SET status='active' WHERE id=_user_id;
  PERFORM private.log_change(v_actor,'role_assigned','profile',_user_id,NULL,'Assigned '||_role::text||' access',jsonb_build_object('role',v_target_role),jsonb_build_object('role',_role));
END; $$;

-- Track direct creates/edits with structured snapshots; RPC logging covers voids and controlled edits.
CREATE OR REPLACE FUNCTION public.log_business_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_id uuid; v_job uuid; v_desc text; v_action text;
BEGIN
  v_id:=COALESCE(NEW.id,OLD.id); v_action:=CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'edited' END;
  IF TG_TABLE_NAME='jobs' THEN v_job:=v_id; v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created job '||NEW.job_sheet_no ELSE 'Updated job '||NEW.job_sheet_no END;
  ELSIF TG_TABLE_NAME='accounts_payable' THEN v_job:=COALESCE(NEW.job_id,OLD.job_id); v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created vendor cost line' ELSE 'Updated vendor cost line' END;
  ELSIF TG_TABLE_NAME='accounts_receivable' THEN v_job:=COALESCE(NEW.job_id,OLD.job_id); v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created customer invoice' ELSE 'Updated customer invoice' END;
  ELSE v_job:=NULL; v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created '||replace(TG_TABLE_NAME,'_',' ') ELSE 'Updated '||replace(TG_TABLE_NAME,'_',' ') END;
  END IF;
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description,old_values,new_values)
  VALUES(auth.uid(),v_action,TG_TABLE_NAME,v_id,v_job,v_desc,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS overhead_activity ON public.overhead_costs;
CREATE TRIGGER overhead_activity AFTER INSERT ON public.overhead_costs FOR EACH ROW EXECUTE FUNCTION public.log_business_activity();
DROP TRIGGER IF EXISTS investor_activity ON public.investor_transactions;
CREATE TRIGGER investor_activity AFTER INSERT ON public.investor_transactions FOR EACH ROW EXECUTE FUNCTION public.log_business_activity();