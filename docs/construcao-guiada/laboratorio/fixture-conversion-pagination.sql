-- SIMULADO: somente leitura visual/paginacao. Nenhum evento elegivel para envio.
BEGIN;
DO $$
BEGIN
 IF current_database()<>'chat_sales_lab' THEN RAISE EXCEPTION 'Banco de laboratorio obrigatorio'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commercial_journeys WHERE id='14be8f7b-e83b-425c-a703-79f96dd16f53' AND workspace_id='b1111111-1111-4111-8111-111111111111' AND title='SIMULADO — validação UI/UX de oportunidade') THEN RAISE EXCEPTION 'Negociacao sintetica obrigatoria'; END IF;
END $$;
INSERT INTO conversion_events(id,workspace_id,journey_id,event_name,event_time,status,user_data,provider_receipt,created_at)
SELECT md5('SIM_UI_CONVERSION_PAGINATION_'||i)::uuid,
 'b1111111-1111-4111-8111-111111111111',
 '14be8f7b-e83b-425c-a703-79f96dd16f53','LeadQualified',
 '2026-10-18T10:00:00.123456Z','SIMULATED',
 jsonb_build_object('is_synthetic',true,'source','SIMULADO_ui_pagination'),
 jsonb_build_object('is_synthetic',true,'external_send',false),
 '2026-10-18T10:00:00.123456Z'
FROM generate_series(1,51) i
ON CONFLICT(id) DO NOTHING;
COMMIT;
