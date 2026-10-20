-- Product ACTIVE is not an inventory guarantee. Existing items require review.
ALTER TABLE public.products ADD COLUMN stock_policy text NOT NULL DEFAULT 'review_required' CHECK(stock_policy IN ('review_required','not_required'));
ALTER TABLE public.products ADD CONSTRAINT uq_products_workspace_id UNIQUE(workspace_id,id);
CREATE TABLE public.ai_checkout_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 channel_instance_id uuid NOT NULL,thread_id uuid NOT NULL,contact_id uuid NOT NULL,product_id uuid NOT NULL,
 source_inbound_id uuid NOT NULL,source_created_at timestamptz NOT NULL,
 summary_message_id uuid,confirmation_message_id uuid,charge_id uuid,
 confirmation_code text NOT NULL CHECK(confirmation_code ~ '^[A-F0-9]{10}$'),
 product_title text NOT NULL,retailer_id text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
 unit_price_cents integer NOT NULL CHECK(unit_price_cents>0),total_cents integer NOT NULL CHECK(total_cents>0),
 currency text NOT NULL CHECK(currency='BRL'),capability_signature text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','consumed','superseded','expired','cancelled')),
 valid_until timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,confirmation_code),UNIQUE(workspace_id,source_inbound_id),UNIQUE(workspace_id,confirmation_message_id),
 CHECK(total_cents::bigint=unit_price_cents::bigint*quantity),
 CHECK((status='consumed' AND charge_id IS NOT NULL AND confirmation_message_id IS NOT NULL) OR (status<>'consumed' AND charge_id IS NULL AND confirmation_message_id IS NULL)),
 FOREIGN KEY(workspace_id,channel_instance_id,thread_id) REFERENCES commercial_threads(workspace_id,channel_instance_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id),
 FOREIGN KEY(workspace_id,product_id) REFERENCES products(workspace_id,id),
 FOREIGN KEY(workspace_id,channel_instance_id,source_inbound_id) REFERENCES messages(workspace_id,channel_instance_id,id),
 FOREIGN KEY(workspace_id,channel_instance_id,summary_message_id) REFERENCES messages(workspace_id,channel_instance_id,id),
 FOREIGN KEY(workspace_id,channel_instance_id,confirmation_message_id) REFERENCES messages(workspace_id,channel_instance_id,id),
 FOREIGN KEY(workspace_id,charge_id) REFERENCES pix_charges(workspace_id,id)
);
CREATE UNIQUE INDEX ai_checkout_one_pending ON ai_checkout_requests(workspace_id,thread_id) WHERE status='pending';
CREATE INDEX ai_checkout_thread_history ON ai_checkout_requests(workspace_id,thread_id,created_at DESC);
ALTER TABLE ai_checkout_requests OWNER TO sos_migration_owner;
ALTER TABLE ai_checkout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_checkout_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_checkout_owner ON ai_checkout_requests TO sos_migration_owner USING(true) WITH CHECK(true);
CREATE POLICY ai_checkout_tenant ON ai_checkout_requests TO sos_app_user,sos_worker_user
 USING(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid)
 WITH CHECK(workspace_id=NULLIF(current_setting('app.current_workspace_id',true),'')::uuid);
REVOKE ALL ON ai_checkout_requests FROM sos_app_user,sos_worker_user,sos_ingress_user;
GRANT SELECT ON ai_checkout_requests TO sos_app_user;
GRANT SELECT,INSERT,UPDATE ON ai_checkout_requests TO sos_worker_user;
CREATE FUNCTION protect_ai_checkout_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'summary_message_id'-'confirmation_message_id'-'charge_id'-'updated_at') IS DISTINCT FROM
    (to_jsonb(OLD)-'status'-'summary_message_id'-'confirmation_message_id'-'charge_id'-'updated_at') THEN
  RAISE EXCEPTION 'Checkout terms are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.status<>'pending' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
  RAISE EXCEPTION 'Completed checkout evidence is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.summary_message_id IS NOT NULL AND NEW.summary_message_id IS DISTINCT FROM OLD.summary_message_id THEN
  RAISE EXCEPTION 'Checkout summary is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
ALTER FUNCTION protect_ai_checkout_request() OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION protect_ai_checkout_request() FROM PUBLIC;
CREATE TRIGGER protect_ai_checkout_request BEFORE UPDATE ON ai_checkout_requests FOR EACH ROW EXECUTE FUNCTION protect_ai_checkout_request();
