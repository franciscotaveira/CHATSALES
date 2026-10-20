DO $$ BEGIN IF current_database()<>'chat_sales_lab' THEN RAISE EXCEPTION 'Laboratório obrigatório'; END IF; END $$;
UPDATE public.channel_instances SET is_active=false,status='unconfigured',updated_at=now()
WHERE id='d2222222-2222-4222-8222-222222222222' AND workspace_id='b1111111-1111-4111-8111-111111111111' AND display_name LIKE 'SIMULADO%';
UPDATE public.message_templates SET status='PENDING',updated_at=now()
WHERE id='e2222222-2222-4222-8222-222222222222' AND workspace_id='b1111111-1111-4111-8111-111111111111' AND name='sim_review_local_only';
