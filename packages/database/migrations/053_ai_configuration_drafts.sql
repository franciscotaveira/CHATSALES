-- Immutable configuration drafts. Runtime continues to read the published workspace columns.
CREATE TABLE public.ai_agent_versions (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object' AND NOT config ? 'apiKey'),
 key_policy text NOT NULL CHECK(key_policy IN ('inherit','draft','none')),
 credential_envelope jsonb,
 source_guided_revision integer,
 base_active_hash text NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,revision),
 CHECK((key_policy='draft' AND credential_envelope IS NOT NULL) OR (key_policy<>'draft' AND credential_envelope IS NULL))
);
CREATE TABLE public.ai_agent_version_heads (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 draft_revision integer NOT NULL DEFAULT 0 CHECK(draft_revision>=0),
 active_revision integer NOT NULL DEFAULT 0 CHECK(active_revision>=0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.ai_agent_versions OWNER TO sos_migration_owner;
ALTER TABLE public.ai_agent_version_heads OWNER TO sos_migration_owner;
ALTER TABLE public.ai_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_version_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_version_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_versions_owner ON public.ai_agent_versions TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY ai_heads_owner ON public.ai_agent_version_heads TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY ai_versions_tenant ON public.ai_agent_versions TO sos_app_user
 USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY ai_heads_tenant ON public.ai_agent_version_heads TO sos_app_user
 USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
GRANT SELECT,INSERT ON public.ai_agent_versions TO sos_app_user;
GRANT SELECT,INSERT,UPDATE ON public.ai_agent_version_heads TO sos_app_user;
REVOKE ALL ON public.ai_agent_versions,public.ai_agent_version_heads FROM sos_worker_user,sos_ingress_user;
