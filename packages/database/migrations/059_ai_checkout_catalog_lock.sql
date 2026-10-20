-- Worker can lock a catalog row for checkout without receiving product UPDATE permission.
CREATE FUNCTION public.lock_ai_checkout_product(p_workspace uuid,p_product uuid) RETURNS SETOF public.products
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NULLIF(current_setting('app.current_workspace_id',true),'')::uuid IS DISTINCT FROM p_workspace THEN
  RAISE EXCEPTION 'Checkout workspace context required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT p.* FROM public.products p WHERE p.workspace_id=p_workspace AND p.id=p_product FOR SHARE;
END;
$$;
ALTER FUNCTION public.lock_ai_checkout_product(uuid,uuid) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.lock_ai_checkout_product(uuid,uuid) FROM PUBLIC,sos_app_user,sos_ingress_user;
GRANT EXECUTE ON FUNCTION public.lock_ai_checkout_product(uuid,uuid) TO sos_worker_user;
