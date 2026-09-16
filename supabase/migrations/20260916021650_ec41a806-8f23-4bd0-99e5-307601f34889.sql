ALTER TYPE public.app_role RENAME VALUE 'admin' TO 'owner';

CREATE TYPE public.account_status AS ENUM ('pending', 'active', 'deactivated');
ALTER TABLE public.profiles ADD COLUMN status public.account_status NOT NULL DEFAULT 'pending';
UPDATE public.profiles p SET status = 'active' WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email, 'pending')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active')
$$;
REVOKE ALL ON FUNCTION private.is_active_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_user(uuid) TO authenticated, service_role;

CREATE TABLE public.job_financials (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  estimated_selling numeric(16,2) NOT NULL DEFAULT 0,
  actual_selling numeric(16,2) NOT NULL DEFAULT 0,
  estimated_buying numeric(16,2) NOT NULL DEFAULT 0,
  actual_buying numeric(16,2) NOT NULL DEFAULT 0,
  margin numeric(16,2) GENERATED ALWAYS AS (actual_selling - actual_buying) STORED,
  pct_margin numeric(8,4) GENERATED ALWAYS AS (CASE WHEN actual_selling = 0 THEN 0 ELSE (actual_selling - actual_buying) / actual_selling END) STORED,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.job_financials TO authenticated;
GRANT ALL ON public.job_financials TO service_role;
ALTER TABLE public.job_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job financials select" ON public.job_financials FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
CREATE POLICY "job financials insert" ON public.job_financials FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
CREATE POLICY "job financials update" ON public.job_financials FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance'))) WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
INSERT INTO public.job_financials (job_id, estimated_selling, actual_selling, estimated_buying, actual_buying)
SELECT id, selling_price, selling_price, buying_price_est, 0 FROM public.jobs;
ALTER TABLE public.jobs DROP COLUMN selling_price;
ALTER TABLE public.jobs DROP COLUMN buying_price_est;

ALTER TABLE public.accounts_payable ADD COLUMN attachment_path text;
ALTER TABLE public.accounts_receivable ADD COLUMN attachment_path text;

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity select" ON public.activity_log FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR (private.has_role(auth.uid(),'operations') AND job_id IS NOT NULL)));
CREATE POLICY "activity insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND user_id = auth.uid());

CREATE TABLE public.ap_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_id uuid NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT current_date,
  amount numeric(16,2) NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ap_payments TO authenticated;
GRANT ALL ON public.ap_payments TO service_role;
ALTER TABLE public.ap_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap payments select" ON public.ap_payments FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));

CREATE TABLE public.ar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_id uuid NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT current_date,
  amount numeric(16,2) NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ar_payments TO authenticated;
GRANT ALL ON public.ar_payments TO service_role;
ALTER TABLE public.ar_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar payments select" ON public.ar_payments FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));

CREATE OR REPLACE FUNCTION public.record_ap_payment(_ap_id uuid, _payment_date date, _amount numeric)
RETURNS public.accounts_payable LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_ap public.accounts_payable; v_user uuid := auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT (private.has_role(v_user,'owner') OR private.has_role(v_user,'finance')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT * INTO v_ap FROM public.accounts_payable WHERE id = _ap_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor cost not found'; END IF;
  IF _amount > v_ap.balance_remaining THEN RAISE EXCEPTION 'Payment exceeds the remaining balance'; END IF;
  INSERT INTO public.ap_payments(ap_id,payment_date,amount,created_by) VALUES(_ap_id,_payment_date,_amount,v_user);
  UPDATE public.accounts_payable SET paid_amount = paid_amount + _amount WHERE id = _ap_id RETURNING * INTO v_ap;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by) VALUES('AP_PAYMENT',_ap_id,_payment_date,_amount,'Bank Transfer','Vendor payment',v_user);
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description) VALUES(v_user,'paid','accounts_payable',_ap_id,v_ap.job_id,'Recorded vendor payment of IDR ' || trim(to_char(_amount,'FM999G999G999G999G990')));
  RETURN v_ap;
