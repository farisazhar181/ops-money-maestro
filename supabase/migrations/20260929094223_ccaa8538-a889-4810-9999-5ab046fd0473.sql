CREATE OR REPLACE FUNCTION private.log_master_data() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_row jsonb := to_jsonb(COALESCE(NEW, OLD)); v_name text; v_label text := CASE WHEN TG_TABLE_NAME='customers' THEN 'customer' ELSE 'vendor' END;
BEGIN
  v_name := COALESCE(v_row->>'company_name', v_row->>'vendor_name', '');
  PERFORM private.log_change(auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'edited' ELSE 'deleted' END,
    TG_TABLE_NAME, (v_row->>'id')::uuid, NULL,
    initcap(CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END)||' '||v_label||' '||v_name,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$;