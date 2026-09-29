-- Owner gets same overhead/investor access as Finance
DO $do$ DECLARE r record; d text; BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname IN ('edit_overhead_impl','pay_overhead_impl','void_overhead_impl','edit_investor_transaction_impl','void_investor_transaction_impl') LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, $$NOT private.has_role(v_user,'finance')$$, $$NOT (private.has_role(v_user,'finance') OR private.has_role(v_user,'owner'))$$);
    d := replace(d, 'Only Finance can manage', 'Only Owner or Finance can manage');
    EXECUTE d;
  END LOOP;
END $do$;

-- Void messages name blocking records
DO $do$ DECLARE d text; BEGIN
  d := pg_get_functiondef('private.void_job_impl(uuid,text)'::regprocedure);
  d := replace(d, $$RAISE EXCEPTION 'Void active AP and AR records first'$$,
    $$RAISE EXCEPTION 'Void these records first: %', concat_ws('; ',
      (SELECT 'vendor cost '||string_agg(COALESCE(item_cost_description,'(no description)')||' '||invoice_amount::text, ', ') FROM public.accounts_payable WHERE job_id=_job_id AND NOT is_void),
      (SELECT 'invoice '||string_agg(invoice_no, ', ') FROM public.accounts_receivable WHERE job_id=_job_id AND NOT is_void))$$);
  EXECUTE d;
  d := pg_get_functiondef('private.void_ap_impl(uuid,text)'::regprocedure);
  d := replace(d, $$RAISE EXCEPTION 'Void recorded payments first'$$,
    $$RAISE EXCEPTION 'Void these payments first (Cash Flow): %', (SELECT string_agg(to_char(payment_date,'DD Mon YYYY')||' '||amount::text, ', ') FROM public.ap_payments WHERE ap_id=_id AND NOT is_void)$$);
  EXECUTE d;
  d := pg_get_functiondef('private.void_ar_impl(uuid,text)'::regprocedure);
  d := replace(d, $$RAISE EXCEPTION 'Void recorded receipts first'$$,
    $$RAISE EXCEPTION 'Void these receipts first (Cash Flow): %', (SELECT string_agg(to_char(payment_date,'DD Mon YYYY')||' '||amount::text, ', ') FROM public.ar_payments WHERE ar_id=_id AND NOT is_void)$$);
  EXECUTE d;
END $do$;

CREATE OR REPLACE FUNCTION private.assert_any_actor() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v uuid := auth.uid();
BEGIN
  IF NOT private.is_active_user(v) OR NOT (private.has_role(v,'owner') OR private.has_role(v,'finance') OR private.has_role(v,'operations')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN v;
END $$;

-- Jobs
CREATE OR REPLACE FUNCTION private.create_job_impl(_job_sheet_no text,_customer_id uuid,_order_date date,_service_type text,_unit_type text,_quantity text,_volume_weight text,_origin text,_destination text,_estimated_selling numeric,_estimated_buying numeric)
RETURNS public.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_any_actor(); v_fin boolean; v_job public.jobs; v_f public.job_financials;
BEGIN
  v_fin := private.has_role(v_user,'owner') OR private.has_role(v_user,'finance');
  IF trim(COALESCE(_job_sheet_no,''))='' THEN RAISE EXCEPTION 'Job sheet number is required'; END IF;
  IF NOT v_fin AND (_estimated_selling IS NOT NULL OR _estimated_buying IS NOT NULL) THEN RAISE EXCEPTION 'Only Owner or Finance can set job pricing'; END IF;
  IF COALESCE(_estimated_selling,0)<0 OR COALESCE(_estimated_buying,0)<0 THEN RAISE EXCEPTION 'Estimates cannot be negative'; END IF;
  INSERT INTO public.jobs(job_sheet_no,customer_id,order_date,service_type,unit_type,quantity,volume_weight,origin,destination,status,created_by)
  VALUES(trim(_job_sheet_no),_customer_id,COALESCE(_order_date,private.jkt_today()),_service_type,_unit_type,_quantity,_volume_weight,_origin,_destination,'Pipeline',v_user)
  RETURNING * INTO v_job;
  IF v_fin THEN
    INSERT INTO public.job_financials(job_id,estimated_selling,estimated_buying) VALUES(v_job.id,COALESCE(_estimated_selling,0),COALESCE(_estimated_buying,0)) RETURNING * INTO v_f;
    PERFORM private.log_change(v_user,'created','job_financials',v_job.id,v_job.id,'Set job estimates',NULL,to_jsonb(v_f));
  END IF;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION private.set_job_estimates_impl(_job_id uuid,_estimated_selling numeric,_estimated_buying numeric)
RETURNS public.job_financials LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_finance_actor(); v_old public.job_financials; v_new public.job_financials;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND NOT is_void) THEN RAISE EXCEPTION 'Active job not found'; END IF;
  IF _estimated_selling IS NULL OR _estimated_buying IS NULL OR _estimated_selling<0 OR _estimated_buying<0 THEN RAISE EXCEPTION 'Estimates are required and cannot be negative'; END IF;
  SELECT * INTO v_old FROM public.job_financials WHERE job_id=_job_id FOR UPDATE;
  INSERT INTO public.job_financials(job_id,estimated_selling,estimated_buying) VALUES(_job_id,_estimated_selling,_estimated_buying)
  ON CONFLICT (job_id) DO UPDATE SET estimated_selling=EXCLUDED.estimated_selling,estimated_buying=EXCLUDED.estimated_buying,updated_at=now()
  RETURNING * INTO v_new;
  PERFORM private.log_change(v_user,CASE WHEN v_old.job_id IS NULL THEN 'created' ELSE 'edited' END,'job_financials',_job_id,_job_id,'Updated job estimates',CASE WHEN v_old.job_id IS NOT NULL THEN to_jsonb(v_old) END,to_jsonb(v_new));
  RETURN v_new;
