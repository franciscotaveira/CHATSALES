-- Lifecycle events are observations, never authority to activate a channel.
CREATE OR REPLACE FUNCTION public.apply_channel_connection_observation(
 p_workspace_id uuid,p_channel_id uuid,p_inbox_id uuid,p_lease_token uuid,p_worker_id text,p_status text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE received timestamptz; affected integer;
BEGIN
 IF p_workspace_id IS NULL OR p_workspace_id IS DISTINCT FROM NULLIF(current_setting('app.current_workspace_id',true),'')::uuid THEN
  RAISE EXCEPTION 'Workspace context mismatch';
 END IF;
 IF p_status IS NULL OR p_status NOT IN ('connected','error','pairing') THEN RAISE EXCEPTION 'Invalid connection observation'; END IF;
 SELECT received_at INTO received FROM public.channel_webhook_inbox
 WHERE workspace_id=p_workspace_id AND channel_instance_id=p_channel_id AND id=p_inbox_id
  AND status='processing' AND lease_token=p_lease_token AND worker_id=p_worker_id AND lease_until>clock_timestamp();
 IF received IS NULL THEN RETURN false; END IF;
 IF p_status='connected' THEN RETURN false; END IF;
 UPDATE public.channel_instances SET status=p_status,is_active=false,updated_at=clock_timestamp()
 WHERE workspace_id=p_workspace_id AND id=p_channel_id AND status<>'revoked' AND updated_at<=received;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END; $$;
ALTER FUNCTION public.apply_channel_connection_observation(uuid,uuid,uuid,uuid,text,text) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.apply_channel_connection_observation(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_channel_connection_observation(uuid,uuid,uuid,uuid,text,text) TO sos_worker_user;
