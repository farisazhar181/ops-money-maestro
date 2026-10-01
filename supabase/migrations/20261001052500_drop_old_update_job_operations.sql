-- Remove the old 9-argument update_job_operations overloads.
-- The app only calls the newer version that also accepts commodity, ETD and ETA.
DROP FUNCTION IF EXISTS public.update_job_operations(uuid, uuid, date, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS private.update_job_operations_impl(uuid, uuid, date, text, text, text, text, text, text);
