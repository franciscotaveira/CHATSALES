-- SIMULADO: local catalogue selection only. No stock, provider, payment or outbound send.
DO $$ BEGIN
 IF current_database()<>'chat_sales_lab' OR NOT EXISTS (
  SELECT 1 FROM workspaces WHERE id='b1111111-1111-4111-8111-111111111111' AND name='LAB — Revisão Chat Sales'
 ) OR NOT EXISTS (
  SELECT 1 FROM channel_instances WHERE id='d2222222-2222-4222-8222-222222222222'
   AND workspace_id='b1111111-1111-4111-8111-111111111111' AND provider='waha' AND NOT is_active AND status='unconfigured'
 ) THEN RAISE EXCEPTION 'Requires the isolated laboratory and disconnected synthetic WAHA channel'; END IF;
END $$;
BEGIN;
INSERT INTO products(id,workspace_id,catalog_id,retailer_id,title,description,price_cents,currency,category,image_url,status,is_featured)
VALUES(md5('SIM_UI_CATALOG_SELECTION')::uuid,'b1111111-1111-4111-8111-111111111111','SIM_CATALOG_LOCAL','SIM_UI_CATALOG_SELECTION','SIMULADO — seleção de catálogo, sem envio','Fixture exclusiva de UI. Sem estoque, cobrança ou catálogo externo.',4290,'BRL','SIMULADO','', 'ACTIVE',false)
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM products WHERE id=md5('SIM_UI_CATALOG_SELECTION')::uuid AND workspace_id='b1111111-1111-4111-8111-111111111111' AND retailer_id='SIM_UI_CATALOG_SELECTION' AND title='SIMULADO — seleção de catálogo, sem envio' AND price_cents=4290 AND status='ACTIVE')
 THEN RAISE EXCEPTION 'Synthetic product missing or conflicts with existing records'; END IF;
END $$;
COMMIT;
SELECT title,status,price_cents FROM products WHERE id=md5('SIM_UI_CATALOG_SELECTION')::uuid;
