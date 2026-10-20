-- =========================================================================
-- SOS Sales V3 — Migration 064: AbacatePay Gateway Integration
-- =========================================================================
-- Context: 1-Click Pix Checkout & Automated Webhook Settlement via AbacatePay
-- Compliance:
--   - Truth in Data: Real financial metadata from AbacatePay (charge ID, checkout URL)
--   - Tenant Isolation: Scoped to workspace via existing RLS on workspaces and pix_charges
--   - Zero mock data in production
-- =========================================================================

-- 1. Workspace AbacatePay Configuration
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS abacatepay_api_key text,
  ADD COLUMN IF NOT EXISTS abacatepay_webhook_secret text,
  ADD COLUMN IF NOT EXISTS abacatepay_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.abacatepay_api_key IS 'API Key (Token) for AbacatePay integration (bearer auth)';
COMMENT ON COLUMN public.workspaces.abacatepay_webhook_secret IS 'Webhook Secret used for HMAC-SHA256 signature verification or query parameter match';
COMMENT ON COLUMN public.workspaces.abacatepay_enabled IS 'Flag indicating if AbacatePay is actively enabled for new Pix/Card billings';

-- 2. Pix Charges Gateway Metadata
ALTER TABLE public.pix_charges
  ADD COLUMN IF NOT EXISTS gateway_provider text NOT NULL DEFAULT 'bacen_native'
    CHECK (gateway_provider IN ('bacen_native', 'abacatepay', 'cakto')),
  ADD COLUMN IF NOT EXISTS gateway_charge_id text,
  ADD COLUMN IF NOT EXISTS gateway_checkout_url text;

COMMENT ON COLUMN public.pix_charges.gateway_provider IS 'Provider used to issue and settle the charge (bacen_native, abacatepay, or cakto)';
COMMENT ON COLUMN public.pix_charges.gateway_charge_id IS 'External billing/charge identifier returned by the payment gateway';
COMMENT ON COLUMN public.pix_charges.gateway_checkout_url IS 'Direct customer-facing payment checkout URL provided by the gateway';

CREATE INDEX IF NOT EXISTS idx_pix_charges_gateway_charge 
  ON public.pix_charges(workspace_id, gateway_charge_id) 
  WHERE gateway_charge_id IS NOT NULL;
