CREATE TYPE public.app_role AS ENUM ('admin','finance','operations');
CREATE TYPE public.job_status AS ENUM ('Draft','In Progress','Completed','Cancelled');
CREATE TYPE public.ap_status AS ENUM ('Unpaid','Partially Paid','Paid');
CREATE TYPE public.ar_status AS ENUM ('Draft','Issued','Partially Paid','Paid','Overdue');
CREATE TYPE public.payment_type AS ENUM ('Term','Cash');
CREATE TYPE public.payment_method AS ENUM ('Bank Transfer','Cash','Giro');
CREATE TYPE public.reference_type AS ENUM ('AR_RECEIPT','AP_PAYMENT','OPERATIONAL_EXPENSE');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first_user;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'admin'::public.app_role ELSE 'operations'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers select" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "customers delete" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.subcontractors_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL,
  service_type text,
  contact_person text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontractors_vendors TO authenticated;
GRANT ALL ON public.subcontractors_vendors TO service_role;
ALTER TABLE public.subcontractors_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors select" ON public.subcontractors_vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors insert" ON public.subcontractors_vendors FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "vendors update" ON public.subcontractors_vendors FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "vendors delete" ON public.subcontractors_vendors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_sheet_no text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT current_date,
  service_type text,
  unit_type text,
  quantity text,
  volume_weight text,
  origin text,
  destination text,
  selling_price numeric(16,2) NOT NULL DEFAULT 0,
  buying_price_est numeric(16,2) NOT NULL DEFAULT 0,
  status public.job_status NOT NULL DEFAULT 'Draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs select" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "jobs insert" ON public.jobs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "jobs update" ON public.jobs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "jobs delete" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.subcontractors_vendors(id) ON DELETE SET NULL,
  item_cost_description text,
  invoice_amount numeric(16,2) NOT NULL DEFAULT 0,
  payment_terms_days integer NOT NULL DEFAULT 0,
  due_date date,
  paid_amount numeric(16,2) NOT NULL DEFAULT 0,
  balance_remaining numeric(16,2) GENERATED ALWAYS AS (invoice_amount - paid_amount) STORED,
  payment_type public.payment_type NOT NULL DEFAULT 'Term',
  status public.ap_status NOT NULL DEFAULT 'Unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap select" ON public.accounts_payable FOR SELECT TO authenticated USING (true);
CREATE POLICY "ap insert" ON public.accounts_payable FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "ap update" ON public.accounts_payable FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations'));
CREATE POLICY "ap delete" ON public.accounts_payable FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_date date NOT NULL DEFAULT current_date,
  amount numeric(16,2) NOT NULL DEFAULT 0,
  payment_terms_days integer NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT current_date,
  paid_amount numeric(16,2) NOT NULL DEFAULT 0,
  remaining_amount numeric(16,2) GENERATED ALWAYS AS (amount - paid_amount) STORED,
  status public.ar_status NOT NULL DEFAULT 'Issued',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_receivable TO authenticated;
GRANT ALL ON public.accounts_receivable TO service_role;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar select" ON public.accounts_receivable FOR SELECT TO authenticated USING (true);
CREATE POLICY "ar insert" ON public.accounts_receivable FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "ar update" ON public.accounts_receivable FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "ar delete" ON public.accounts_receivable FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type public.reference_type NOT NULL,
  reference_id uuid,
  transaction_date date NOT NULL DEFAULT current_date,
  amount numeric(16,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'Bank Transfer',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt select" ON public.payment_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "pt insert" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "pt update" ON public.payment_transactions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "pt delete" ON public.payment_transactions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.sync_ap_status() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.status := CASE WHEN NEW.paid_amount >= NEW.invoice_amount AND NEW.invoice_amount > 0 THEN 'Paid'::public.ap_status
                     WHEN NEW.paid_amount > 0 THEN 'Partially Paid'::public.ap_status
                     ELSE 'Unpaid'::public.ap_status END;
  RETURN NEW;
END; $$;
CREATE TRIGGER ap_status_sync BEFORE INSERT OR UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION public.sync_ap_status();

CREATE OR REPLACE FUNCTION public.sync_ar_status() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'Draft'::public.ar_status THEN
    NEW.status := CASE WHEN NEW.paid_amount >= NEW.amount AND NEW.amount > 0 THEN 'Paid'::public.ar_status
                       WHEN NEW.paid_amount > 0 THEN 'Partially Paid'::public.ar_status
                       WHEN NEW.due_date < current_date THEN 'Overdue'::public.ar_status
                       ELSE 'Issued'::public.ar_status END;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ar_status_sync BEFORE INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.sync_ar_status();