-- 1. profiles: users may only update their own full_name, never status/email
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
CREATE POLICY "own profile name update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 2a. activity_log: Operations only sees operational job entries (jobs table has no financial columns)
DROP POLICY IF EXISTS "activity select" ON public.activity_log;
CREATE POLICY "activity select" ON public.activity_log FOR SELECT TO authenticated
  USING (private.is_active_user(auth.uid()) AND (
    private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')
    OR (private.has_role(auth.uid(),'operations') AND job_id IS NOT NULL AND entity_type = 'jobs')));

-- 2b. activity_log: no client inserts; only definer functions/triggers write
DROP POLICY IF EXISTS "activity insert" ON public.activity_log;
REVOKE INSERT, UPDATE, DELETE ON public.activity_log FROM authenticated, anon;

-- 3. finance-attachments: reads limited to Owner and Finance
DROP POLICY IF EXISTS "finance attachments read" ON storage.objects;
CREATE POLICY "finance attachments read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'finance-attachments' AND private.is_active_user(auth.uid())
    AND (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')));

-- 4. accounts_payable: Operations inserts cannot preset payment or void fields
CREATE OR REPLACE FUNCTION private.ap_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, private AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(),'owner') OR private.has_role(auth.uid(),'finance')) THEN
    NEW.paid_amount := 0;
    NEW.status := 'Unpaid';
    NEW.is_void := false;
    NEW.voided_at := NULL; NEW.voided_by := NULL; NEW.void_reason := NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ap_insert_guard ON public.accounts_payable;
CREATE TRIGGER ap_insert_guard BEFORE INSERT ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION private.ap_insert_guard();