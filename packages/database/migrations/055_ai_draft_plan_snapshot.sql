-- Retain the exact approved plan/cases used to prepare a configuration revision.
-- Existing versions remain without a snapshot; do not infer historical plan contents.
ALTER TABLE public.ai_agent_versions ADD COLUMN guided_snapshot jsonb
 CHECK(guided_snapshot IS NULL OR jsonb_typeof(guided_snapshot)='object');
ALTER TABLE public.ai_agent_versions ADD COLUMN guided_modified boolean NOT NULL DEFAULT false;
