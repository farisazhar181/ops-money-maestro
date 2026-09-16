ALTER FUNCTION public.record_ap_payment(uuid,date,numeric) RENAME TO record_ap_payment_impl;
ALTER FUNCTION public.record_ap_payment_impl(uuid,date,numeric) SET SCHEMA private;
ALTER FUNCTION public.record_ar_payment(uuid,date,numeric) RENAME TO record_ar_payment_impl;
ALTER FUNCTION public.record_ar_payment_impl(uuid,date,numeric) SET SCHEMA private;
ALTER FUNCTION public.assign_user_role(uuid,public.app_role) RENAME TO assign_user_role_impl;
ALTER FUNCTION public.assign_user_role_impl(uuid,public.app_role) SET SCHEMA private;
ALTER FUNCTION public.deactivate_user(uuid) RENAME TO deactivate_user_impl;
ALTER FUNCTION public.deactivate_user_impl(uuid) SET SCHEMA private;
ALTER FUNCTION public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text) RENAME TO update_job_operations_impl;
ALTER FUNCTION public.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text) SET SCHEMA private;
ALTER FUNCTION public.close_job_financials(uuid,numeric,numeric,public.job_status) RENAME TO close_job_financials_impl;
ALTER FUNCTION public.close_job_financials_impl(uuid,numeric,numeric,public.job_status) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.record_ap_payment_impl(uuid,date,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.record_ar_payment_impl(uuid,date,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.assign_user_role_impl(uuid,public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.deactivate_user_impl(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.close_job_financials_impl(uuid,numeric,numeric,public.job_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_ap_payment_impl(uuid,date,numeric), private.record_ar_payment_impl(uuid,date,numeric), private.assign_user_role_impl(uuid,public.app_role), private.deactivate_user_impl(uuid), private.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text), private.close_job_financials_impl(uuid,numeric,numeric,public.job_status) TO authenticated;

CREATE FUNCTION public.record_ap_payment(_ap_id uuid,_payment_date date,_amount numeric) RETURNS public.accounts_payable LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.record_ap_payment_impl(_ap_id,_payment_date,_amount) $$;
CREATE FUNCTION public.record_ar_payment(_ar_id uuid,_payment_date date,_amount numeric) RETURNS public.accounts_receivable LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.record_ar_payment_impl(_ar_id,_payment_date,_amount) $$;
CREATE FUNCTION public.assign_user_role(_user_id uuid,_role public.app_role) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.assign_user_role_impl(_user_id,_role) $$;
CREATE FUNCTION public.deactivate_user(_user_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.deactivate_user_impl(_user_id) $$;
CREATE FUNCTION public.update_job_operations(_job_id uuid,_customer_id uuid,_order_date date,_service_type text,_unit_type text,_quantity text,_volume_weight text,_origin text,_destination text) RETURNS public.jobs LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.update_job_operations_impl(_job_id,_customer_id,_order_date,_service_type,_unit_type,_quantity,_volume_weight,_origin,_destination) $$;
CREATE FUNCTION public.close_job_financials(_job_id uuid,_actual_selling numeric,_actual_buying numeric,_status public.job_status) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,private AS $$ SELECT private.close_job_financials_impl(_job_id,_actual_selling,_actual_buying,_status) $$;
REVOKE ALL ON FUNCTION public.record_ap_payment(uuid,date,numeric), public.record_ar_payment(uuid,date,numeric), public.assign_user_role(uuid,public.app_role), public.deactivate_user(uuid), public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text), public.close_job_financials(uuid,numeric,numeric,public.job_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ap_payment(uuid,date,numeric), public.record_ar_payment(uuid,date,numeric), public.assign_user_role(uuid,public.app_role), public.deactivate_user(uuid), public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text), public.close_job_financials(uuid,numeric,numeric,public.job_status) TO authenticated;