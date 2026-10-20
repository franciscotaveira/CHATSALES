DO $$ BEGIN IF current_database() <> 'chat_sales_lab' THEN RAISE EXCEPTION 'Lab only'; END IF; END $$;
INSERT INTO public.broadcast_campaigns(id,workspace_id,name,channel_instance_id,variant_a_template_id,audience_type,total_targeted,status)
SELECT 'f2222222-2222-4222-8222-222222222222',w.id,'SIMULADO — cancelamento sem destinatários',c.id,t.id,'MANUAL',0,'queued'
FROM workspaces w JOIN channel_instances c ON c.workspace_id=w.id JOIN message_templates t ON t.workspace_id=w.id
WHERE w.id='b1111111-1111-4111-8111-111111111111' AND c.id='d2222222-2222-4222-8222-222222222222' AND t.id='e2222222-2222-4222-8222-222222222222'
ON CONFLICT(id) DO NOTHING;