END $$;

-- AP (Operations allowed; no paid/balance/status inputs)
CREATE OR REPLACE FUNCTION private.create_ap_impl(_job_id uuid,_vendor_id uuid,_description text,_amount numeric,_bill_date date,_terms integer,_payment_type public.payment_type)
RETURNS public.accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_any_actor(); v_row public.accounts_payable; v_bill date := COALESCE(_bill_date,private.jkt_today()); v_terms int := COALESCE(_terms,0);
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND NOT is_void) THEN RAISE EXCEPTION 'Active job not found'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF v_terms<0 THEN RAISE EXCEPTION 'Payment terms cannot be negative'; END IF;
  INSERT INTO public.accounts_payable(job_id,vendor_id,item_cost_description,invoice_amount,bill_date,payment_terms_days,due_date,payment_type,paid_amount,status)
  VALUES(_job_id,_vendor_id,_description,_amount,v_bill,v_terms,v_bill+v_terms,COALESCE(_payment_type,'Term'),0,'Unpaid') RETURNING * INTO v_row;
  RETURN v_row; -- logged by ap_activity trigger
END $$;

-- AR
CREATE OR REPLACE FUNCTION private.create_ar_impl(_job_id uuid,_invoice_no text,_invoice_date date,_amount numeric,_terms integer)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_finance_actor(); v_job public.jobs; v_row public.accounts_receivable; v_date date := COALESCE(_invoice_date,private.jkt_today()); v_terms int := COALESCE(_terms,0);
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id=_job_id AND NOT is_void;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active job not found'; END IF;
  IF v_job.status<>'Closed' THEN RAISE EXCEPTION 'Close the job before issuing an invoice'; END IF;
  IF trim(COALESCE(_invoice_no,''))='' THEN RAISE EXCEPTION 'Invoice number is required'; END IF;
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF v_terms<0 THEN RAISE EXCEPTION 'Payment terms cannot be negative'; END IF;
  INSERT INTO public.accounts_receivable(invoice_no,job_id,customer_id,invoice_date,amount,payment_terms_days,due_date,paid_amount,status)
  VALUES(trim(_invoice_no),_job_id,v_job.customer_id,v_date,_amount,v_terms,v_date+v_terms,0,'Issued') RETURNING * INTO v_row;
  RETURN v_row; -- logged by ar_activity trigger
END $$;

