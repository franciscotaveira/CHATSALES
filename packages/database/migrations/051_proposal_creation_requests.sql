CREATE TABLE public.proposal_creation_requests (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 request_fingerprint text NOT NULL,
 proposal_id uuid NOT NULL REFERENCES public.commercial_proposals(id),
 pix_charge_id uuid REFERENCES public.pix_charges(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,request_key)
);
ALTER TABLE public.proposal_creation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_creation_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_creation_requests_app ON public.proposal_creation_requests FOR ALL TO sos_app_user USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid) WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
CREATE POLICY proposal_creation_requests_owner ON public.proposal_creation_requests FOR ALL TO sos_migration_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON public.proposal_creation_requests TO sos_app_user;
GRANT ALL ON public.proposal_creation_requests TO sos_migration_owner;
