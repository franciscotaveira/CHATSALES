-- Guided MVP plans are independent of live AI configuration. No worker access.
CREATE TABLE public.guided_agent_plans (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  draft jsonb NOT NULL,
  reviews jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_revision integer,
  approved_by uuid,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guided_agent_plans OWNER TO sos_migration_owner;
ALTER TABLE public.guided_agent_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_agent_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY guided_plan_owner ON public.guided_agent_plans TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY guided_plan_tenant ON public.guided_agent_plans TO sos_app_user
  USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON public.guided_agent_plans TO sos_app_user;
REVOKE ALL ON public.guided_agent_plans FROM sos_worker_user, sos_ingress_user;
