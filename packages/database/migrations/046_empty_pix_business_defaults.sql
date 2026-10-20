-- New companies must supply their own beneficiary details. Preserve existing records for explicit review.
ALTER TABLE public.workspaces ALTER COLUMN default_pix_merchant_name DROP DEFAULT;
ALTER TABLE public.workspaces ALTER COLUMN default_pix_merchant_city DROP DEFAULT;
