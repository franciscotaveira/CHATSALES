CREATE TABLE public.integration_event_receipts (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_key text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider, event_key)
);
ALTER TABLE public.integration_event_receipts OWNER TO sos_migration_owner;
ALTER TABLE public.integration_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_event_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_receipt_owner ON public.integration_event_receipts TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY integration_receipt_app ON public.integration_event_receipts TO sos_app_user
 USING (workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK (workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
GRANT SELECT, INSERT ON public.integration_event_receipts TO sos_app_user;
REVOKE ALL ON public.integration_event_receipts FROM sos_worker_user, sos_ingress_user;
