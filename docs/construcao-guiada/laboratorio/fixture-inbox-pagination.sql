-- SIMULADO: local UI pagination only; no messages, credentials, campaigns or sends.
DO $$ BEGIN
 IF current_database()<>'chat_sales_lab' OR NOT EXISTS (
  SELECT 1 FROM workspaces WHERE id='b1111111-1111-4111-8111-111111111111' AND name='LAB — Revisão Chat Sales'
 ) OR NOT EXISTS (
  SELECT 1 FROM channel_instances WHERE id='d2222222-2222-4222-8222-222222222222'
   AND workspace_id='b1111111-1111-4111-8111-111111111111' AND provider='waha' AND NOT is_active AND status='unconfigured'
 ) THEN RAISE EXCEPTION 'Requires the isolated laboratory and disconnected synthetic WAHA channel'; END IF;
END $$;
BEGIN;
INSERT INTO contacts(id,workspace_id,phone_e164,name,opt_out)
SELECT md5('SIM_UI_PAGINATION_CONTACT_'||i)::uuid,'b1111111-1111-4111-8111-111111111111',
 '+550099880'||lpad(i::text,4,'0'),'SIM_PAGINACAO_'||lpad(i::text,3,'0')||' — sem envio',true
FROM generate_series(1,60) AS i ON CONFLICT(id) DO NOTHING;
INSERT INTO commercial_threads(id,workspace_id,channel_instance_id,contact_id,status,last_message_at)
SELECT md5('SIM_UI_PAGINATION_THREAD_'||i)::uuid,'b1111111-1111-4111-8111-111111111111',
 'd2222222-2222-4222-8222-222222222222',md5('SIM_UI_PAGINATION_CONTACT_'||i)::uuid,
 'active','2026-10-15T12:00:00Z'::timestamptz-i*interval '1 minute'
FROM generate_series(1,60) AS i ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM commercial_threads t JOIN contacts c ON c.id=t.contact_id
  WHERE t.id IN(SELECT md5('SIM_UI_PAGINATION_THREAD_'||i)::uuid FROM generate_series(1,60) AS i)
   AND c.opt_out AND c.name LIKE 'SIM_PAGINACAO_% — sem envio')<>60
 THEN RAISE EXCEPTION 'Synthetic pagination fixture is incomplete or conflicts with existing records'; END IF;
END $$;
COMMIT;
SELECT count(*) AS synthetic_threads FROM commercial_threads WHERE id IN(SELECT md5('SIM_UI_PAGINATION_THREAD_'||i)::uuid FROM generate_series(1,60) AS i);
