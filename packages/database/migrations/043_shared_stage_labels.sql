ALTER TABLE public.workspaces ADD COLUMN commercial_stage_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN commercial_stage_labels_version integer NOT NULL DEFAULT 0;
