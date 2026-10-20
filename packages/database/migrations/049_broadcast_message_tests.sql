CREATE TABLE public.broadcast_message_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 preparation_id uuid NOT NULL REFERENCES public.broadcast_preparations(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.users(id),
 variant text NOT NULL CHECK(variant IN ('A','B')),
 phone_e164 text NOT NULL,
 body_text text NOT NULL,
 template_id uuid NOT NULL REFERENCES public.message_templates(id),
 template_body text NOT NULL,
 template_name text NOT NULL,
 template_language text NOT NULL,
 outbound_command_id uuid NOT NULL REFERENCES public.outbound_commands(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,preparation_id,variant),
 UNIQUE(outbound_command_id)
);
ALTER TABLE public.broadcast_message_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_message_tests FORCE ROW LEVEL SECURITY;
CREATE POLICY broadcast_message_tests_app ON public.broadcast_message_tests FOR ALL TO sos_app_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid) WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY broadcast_message_tests_worker ON public.broadcast_message_tests FOR SELECT TO sos_worker_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY broadcast_message_tests_owner ON public.broadcast_message_tests FOR ALL TO sos_migration_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON public.broadcast_message_tests TO sos_app_user;
GRANT SELECT ON public.broadcast_message_tests TO sos_worker_user;
GRANT ALL ON public.broadcast_message_tests TO sos_migration_owner;
CREATE POLICY broadcast_preparations_worker ON public.broadcast_preparations FOR SELECT TO sos_worker_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
GRANT SELECT ON public.broadcast_preparations TO sos_worker_user;
