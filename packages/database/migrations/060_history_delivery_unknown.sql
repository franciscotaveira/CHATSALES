-- History without a provider receipt must not claim delivery or read confirmation.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_delivery_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('queued','sent','delivered','read','failed','unknown'));
-- Existing imported records are preserved: a later receipt may have legitimately updated them.
