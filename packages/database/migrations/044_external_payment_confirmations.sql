CREATE TABLE public.external_payment_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 provider text NOT NULL, external_order_id text NOT NULL, contact_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),currency text NOT NULL DEFAULT 'BRL',
 title text NOT NULL,status text NOT NULL DEFAULT 'approved',confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,provider,external_order_id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES public.contacts(workspace_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.external_payment_confirmations OWNER TO sos_migration_owner;
ALTER TABLE public.external_payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_payment_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY external_payment_owner ON public.external_payment_confirmations TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY external_payment_app ON public.external_payment_confirmations TO sos_app_user
 USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
GRANT SELECT,INSERT ON public.external_payment_confirmations TO sos_app_user;
REVOKE ALL ON public.external_payment_confirmations FROM sos_worker_user,sos_ingress_user;
