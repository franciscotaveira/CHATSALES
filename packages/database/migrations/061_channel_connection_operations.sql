CREATE TABLE public.channel_session_bindings (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 channel_id uuid NOT NULL,
 session_key text NOT NULL UNIQUE CHECK(session_key ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,channel_id),
 FOREIGN KEY(workspace_id,channel_id) REFERENCES public.channel_instances(workspace_id,id)
);
CREATE TABLE public.channel_connection_operations (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 channel_id uuid NOT NULL,
 request_key uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.users(id),
 action text NOT NULL CHECK(action IN ('create','start','restart')),
 expected_revision text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','completed','failed','uncertain','reviewed')),
 result jsonb,
 lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,channel_id,request_key),
 FOREIGN KEY(workspace_id,channel_id) REFERENCES public.channel_instances(workspace_id,id)
);
CREATE UNIQUE INDEX channel_connection_one_open ON public.channel_connection_operations(workspace_id,channel_id) WHERE state IN ('pending','uncertain');
ALTER TABLE public.channel_session_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_session_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY channel_session_bindings_app ON public.channel_session_bindings FOR ALL TO sos_app_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid) WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY channel_session_bindings_owner ON public.channel_session_bindings FOR ALL TO sos_migration_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON public.channel_session_bindings TO sos_app_user;
GRANT ALL ON public.channel_session_bindings TO sos_migration_owner;
ALTER TABLE public.channel_connection_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connection_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY channel_connection_operations_app ON public.channel_connection_operations FOR ALL TO sos_app_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid) WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY channel_connection_operations_owner ON public.channel_connection_operations FOR ALL TO sos_migration_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON public.channel_connection_operations TO sos_app_user;
GRANT ALL ON public.channel_connection_operations TO sos_migration_owner;
