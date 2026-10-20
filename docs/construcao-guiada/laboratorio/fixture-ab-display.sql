-- SIMULADO: visualização A/B sem destinatários, outbox ou envio.
BEGIN;
DO $$ BEGIN IF current_database() <> 'chat_sales_lab' THEN RAISE EXCEPTION 'Lab only'; END IF; END $$;
INSERT INTO public.broadcast_campaigns(id,workspace_id,name,channel_instance_id,is_ab_test,variant_a_template_id,variant_b_template_id,audience_type,total_targeted,status,target_snapshot)
SELECT 'f3333333-3333-4333-8333-333333333333',w.id,'SIMULADO — A/B visual; sem destinatários ou envio',c.id,true,a.id,b.id,'MANUAL',0,'cancelled','[]'::jsonb
FROM public.workspaces w
JOIN public.channel_instances c ON c.workspace_id=w.id AND c.id='d2222222-2222-4222-8222-222222222222' AND c.is_active=false
JOIN public.message_templates a ON a.workspace_id=w.id AND a.id='e2222222-2222-4222-8222-222222222222'
JOIN public.message_templates b ON b.workspace_id=w.id AND b.id='8d3c4a4f-6b57-4338-96ca-b43adf19d5e5'
WHERE w.id='b1111111-1111-4111-8111-111111111111'
ON CONFLICT(id) DO NOTHING;
COMMIT;
