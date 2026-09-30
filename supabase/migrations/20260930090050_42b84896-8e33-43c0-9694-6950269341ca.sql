ALTER TABLE public.jobs ADD COLUMN commodity text, ADD COLUMN etd date, ADD COLUMN eta date;

CREATE OR REPLACE FUNCTION private.create_job_impl(_job_sheet_no text, _customer_id uuid, _order_date date, _service_type text, _unit_type text, _quantity text, _volume_weight text, _origin text, _destination text, _estimated_selling numeric, _estimated_buying numeric, _commodity text DEFAULT NULL, _etd date DEFAULT NULL, _eta date DEFAULT NULL)
RETURNS jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE v_user uuid := private.assert_any_actor(); v_fin boolean; v_job public.jobs; v_f public.job_financials;
BEGIN
  v_fin := private.has_role(v_user,'owner') OR private.has_role(v_user,'finance');
  IF trim(COALESCE(_job_sheet_no,''))='' THEN RAISE EXCEPTION 'Job sheet number is required'; END IF;
  IF NOT v_fin AND (_estimated_selling IS NOT NULL OR _estimated_buying IS NOT NULL) THEN RAISE EXCEPTION 'Only Owner or Finance can set job pricing'; END IF;
  IF COALESCE(_estimated_selling,0)<=0 OR COALESCE(_estimated_buying,0)<=0 THEN RAISE EXCEPTION 'Estimated selling and estimated buying must both be greater than zero'; END IF;
  INSERT INTO public.jobs(job_sheet_no,customer_id,order_date,service_type,unit_type,quantity,volume_weight,origin,destination,commodity,etd,eta,status,created_by)
  VALUES(trim(_job_sheet_no),_customer_id,COALESCE(_order_date,private.jkt_today()),_service_type,_unit_type,_quantity,_volume_weight,_origin,_destination,NULLIF(trim(COALESCE(_commodity,'')),''),_etd,_eta,'Pipeline',v_user)
  RETURNING * INTO v_job;
  IF v_fin THEN
    INSERT INTO public.job_financials(job_id,estimated_selling,estimated_buying) VALUES(v_job.id,_estimated_selling,_estimated_buying) RETURNING * INTO v_f;
    PERFORM private.log_change(v_user,'created','job_financials',v_job.id,v_job.id,'Set job estimates',NULL,to_jsonb(v_f));
  END IF;
  RETURN v_job;
END $function$;

CREATE OR REPLACE FUNCTION public.create_job(_job_sheet_no text, _customer_id uuid, _order_date date, _service_type text, _unit_type text, _quantity text, _volume_weight text, _origin text, _destination text, _estimated_selling numeric DEFAULT NULL::numeric, _estimated_buying numeric DEFAULT NULL::numeric, _commodity text DEFAULT NULL::text, _etd date DEFAULT NULL::date, _eta date DEFAULT NULL::date)
RETURNS jobs
LANGUAGE sql
SET search_path TO 'public', 'private'
AS $function$ SELECT private.create_job_impl(_job_sheet_no,_customer_id,_order_date,_service_type,_unit_type,_quantity,_volume_weight,_origin,_destination,_estimated_selling,_estimated_buying,_commodity,_etd,_eta) $function$;