-- Earlier default privileges grant CRUD to every new table. Explicitly narrow these tables.
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.ai_agent_versions FROM sos_app_user;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.ai_agent_version_heads FROM sos_app_user;
ALTER TABLE public.ai_agent_version_heads ALTER COLUMN draft_revision DROP DEFAULT;
ALTER TABLE public.ai_agent_version_heads ADD CONSTRAINT ai_head_positive_draft CHECK(draft_revision>0);
ALTER TABLE public.ai_agent_version_heads ADD CONSTRAINT ai_head_active_not_ahead CHECK(active_revision<=draft_revision);
ALTER TABLE public.ai_agent_version_heads ADD CONSTRAINT ai_head_draft_exists
 FOREIGN KEY(workspace_id,draft_revision) REFERENCES public.ai_agent_versions(workspace_id,revision);
ALTER TABLE public.ai_agent_versions ADD CONSTRAINT ai_version_source_positive CHECK(source_guided_revision IS NULL OR source_guided_revision>0);
