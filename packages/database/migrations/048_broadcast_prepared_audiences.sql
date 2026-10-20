CREATE TABLE public.broadcast_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_fingerprint text NOT NULL,
  content_fingerprint text NOT NULL,
  target_snapshot jsonb NOT NULL,
  excluded_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes'
);
ALTER TABLE public.broadcast_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_preparations FORCE ROW LEVEL SECURITY;
CREATE POLICY broadcast_preparations_app ON public.broadcast_preparations FOR ALL TO sos_app_user
  USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
  WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY broadcast_preparations_owner ON public.broadcast_preparations FOR ALL TO sos_migration_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON public.broadcast_preparations TO sos_app_user;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.broadcast_preparations TO sos_migration_owner;
CREATE INDEX ON public.broadcast_preparations(workspace_id,expires_at);
