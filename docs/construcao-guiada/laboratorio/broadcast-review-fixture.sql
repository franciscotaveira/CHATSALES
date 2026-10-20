-- Synthetic UI fixture. No provider credentials, no dispatch worker, lab database only.
DO $$ BEGIN
  IF current_database()<>'chat_sales_lab' THEN RAISE EXCEPTION 'Laboratório obrigatório'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id='b1111111-1111-4111-8111-111111111111' AND name LIKE 'LAB%') THEN RAISE EXCEPTION 'Empresa sintética obrigatória'; END IF;
END $$;
INSERT INTO public.channel_instances(id,workspace_id,provider,display_name,endpoint_token_hash,status,is_active,phone_number_e164)
VALUES('d2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','waha','SIMULADO — revisão local, sem provedor','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','connected',true,'+5500000000009')
ON CONFLICT(id) DO UPDATE SET status='connected',is_active=true;
INSERT INTO public.message_templates(id,workspace_id,name,category,body_text,status,language,variables)
VALUES('e2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','sim_review_local_only','UTILITY','SIMULADO — revisão local de destinatários. Sem envio externo.','APPROVED','pt_BR','[]'::jsonb)
ON CONFLICT(id) DO UPDATE SET status='APPROVED';
