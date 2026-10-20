-- SIMULADO, sem fila ou envio externo. Repetir com message_count=41 adiciona somente o novo item.
BEGIN;
DO $$
BEGIN
 IF current_database()<>'chat_sales_lab' THEN RAISE EXCEPTION 'Only the isolated lab'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commercial_threads t JOIN channel_instances c ON c.id=t.channel_instance_id AND c.workspace_id=t.workspace_id JOIN contacts ct ON ct.id=t.contact_id AND ct.workspace_id=t.workspace_id WHERE t.id=md5('SIM_UI_PAGINATION_THREAD_3')::uuid AND t.workspace_id='b1111111-1111-4111-8111-111111111111' AND c.provider='waha' AND NOT c.is_active AND c.status='unconfigured' AND ct.name='SIM_PAGINACAO_003 — sem envio' AND ct.opt_out=true) THEN RAISE EXCEPTION 'Synthetic inactive context required'; END IF;
END $$;
INSERT INTO messages(id,workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,metadata,delivery_status,status_rank,created_at)
SELECT md5('SIM_UI_READING_'||i)::uuid,t.workspace_id,t.channel_instance_id,t.id,'waha','inbound',ct.phone_e164,'+5500000000000','text',
 'SIMULADO — mensagem '||lpad(i::text,2,'0')||' para conferir leitura do histórico. Este conteúdo é fictício, não veio de um cliente e não autoriza resposta ou envio externo.',
 '{"is_synthetic":true,"source":"SIMULADO_ui_reading"}'::jsonb,'unknown',0,'2026-10-18T10:00:00Z'::timestamptz+i*interval '1 second'
FROM commercial_threads t JOIN contacts ct ON ct.id=t.contact_id AND ct.workspace_id=t.workspace_id CROSS JOIN generate_series(1,:message_count) i
WHERE t.id=md5('SIM_UI_PAGINATION_THREAD_3')::uuid
ON CONFLICT(id) DO NOTHING;
COMMIT;
