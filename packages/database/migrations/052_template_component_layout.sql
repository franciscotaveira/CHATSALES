ALTER TABLE public.message_templates
 ADD COLUMN provider_components jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN parameter_format text NOT NULL DEFAULT 'POSITIONAL';
ALTER TABLE public.message_templates ADD CONSTRAINT ck_template_components_array CHECK(jsonb_typeof(provider_components)='array');
ALTER TABLE public.message_templates ADD CONSTRAINT ck_template_parameter_format CHECK(parameter_format IN ('POSITIONAL','NAMED'));
-- Previously synchronized rows did not retain enough information to prove a complete layout.
UPDATE public.message_templates SET meta_verified_at=NULL WHERE meta_template_id IS NOT NULL;
