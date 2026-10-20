CREATE TABLE public.ai_revision_test_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision integer NOT NULL,
 scenario_id text NOT NULL,
 title text NOT NULL,
 question text NOT NULL,
 expected text NOT NULL,
 verifier_version text NOT NULL,
 configuration_hash text NOT NULL,
 request_key uuid NOT NULL,
 actor_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','failed')),
 lease_token uuid NOT NULL,
 lease_expires_at timestamptz NOT NULL,
 reply_text text,
 checks jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(checks)='array'),
 intent jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(intent)='object'),
 provider text,
 model text,
 sources_hash text,
 catalog_snapshot jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(catalog_snapshot)='array'),
 failure_code text,
 failure_message text,
 is_synthetic boolean NOT NULL DEFAULT false,
 review_revision integer NOT NULL DEFAULT 0 CHECK(review_revision>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,id),
 UNIQUE(workspace_id,request_key),
 FOREIGN KEY(workspace_id,revision) REFERENCES public.ai_agent_versions(workspace_id,revision) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ai_revision_one_running ON public.ai_revision_test_runs(workspace_id) WHERE status='running';
CREATE INDEX ai_revision_test_history ON public.ai_revision_test_runs(workspace_id,revision,created_at DESC);
CREATE TABLE public.ai_revision_test_reviews (
 workspace_id uuid NOT NULL,
 run_id uuid NOT NULL,
 review_revision integer NOT NULL CHECK(review_revision>0),
 verdict text NOT NULL CHECK(verdict IN ('adequate','needs_changes')),
 note text NOT NULL CHECK(char_length(note) BETWEEN 10 AND 2000),
 reviewed_by uuid NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,run_id,review_revision),
 FOREIGN KEY(workspace_id,run_id) REFERENCES public.ai_revision_test_runs(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_revision_test_runs OWNER TO sos_migration_owner;
ALTER TABLE public.ai_revision_test_reviews OWNER TO sos_migration_owner;
ALTER TABLE public.ai_revision_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revision_test_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revision_test_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revision_test_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_test_run_owner ON public.ai_revision_test_runs TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY ai_test_review_owner ON public.ai_revision_test_reviews TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY ai_test_run_tenant ON public.ai_revision_test_runs TO sos_app_user
 USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY ai_test_review_tenant ON public.ai_revision_test_reviews TO sos_app_user
 USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
REVOKE ALL ON public.ai_revision_test_runs,public.ai_revision_test_reviews FROM sos_app_user,sos_worker_user,sos_ingress_user;
GRANT SELECT,INSERT,UPDATE ON public.ai_revision_test_runs TO sos_app_user;
GRANT SELECT,INSERT ON public.ai_revision_test_reviews TO sos_app_user;

CREATE FUNCTION public.protect_ai_revision_test() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.workspace_id,NEW.revision,NEW.scenario_id,NEW.title,NEW.question,NEW.expected,
        NEW.verifier_version,NEW.configuration_hash,NEW.request_key,NEW.actor_id,NEW.is_synthetic,
        NEW.lease_token,NEW.lease_expires_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.revision,OLD.scenario_id,OLD.title,OLD.question,OLD.expected,
        OLD.verifier_version,OLD.configuration_hash,OLD.request_key,OLD.actor_id,OLD.is_synthetic,
        OLD.lease_token,OLD.lease_expires_at,OLD.created_at) THEN
  RAISE EXCEPTION 'AI test identity and scenario are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.status<>'running' AND
   (to_jsonb(NEW)-'review_revision'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'review_revision'-'updated_at') THEN
  RAISE EXCEPTION 'Completed AI test evidence is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.review_revision<OLD.review_revision OR NEW.review_revision>OLD.review_revision+1 THEN
  RAISE EXCEPTION 'Invalid AI review revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
ALTER FUNCTION public.protect_ai_revision_test() OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.protect_ai_revision_test() FROM PUBLIC;
CREATE TRIGGER protect_ai_revision_test_before_update BEFORE UPDATE ON public.ai_revision_test_runs
 FOR EACH ROW EXECUTE FUNCTION public.protect_ai_revision_test();
