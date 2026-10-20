-- New companies start without inferred AI permissions. Existing choices are preserved.
ALTER TABLE public.workspaces ALTER COLUMN ai_skills SET DEFAULT '{}'::jsonb;