END; $$;
REVOKE ALL ON FUNCTION public.record_ap_payment(uuid,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ap_payment(uuid,date,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_ar_payment(_ar_id uuid, _payment_date date, _amount numeric)
RETURNS public.accounts_receivable LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_ar public.accounts_receivable; v_user uuid := auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT (private.has_role(v_user,'owner') OR private.has_role(v_user,'finance')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id = _ar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF _amount > v_ar.remaining_amount THEN RAISE EXCEPTION 'Payment exceeds the remaining balance'; END IF;
  INSERT INTO public.ar_payments(ar_id,payment_date,amount,created_by) VALUES(_ar_id,_payment_date,_amount,v_user);
  UPDATE public.accounts_receivable SET paid_amount = paid_amount + _amount WHERE id = _ar_id RETURNING * INTO v_ar;
  INSERT INTO public.payment_transactions(reference_type,reference_id,transaction_date,amount,payment_method,notes,created_by) VALUES('AR_RECEIPT',_ar_id,_payment_date,_amount,'Bank Transfer','Customer receipt',v_user);
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description) VALUES(v_user,'paid','accounts_receivable',_ar_id,v_ar.job_id,'Recorded customer receipt of IDR ' || trim(to_char(_amount,'FM999G999G999G999G990')));
  RETURN v_ar;
END; $$;
REVOKE ALL ON FUNCTION public.record_ar_payment(uuid,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ar_payment(uuid,date,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor = _user_id THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
  IF NOT private.is_active_user(v_actor) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF private.has_role(v_actor,'owner') THEN NULL;
  ELSIF private.has_role(v_actor,'finance') AND _role IN ('finance','operations') THEN NULL;
  ELSE RAISE EXCEPTION 'Not authorized to assign this role'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,_role);
  UPDATE public.profiles SET status='active' WHERE id=_user_id;
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,description) VALUES(v_actor,'role_assigned','profile',_user_id,'Assigned ' || _role::text || ' access');
END; $$;
REVOKE ALL ON FUNCTION public.assign_user_role(uuid,public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid,public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_actor uuid := auth.uid(); v_target_role public.app_role;
BEGIN
  IF v_actor = _user_id THEN RAISE EXCEPTION 'You cannot deactivate your own account'; END IF;
  IF NOT private.is_active_user(v_actor) OR NOT (private.has_role(v_actor,'owner') OR private.has_role(v_actor,'finance')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id=_user_id LIMIT 1;
  IF private.has_role(v_actor,'finance') AND v_target_role='owner' THEN RAISE EXCEPTION 'Finance cannot deactivate an Owner'; END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id;
  UPDATE public.profiles SET status='deactivated' WHERE id=_user_id;
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,description) VALUES(v_actor,'deactivated','profile',_user_id,'Deactivated user access');
END; $$;
REVOKE ALL ON FUNCTION public.deactivate_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_job_operations(_job_id uuid,_customer_id uuid,_order_date date,_service_type text,_unit_type text,_quantity text,_volume_weight text,_origin text,_destination text)
RETURNS public.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_job public.jobs; v_user uuid:=auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT (private.has_role(v_user,'owner') OR private.has_role(v_user,'operations')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF v_job.status IN ('Completed','Cancelled') THEN RAISE EXCEPTION 'Closed jobs cannot be edited by Operations'; END IF;
  UPDATE public.jobs SET customer_id=_customer_id,order_date=_order_date,service_type=_service_type,unit_type=_unit_type,quantity=_quantity,volume_weight=_volume_weight,origin=_origin,destination=_destination WHERE id=_job_id RETURNING * INTO v_job;
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description) VALUES(v_user,'edited','job',_job_id,_job_id,'Updated cargo and route details');
  RETURN v_job;
END; $$;
REVOKE ALL ON FUNCTION public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_job_financials(_job_id uuid,_actual_selling numeric,_actual_buying numeric,_status public.job_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF NOT private.is_active_user(v_user) OR NOT (private.has_role(v_user,'owner') OR private.has_role(v_user,'finance')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.job_financials(job_id,actual_selling,actual_buying) VALUES(_job_id,_actual_selling,_actual_buying)
  ON CONFLICT(job_id) DO UPDATE SET actual_selling=EXCLUDED.actual_selling,actual_buying=EXCLUDED.actual_buying,updated_at=now();
  UPDATE public.jobs SET status=_status WHERE id=_job_id;
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description) VALUES(v_user,'closed','job',_job_id,_job_id,'Updated actual selling, buying, and closing status');
END; $$;
REVOKE ALL ON FUNCTION public.close_job_financials(uuid,numeric,numeric,public.job_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_job_financials(uuid,numeric,numeric,public.job_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_business_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_job uuid; v_desc text; v_action text;
BEGIN
  v_id := COALESCE(NEW.id,OLD.id); v_action := CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'edited' END;
  IF TG_TABLE_NAME='jobs' THEN v_job:=v_id; v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created job '||NEW.job_sheet_no ELSE 'Updated job '||NEW.job_sheet_no END;
  ELSIF TG_TABLE_NAME='accounts_payable' THEN v_job:=COALESCE(NEW.job_id,OLD.job_id); v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created vendor cost line' ELSE 'Updated vendor cost line' END;
  ELSE v_job:=COALESCE(NEW.job_id,OLD.job_id); v_desc:=CASE WHEN TG_OP='INSERT' THEN 'Created customer invoice' ELSE 'Updated customer invoice' END; END IF;
  INSERT INTO public.activity_log(user_id,action,entity_type,entity_id,job_id,description) VALUES(auth.uid(),v_action,TG_TABLE_NAME,v_id,v_job,v_desc);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.log_business_activity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER jobs_activity AFTER INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.log_business_activity();
CREATE TRIGGER ap_activity AFTER INSERT OR UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION public.log_business_activity();
CREATE TRIGGER ar_activity AFTER INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.log_business_activity();

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE UPDATE ON public.jobs FROM authenticated;

DROP POLICY "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles staff readable" ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance'))));
DROP POLICY "roles readable" ON public.user_roles;
CREATE POLICY "roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid() OR (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance'))));
DROP POLICY "admins manage roles" ON public.user_roles;

DROP POLICY "jobs select" ON public.jobs;
CREATE POLICY "jobs select" ON public.jobs FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "jobs insert" ON public.jobs;
CREATE POLICY "jobs insert" ON public.jobs FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "jobs update" ON public.jobs;
DROP POLICY "jobs delete" ON public.jobs;
CREATE POLICY "jobs delete" ON public.jobs FOR DELETE TO authenticated USING (private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'owner'));

DROP POLICY "customers select" ON public.customers; CREATE POLICY "customers select" ON public.customers FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "customers insert" ON public.customers; CREATE POLICY "customers insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "customers update" ON public.customers; CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "customers delete" ON public.customers; CREATE POLICY "customers delete" ON public.customers FOR DELETE TO authenticated USING (private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'owner'));
DROP POLICY "vendors select" ON public.subcontractors_vendors; CREATE POLICY "vendors select" ON public.subcontractors_vendors FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "vendors insert" ON public.subcontractors_vendors; CREATE POLICY "vendors insert" ON public.subcontractors_vendors FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "vendors update" ON public.subcontractors_vendors; CREATE POLICY "vendors update" ON public.subcontractors_vendors FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "vendors delete" ON public.subcontractors_vendors; CREATE POLICY "vendors delete" ON public.subcontractors_vendors FOR DELETE TO authenticated USING (private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'owner'));
DROP POLICY "ap select" ON public.accounts_payable; CREATE POLICY "ap select" ON public.accounts_payable FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "ap insert" ON public.accounts_payable; CREATE POLICY "ap insert" ON public.accounts_payable FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "ap update" ON public.accounts_payable; CREATE POLICY "ap update" ON public.accounts_payable FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
DROP POLICY "ap delete" ON public.accounts_payable; CREATE POLICY "ap delete" ON public.accounts_payable FOR DELETE TO authenticated USING (private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'owner'));
DROP POLICY "ar select" ON public.accounts_receivable; CREATE POLICY "ar select" ON public.accounts_receivable FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
DROP POLICY "ar insert" ON public.accounts_receivable; CREATE POLICY "ar insert" ON public.accounts_receivable FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
DROP POLICY "ar update" ON public.accounts_receivable; CREATE POLICY "ar update" ON public.accounts_receivable FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
DROP POLICY "ar delete" ON public.accounts_receivable; CREATE POLICY "ar delete" ON public.accounts_receivable FOR DELETE TO authenticated USING (private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'owner'));
DROP POLICY "pt select" ON public.payment_transactions; CREATE POLICY "pt select" ON public.payment_transactions FOR SELECT TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
DROP POLICY "pt insert" ON public.payment_transactions; CREATE POLICY "pt insert" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
DROP POLICY "pt update" ON public.payment_transactions; CREATE POLICY "pt update" ON public.payment_transactions FOR UPDATE TO authenticated USING (private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
DROP POLICY "pt delete" ON public.payment_transactions; CREATE POLICY "pt delete" ON public.payment_transactions FOR DELETE TO authenticated USING (private.is_active_user(auth.uid()) AND private.has_role(auth.uid(),'owner'));

CREATE POLICY "finance attachments read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='finance-attachments' AND private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
CREATE POLICY "finance attachments insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='finance-attachments' AND private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance') OR private.has_role(auth.uid(),'operations')));
CREATE POLICY "finance attachments update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='finance-attachments' AND private.is_active_user(auth.uid()) AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));
