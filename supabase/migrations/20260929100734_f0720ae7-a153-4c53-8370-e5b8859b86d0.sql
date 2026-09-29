DO $do$ DECLARE d text; BEGIN
  d := pg_get_functiondef('private.update_job_operations_impl(uuid,uuid,date,text,text,text,text,text,text)'::regprocedure);
  d := replace(d, $$(private.has_role(v_user,'owner') OR private.has_role(v_user,'operations'))$$, $$(private.has_role(v_user,'owner') OR private.has_role(v_user,'finance') OR private.has_role(v_user,'operations'))$$);
  EXECUTE d;
END $do$;