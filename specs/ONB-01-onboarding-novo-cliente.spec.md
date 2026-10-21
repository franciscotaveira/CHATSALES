---
id: ONB-01-onboarding-novo-cliente
titulo: Integracao e Provisionamento Turnkey de Novo Cliente
empresa: MCT DocOps / Automação Soberana
versao: 1.0.0
canal_entrada: webhook
trigger_tipo: webhook
responsavel: Francisco Rios
tags: [onboarding, provisionamento, drive, whatsapp, compliance, n8n]
---

# 1. Visão Geral da Rotina
Fluxo de entrada e ativação imediata de novos clientes da MCT. Recebe os dados cadastrais da empresa (via contratação no SOS Vendas, formulário ou fechamento comercial), cria a estrutura completa de pastas no Google Drive através da Service Account soberana (sem expiração de token), cadastra as regras de compliance e validade na Data Table do PostgreSQL na VPS e dispara o link do repositório no WhatsApp do cliente com as orientações de envio.

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="onboarding-novo-cliente" name="Gatilho de Novo Cliente" -->
## [TELA 1: Entrada de Dados do Cliente]
- **Origem:** SOS Vendas Cockpit, API de Contratação ou Webhook de Fechamento.
- **Payload Esperado:**
  - `nome_empresa`: string (obrigatório, ex: "Construtora Silva & Filhos")
  - `segmento`: [construcao | contabil | geral] (default: construcao)
  - `telefone_contato`: string (ex: "554999999999")
  - `grupo_whatsapp`: string (opcional, ex: "120363xxx@g.us")
  - `email_cliente`: string (opcional, para compartilhamento com notificação)
  - `obras_iniciais`: array de strings (ex: ["Obra_Aurora_Chapeco", "Obra_BRF_Marau"])

<!-- @n8n:node type="n8n-nodes-base.executeCommand" name="Provisionador Soberano de Drive e Banco" command="python3 /opt/plx-documentos/app/scripts/mct_client_onboarding.py --name '{{$json.nome_empresa}}' --segment '{{$json.segmento}}' --phone '{{$json.telefone_contato}}' --email '{{$json.email_cliente}}'" -->
## [TELA 2: Provisionamento Automático no Host da VPS]
- **Ação:** Execução do utilitário `mct_client_onboarding.py` no host da VPS.
- **Operações:**
  1. Criação da árvore de pastas em `MCT Clientes` no Google Drive via Service Account.
  2. Compartilhamento com o e-mail do cliente se informado.
  3. Semeadura de regras de conformidade na tabela `plx_checklist_regras_v1`.
  4. Retorno do payload estruturado com `company_folder_id` e `view_url`.

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Despacho Boas-Vindas WhatsApp" method="POST" url="http://sos-sales-waha:3000/api/sendText" -->
## [TELA 3: Mensagem de Boas-Vindas no WhatsApp]
- **Destino:** WhatsApp do responsável ou grupo da obra via WAHA na rede interna.
- **Mensagem:**
  > "🎉 *Seu Ambiente foi Provisionado com Sucesso!*\n\n"
  > "🏢 *Empresa:* {{$json.company_name}}\n"
  > "📂 *Repositório no Google Drive:*\n{{$json.view_url}}\n\n"
  > "A partir de agora, envie fotos e PDFs de ASOs, NRs e comprovantes diretamente neste chat. Nossa inteligência organizará tudo nas pastas certas e avisará antes de qualquer vencimento! 🛡️"

<!-- @n8n:node type="n8n-nodes-base.respondToWebhook" name="Resposta de Sucesso HTTP 200" respondWith="json" -->
## [TELA 4: Resposta da API de Provisionamento]
- **Status:** HTTP 200 OK.
- **Retorno:**
  ```json
  {
    "status": "SUCCESS",
    "company_name": "{{$json.company_name}}",
    "view_url": "{{$json.view_url}}",
    "company_folder_id": "{{$json.company_folder_id}}",
    "rules_active": "{{$json.rules_active}}"
  }
  ```

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="onboarding_errors" name="Handler de Excecoes de Provisionamento" -->
## [TELA 5: Tratamento de Falhas & Contingência]
- Em caso de inconsistência no nome ou falha no Google Drive:
  1. Grava log detalhado do erro no PostgreSQL da VPS.
  2. Retorna HTTP 400/500 com código explicativo sem expor credenciais internas.
