DO $$
DECLARE fixture_thread uuid:=md5('SIM_UI_PAGINATION_THREAD_2')::uuid;
BEGIN
 IF current_database()<>'chat_sales_lab' THEN RAISE EXCEPTION 'Only the isolated lab'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commercial_threads t JOIN workspaces w ON w.id=t.workspace_id JOIN channel_instances c ON c.id=t.channel_instance_id AND c.workspace_id=t.workspace_id JOIN contacts ct ON ct.id=t.contact_id AND ct.workspace_id=t.workspace_id WHERE t.id=fixture_thread AND w.id='b1111111-1111-4111-8111-111111111111' AND w.name='LAB — Revisão Chat Sales' AND c.provider='waha' AND NOT c.is_active AND c.status='unconfigured' AND ct.name='SIM_PAGINACAO_002 — sem envio' AND ct.opt_out=true) THEN RAISE EXCEPTION 'Synthetic fixture context not confirmed'; END IF;
 INSERT INTO messages(id,workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,media_url,metadata,delivery_status,status_rank,created_at)
 SELECT md5('SIM_UI_MEDIA_RECOVERY')::uuid,t.workspace_id,t.channel_instance_id,t.id,'waha','inbound',ct.phone_e164,'+5500000000000','image','SIMULADO — anexo indisponível para revisar a interface; sem envio externo.','http://127.0.0.1:24400/SIM_arquivo_indisponivel.png','{"is_synthetic":true,"source":"SIMULADO_ui_fixture","filename":"SIM_anexo_indisponivel.png"}'::jsonb,'unknown',0,'2026-10-18T10:00:00Z'
 FROM commercial_threads t JOIN contacts ct ON ct.id=t.contact_id AND ct.workspace_id=t.workspace_id WHERE t.id=fixture_thread
 ON CONFLICT(id) DO NOTHING;
END $$;
SELECT id,direction,content_type,body FROM messages WHERE id=md5('SIM_UI_MEDIA_RECOVERY')::uuid;
