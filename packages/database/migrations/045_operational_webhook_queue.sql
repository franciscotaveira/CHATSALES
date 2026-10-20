ALTER TABLE public.outbound_webhook_subscriptions ADD COLUMN supports_idempotency boolean NOT NULL DEFAULT false;
ALTER TABLE public.outbound_webhook_subscriptions ALTER COLUMN is_active SET DEFAULT false;
UPDATE public.outbound_webhook_subscriptions SET is_active=false;
CREATE TABLE public.outbound_webhook_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES public.outbound_webhook_subscriptions(id) ON DELETE CASCADE,
 event_type text NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,lease_until timestamptz,worker_id text,error_message text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outbound_webhook_jobs OWNER TO sos_migration_owner;
ALTER TABLE public.outbound_webhook_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_jobs_owner ON public.outbound_webhook_jobs TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY webhook_jobs_app ON public.outbound_webhook_jobs FOR SELECT TO sos_app_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY webhook_jobs_worker ON public.outbound_webhook_jobs TO sos_worker_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid) WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
REVOKE ALL ON public.outbound_webhook_jobs FROM sos_app_user,sos_worker_user,sos_ingress_user;
GRANT SELECT ON public.outbound_webhook_jobs TO sos_app_user;
GRANT SELECT,UPDATE ON public.outbound_webhook_jobs TO sos_worker_user;
-- Scope subscription secrets to the job tenant, not a global worker read.
DROP POLICY worker_user_outbound_webhooks ON public.outbound_webhook_subscriptions;
CREATE POLICY worker_user_outbound_webhooks ON public.outbound_webhook_subscriptions FOR SELECT TO sos_worker_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
DROP POLICY worker_user_outbound_deliveries ON public.outbound_webhook_deliveries;
CREATE POLICY worker_user_outbound_deliveries ON public.outbound_webhook_deliveries FOR INSERT TO sos_worker_user WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);

CREATE FUNCTION public.enqueue_operational_webhook() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE kind text; event jsonb;
BEGIN
 kind:=TG_ARGV[0];
 IF kind='message.received' THEN
   IF NEW.direction<>'inbound' THEN RETURN NEW; END IF;
 ELSIF kind='payment.settled' THEN
   IF NEW.status<>'PAID' OR OLD.status='PAID' THEN RETURN NEW; END IF;
 ELSIF kind='stage.changed' THEN
   IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;
 END IF;
 event:=jsonb_build_object('id',gen_random_uuid(),'type',kind,'workspaceId',NEW.workspace_id,'resourceId',NEW.id,'occurredAt',clock_timestamp());
 INSERT INTO public.outbound_webhook_jobs(workspace_id,subscription_id,event_type,payload)
 SELECT NEW.workspace_id,s.id,kind,event FROM public.outbound_webhook_subscriptions s
 WHERE s.workspace_id=NEW.workspace_id AND s.is_active AND (kind=ANY(s.events) OR '*'=ANY(s.events));
 RETURN NEW;
END $$;
ALTER FUNCTION public.enqueue_operational_webhook() OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.enqueue_operational_webhook() FROM PUBLIC;
CREATE TRIGGER webhook_contact AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.enqueue_operational_webhook('lead.created');
CREATE TRIGGER webhook_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enqueue_operational_webhook('message.received');
CREATE TRIGGER webhook_proposal AFTER INSERT ON public.commercial_proposals FOR EACH ROW EXECUTE FUNCTION public.enqueue_operational_webhook('proposal.created');
CREATE TRIGGER webhook_payment AFTER UPDATE OF status ON public.pix_charges FOR EACH ROW EXECUTE FUNCTION public.enqueue_operational_webhook('payment.settled');
CREATE TRIGGER webhook_stage AFTER UPDATE OF stage ON public.commercial_journeys FOR EACH ROW EXECUTE FUNCTION public.enqueue_operational_webhook('stage.changed');
CREATE FUNCTION public.suspend_changed_webhook_jobs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT NEW.is_active OR NEW.url IS DISTINCT FROM OLD.url OR NEW.events IS DISTINCT FROM OLD.events THEN
 UPDATE public.outbound_webhook_jobs SET status='suspended',updated_at=now(),error_message='Integration changed or disabled; review required' WHERE subscription_id=NEW.id AND status IN ('pending','failed');
 END IF;RETURN NEW;
END $$;
ALTER FUNCTION public.suspend_changed_webhook_jobs() OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.suspend_changed_webhook_jobs() FROM PUBLIC;
CREATE TRIGGER webhook_suspend AFTER UPDATE ON public.outbound_webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.suspend_changed_webhook_jobs();
CREATE FUNCTION public.claim_operational_webhook_jobs(p_worker text,p_limit integer) RETURNS TABLE(id uuid,workspace_id uuid,lease_token uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_limit<1 OR p_limit>100 OR length(p_worker)<1 THEN RAISE EXCEPTION 'Invalid claim'; END IF;
 UPDATE public.outbound_webhook_jobs j SET status='uncertain',error_message='Expired in-flight delivery; review before retry',updated_at=now() WHERE j.status='processing' AND j.lease_until<now();
 RETURN QUERY WITH picked AS (SELECT j.id FROM public.outbound_webhook_jobs j WHERE j.status IN ('pending','failed') AND j.next_attempt_at<=now() AND j.attempts<3 ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit)
 UPDATE public.outbound_webhook_jobs j SET status='processing',attempts=j.attempts+1,worker_id=p_worker,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() FROM picked WHERE j.id=picked.id RETURNING j.id,j.workspace_id,j.lease_token;
END $$;
ALTER FUNCTION public.claim_operational_webhook_jobs(text,integer) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.claim_operational_webhook_jobs(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_operational_webhook_jobs(text,integer) TO sos_worker_user;
