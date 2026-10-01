CREATE OR REPLACE FUNCTION private.update_job_operations_impl(
  _job_id uuid,
  _customer_id uuid,
  _order_date date,
  _service_type text,
  _unit_type text,
  _quantity text,
  _volume_weight text,
  _origin text,
  _destination text,
  _commodity text,
  _etd date,
  _eta date
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, private
AS $$
DECLARE
  v_job public.jobs;
  v_user uuid := auth.uid();
  v_old jsonb;
BEGIN
  IF NOT private.is_active_user(v_user)
     OR NOT (
       private.has_role(v_user, 'owner')
       OR private.has_role(v_user, 'finance')
       OR private.has_role(v_user, 'operations')
     ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF v_job.is_void THEN RAISE EXCEPTION 'Voided jobs cannot be edited'; END IF;
  IF v_job.status = 'Closed' AND private.has_role(v_user, 'operations') THEN
    RAISE EXCEPTION 'Closed jobs cannot be edited by Operations';
  END IF;

  v_old := to_jsonb(v_job);
  UPDATE public.jobs
  SET customer_id = _customer_id,
      order_date = _order_date,
      service_type = _service_type,
      unit_type = _unit_type,
      quantity = _quantity,
      volume_weight = _volume_weight,
      origin = _origin,
      destination = _destination,
      commodity = NULLIF(trim(COALESCE(_commodity, '')), ''),
      etd = _etd,
      eta = _eta,
      updated_at = now()
  WHERE id = _job_id
  RETURNING * INTO v_job;

  PERFORM private.log_change(
    v_user,
    'edited',
    'jobs',
    _job_id,
    _job_id,
    'Updated cargo and route details',
    v_old,
    to_jsonb(v_job)
  );
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION private.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text,text,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_job_operations(
  _job_id uuid,
  _customer_id uuid,
  _order_date date,
  _service_type text,
  _unit_type text,
  _quantity text,
  _volume_weight text,
  _origin text,
  _destination text,
  _commodity text,
  _etd date,
  _eta date
)
RETURNS public.jobs
LANGUAGE sql
SECURITY INVOKER
SET search_path TO public, private
AS $$
  SELECT private.update_job_operations_impl(
    _job_id,
    _customer_id,
    _order_date,
    _service_type,
    _unit_type,
    _quantity,
    _volume_weight,
    _origin,
    _destination,
    _commodity,
    _etd,
    _eta
  )
$$;

REVOKE ALL ON FUNCTION public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text,text,date,date) TO authenticated;

REVOKE ALL ON FUNCTION public.update_job_operations(uuid,uuid,date,text,text,text,text,text,text) FROM authenticated;
REVOKE ALL ON FUNCTION private.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text) FROM authenticated;