-- Unknown is intentional for existing and manually configured channels.
-- Provider type and historical activity do not prove a webhook subscription.
ALTER TABLE public.channel_instances
 ADD COLUMN meta_subscription_status text NOT NULL DEFAULT 'unknown'
 CHECK (meta_subscription_status IN ('unknown','confirmed','failed','uncertain')),
 ADD COLUMN meta_subscription_checked_at timestamptz;
COMMENT ON COLUMN public.channel_instances.meta_subscription_status IS 'Last observed registration subscription result; not proof of webhook delivery or end-to-end readiness';