-- Attachments
CREATE OR REPLACE FUNCTION private.set_attachment_impl(_kind text,_id uuid,_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_any_actor(); v_fin boolean := private.has_role(v_user,'owner') OR private.has_role(v_user,'finance'); v_cur text; v_void boolean;
BEGIN
  IF _path IS NULL OR _path NOT LIKE _kind||'/'||_id::text||'/%' THEN RAISE EXCEPTION 'Invalid attachment path'; END IF;
  IF _kind='ap' THEN
    SELECT attachment_path,is_void INTO v_cur,v_void FROM public.accounts_payable WHERE id=_id FOR UPDATE;
    IF NOT FOUND OR v_void THEN RAISE EXCEPTION 'Active vendor cost not found'; END IF;
    IF NOT v_fin AND v_cur IS NOT NULL THEN RAISE EXCEPTION 'Only Owner or Finance can replace an attachment'; END IF;
    UPDATE public.accounts_payable SET attachment_path=_path,updated_at=now() WHERE id=_id;
  ELSIF _kind='ar' THEN
    IF NOT v_fin THEN RAISE EXCEPTION 'Not authorized'; END IF;
    SELECT attachment_path,is_void INTO v_cur,v_void FROM public.accounts_receivable WHERE id=_id FOR UPDATE;
    IF NOT FOUND OR v_void THEN RAISE EXCEPTION 'Active invoice not found'; END IF;
    UPDATE public.accounts_receivable SET attachment_path=_path,updated_at=now() WHERE id=_id;
  ELSE RAISE EXCEPTION 'Unknown attachment kind'; END IF;
END $$;

-- Master data (Owner, Finance, Operations per roles table); logged by master-data triggers
CREATE OR REPLACE FUNCTION private.save_customer_impl(_id uuid,_company_name text,_contact_name text,_phone text,_email text,_address text)
RETURNS public.customers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_any_actor(); v_row public.customers;
BEGIN
  IF trim(COALESCE(_company_name,''))='' THEN RAISE EXCEPTION 'Company name is required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.customers(company_name,contact_name,phone,email,address) VALUES(trim(_company_name),_contact_name,_phone,_email,_address) RETURNING * INTO v_row;
  ELSE
    UPDATE public.customers SET company_name=trim(_company_name),contact_name=_contact_name,phone=_phone,email=_email,address=_address WHERE id=_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  END IF;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION private.save_vendor_impl(_id uuid,_vendor_name text,_service_type text,_contact_person text,_phone text)
RETURNS public.subcontractors_vendors LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_any_actor(); v_row public.subcontractors_vendors;
BEGIN
  IF trim(COALESCE(_vendor_name,''))='' THEN RAISE EXCEPTION 'Vendor name is required'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.subcontractors_vendors(vendor_name,service_type,contact_person,phone) VALUES(trim(_vendor_name),_service_type,_contact_person,_phone) RETURNING * INTO v_row;
  ELSE
    UPDATE public.subcontractors_vendors SET vendor_name=trim(_vendor_name),service_type=_service_type,contact_person=_contact_person,phone=_phone WHERE id=_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  END IF;
  RETURN v_row;
END $$;

-- Overhead and investor creation (Owner, Finance); logged by insert triggers
CREATE OR REPLACE FUNCTION private.create_overhead_impl(_date date,_type public.overhead_type,_amount numeric,_note text)
RETURNS public.overhead_costs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_finance_actor(); v_row public.overhead_costs;
BEGIN
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF trim(COALESCE(_note,''))='' THEN RAISE EXCEPTION 'Note is required'; END IF;
  INSERT INTO public.overhead_costs(cost_date,cost_type,amount,note,created_by) VALUES(COALESCE(_date,private.jkt_today()),_type,_amount,trim(_note),v_user) RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION private.create_investor_transaction_impl(_date date,_type public.investor_transaction_type,_amount numeric,_note text)
RETURNS public.investor_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE v_user uuid := private.assert_finance_actor(); v_row public.investor_transactions;
BEGIN
  IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF trim(COALESCE(_note,''))='' THEN RAISE EXCEPTION 'Note is required'; END IF;
  INSERT INTO public.investor_transactions(transaction_date,transaction_type,amount,note,created_by) VALUES(COALESCE(_date,private.jkt_today()),_type,_amount,trim(_note),v_user) RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Public wrappers
CREATE OR REPLACE FUNCTION public.create_job(_job_sheet_no text,_customer_id uuid,_order_date date,_service_type text,_unit_type text,_quantity text,_volume_weight text,_origin text,_destination text,_estimated_selling numeric DEFAULT NULL,_estimated_buying numeric DEFAULT NULL)
RETURNS public.jobs LANGUAGE sql SET search_path=public,private AS $$ SELECT private.create_job_impl(_job_sheet_no,_customer_id,_order_date,_service_type,_unit_type,_quantity,_volume_weight,_origin,_destination,_estimated_selling,_estimated_buying) $$;
CREATE OR REPLACE FUNCTION public.set_job_estimates(_job_id uuid,_estimated_selling numeric,_estimated_buying numeric)
RETURNS public.job_financials LANGUAGE sql SET search_path=public,private AS $$ SELECT private.set_job_estimates_impl(_job_id,_estimated_selling,_estimated_buying) $$;
CREATE OR REPLACE FUNCTION public.create_ap(_job_id uuid,_vendor_id uuid,_description text,_amount numeric,_bill_date date,_terms integer,_payment_type public.payment_type DEFAULT 'Term')
RETURNS public.accounts_payable LANGUAGE sql SET search_path=public,private AS $$ SELECT private.create_ap_impl(_job_id,_vendor_id,_description,_amount,_bill_date,_terms,_payment_type) $$;
CREATE OR REPLACE FUNCTION public.create_ar(_job_id uuid,_invoice_no text,_invoice_date date,_amount numeric,_terms integer)
RETURNS public.accounts_receivable LANGUAGE sql SET search_path=public,private AS $$ SELECT private.create_ar_impl(_job_id,_invoice_no,_invoice_date,_amount,_terms) $$;
CREATE OR REPLACE FUNCTION public.set_attachment(_kind text,_id uuid,_path text)
RETURNS void LANGUAGE sql SET search_path=public,private AS $$ SELECT private.set_attachment_impl(_kind,_id,_path) $$;
CREATE OR REPLACE FUNCTION public.save_customer(_id uuid,_company_name text,_contact_name text,_phone text,_email text,_address text)
RETURNS public.customers LANGUAGE sql SET search_path=public,private AS $$ SELECT private.save_customer_impl(_id,_company_name,_contact_name,_phone,_email,_address) $$;
CREATE OR REPLACE FUNCTION public.save_vendor(_id uuid,_vendor_name text,_service_type text,_contact_person text,_phone text)
RETURNS public.subcontractors_vendors LANGUAGE sql SET search_path=public,private AS $$ SELECT private.save_vendor_impl(_id,_vendor_name,_service_type,_contact_person,_phone) $$;
CREATE OR REPLACE FUNCTION public.create_overhead(_date date,_type public.overhead_type,_amount numeric,_note text)
RETURNS public.overhead_costs LANGUAGE sql SET search_path=public,private AS $$ SELECT private.create_overhead_impl(_date,_type,_amount,_note) $$;
CREATE OR REPLACE FUNCTION public.create_investor_transaction(_date date,_type public.investor_transaction_type,_amount numeric,_note text)
RETURNS public.investor_transactions LANGUAGE sql SET search_path=public,private AS $$ SELECT private.create_investor_transaction_impl(_date,_type,_amount,_note) $$;

DO $do$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['private.assert_any_actor()',
    'private.create_job_impl(text,uuid,date,text,text,text,text,text,text,numeric,numeric)','public.create_job(text,uuid,date,text,text,text,text,text,text,numeric,numeric)',
    'private.set_job_estimates_impl(uuid,numeric,numeric)','public.set_job_estimates(uuid,numeric,numeric)',
    'private.create_ap_impl(uuid,uuid,text,numeric,date,integer,public.payment_type)','public.create_ap(uuid,uuid,text,numeric,date,integer,public.payment_type)',
    'private.create_ar_impl(uuid,text,date,numeric,integer)','public.create_ar(uuid,text,date,numeric,integer)',
    'private.set_attachment_impl(text,uuid,text)','public.set_attachment(text,uuid,text)',
    'private.save_customer_impl(uuid,text,text,text,text,text)','public.save_customer(uuid,text,text,text,text,text)',
    'private.save_vendor_impl(uuid,text,text,text,text)','public.save_vendor(uuid,text,text,text,text)',
    'private.create_overhead_impl(date,public.overhead_type,numeric,text)','public.create_overhead(date,public.overhead_type,numeric,text)',
    'private.create_investor_transaction_impl(date,public.investor_transaction_type,numeric,text)','public.create_investor_transaction(date,public.investor_transaction_type,numeric,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $do$;

-- Close direct write paths
REVOKE INSERT, UPDATE ON public.jobs, public.job_financials, public.accounts_payable, public.accounts_receivable,
  public.payment_transactions, public.customers, public.subcontractors_vendors, public.overhead_costs, public.investor_transactions,
  public.ap_payments, public.ar_payments FROM authenticated, anon;
REVOKE DELETE ON public.ap_payments, public.ar_payments FROM authenticated, anon;
DROP POLICY IF EXISTS "ap insert" ON public.accounts_payable;
DROP POLICY IF EXISTS "ar insert" ON public.accounts_receivable;
DROP POLICY IF EXISTS "jobs insert" ON public.jobs;
DROP POLICY IF EXISTS "job financials insert" ON public.job_financials;
DROP POLICY IF EXISTS "customers insert" ON public.customers;
DROP POLICY IF EXISTS "customers update" ON public.customers;
DROP POLICY IF EXISTS "vendors insert" ON public.subcontractors_vendors;
DROP POLICY IF EXISTS "vendors update" ON public.subcontractors_vendors;
DROP POLICY IF EXISTS "finance creates overhead" ON public.overhead_costs;
DROP POLICY IF EXISTS "finance creates investor transactions" ON public.investor_transactions;