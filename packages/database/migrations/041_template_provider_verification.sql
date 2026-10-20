ALTER TABLE public.message_templates
 ADD COLUMN meta_verified_at timestamptz,
 ADD COLUMN meta_verified_channel_id uuid;
ALTER TABLE public.message_templates ADD CONSTRAINT fk_template_verified_channel
 FOREIGN KEY (workspace_id,meta_verified_channel_id) REFERENCES public.channel_instances(workspace_id,id)
 ON DELETE SET NULL (meta_verified_channel_id);
-- Existing local labels are not proof of current approval at the provider.
UPDATE public.message_templates SET status='PENDING' WHERE status='APPROVED';
ALTER TABLE public.message_templates ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE public.whatsapp_flows ALTER COLUMN status SET DEFAULT 'DRAFT';
UPDATE public.whatsapp_flows SET status='DRAFT' WHERE meta_flow_id LIKE 'meta_flow_%' AND status='PUBLISHED';
