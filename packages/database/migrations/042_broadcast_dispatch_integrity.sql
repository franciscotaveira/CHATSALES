ALTER TABLE public.broadcast_campaigns ADD COLUMN request_key uuid, ADD COLUMN request_fingerprint text, ADD COLUMN target_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX uq_campaign_request ON public.broadcast_campaigns(workspace_id,request_key) WHERE request_key IS NOT NULL;
ALTER TABLE public.broadcast_recipients ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE public.broadcast_recipients ALTER COLUMN sent_at DROP DEFAULT;
ALTER TABLE public.broadcast_recipients ALTER COLUMN status SET DEFAULT 'queued';
CREATE UNIQUE INDEX uq_recipient_command ON public.broadcast_recipients(outbound_command_id) WHERE outbound_command_id IS NOT NULL;
