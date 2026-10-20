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
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM commercial_threads WHERE id=md5('SIM_UI_PAGINATION_THREAD_1')::uuid AND workspace_id='b1111111-1111-4111-8111-111111111111' AND status='waiting_human' AND handoff_reason='SIMULADO — revisão da devolução, sem envio')
 THEN RAISE EXCEPTION 'Synthetic handoff state changed; inspect before restoring'; END IF;
END $$;
UPDATE commercial_threads SET status='active',handoff_reason=NULL
WHERE id=md5('SIM_UI_PAGINATION_THREAD_1')::uuid AND workspace_id='b1111111-1111-4111-8111-111111111111';
COMMIT;
SELECT status,COALESCE(handoff_reason,'NULL') FROM commercial_threads WHERE id=md5('SIM_UI_PAGINATION_THREAD_1')::uuid;
