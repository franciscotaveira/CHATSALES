-- SIMULADO: empty second company for local UI workspace-switch tests only.
DO $$ BEGIN
 IF current_database() <> 'chat_sales_lab' OR NOT EXISTS (
  SELECT 1 FROM workspaces WHERE id='b1111111-1111-4111-8111-111111111111' AND name='LAB — Revisão Chat Sales'
 ) THEN RAISE EXCEPTION 'This fixture requires the isolated Chat Sales laboratory'; END IF;
END $$;
BEGIN;
INSERT INTO workspaces(id,organization_id,name,slug)
SELECT 'b2222222-2222-4222-8222-222222222222',organization_id,'SIMULADO — Consulta de outra empresa','sim-ui-workspace-switch'
FROM workspaces WHERE id='b1111111-1111-4111-8111-111111111111'
ON CONFLICT(id) DO NOTHING;
INSERT INTO workspace_memberships(workspace_id,user_id,role)
VALUES ('b2222222-2222-4222-8222-222222222222','c1111111-1111-4111-8111-111111111111','analyst')
ON CONFLICT(workspace_id,user_id) DO NOTHING;
COMMIT;
SELECT name FROM workspaces WHERE id='b2222222-2222-4222-8222-222222222222';
SELECT role FROM workspace_memberships WHERE workspace_id='b2222222-2222-4222-8222-222222222222';
