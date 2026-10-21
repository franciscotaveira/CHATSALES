---
id: CONT-01-triagem-documental
titulo: Triagem e Arquivamento de Comprovantes Fiscais
empresa: PLX Contabilidade
versao: 1.0.0
canal_entrada: whatsapp
trigger_tipo: webhook
responsavel: Francisco Rios
tags: [contabilidade, fiscal, whatsapp, ocr, drive]
---

# 1. Visão Geral da Rotina
O cliente do escritório envia fotos ou PDFs de comprovantes, notas de serviço e extratos pelo WhatsApp. A automação recebe a mídia, passa por visão computacional para extrair campos, organiza na pasta do cliente no Google Drive e confirma no chat com o resumo.

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="intake-documentos-plx" name="Inbound WhatsApp WAHA" -->
## [TELA 1: Inbound WhatsApp]
- **Origem:** Conversa individual ou grupo do WhatsApp (via SOS Sales / WAHA).
- **Entrada:** Arquivo de mídia (`image/jpeg`, `image/png`, `application/pdf`).
- **Ação:** Captura do arquivo temporário, extração do número do remetente e timestamp.
- **Validação:** Se não for mídia válida, responde com orientação de formato aceito.

<!-- @n8n:node type="@n8n/n8n-nodes-langchain.agent" name="Extrator de Inteligencia NVIDIA" -->
## [TELA 2: Leitura & OCR do Documento]
- **Origem:** Arquivo binário recebido.
- **Ação:** Passar visão computacional / Mistral OCR para extrair campos estruturados:
  - `tipo_documento`: [NFS-e | Extrato | Boleto | Comprovante_Pix | Outro]
  - `cnpj_emissor`: string (14 dígitos limpos)
  - `data_emissao`: YYYY-MM-DD
  - `competencia`: YYYY-MM
  - `valor_total`: decimal (BRL)
- **Contrato de Decisão:**
  - Se `confidence < 0.85`: Encaminha para Fila de Revisão Humana no Cockpit (`stage: human_review`).

<!-- @n8n:node type="n8n-nodes-base.googleDrive" name="Organizador de Pastas Google Drive" operation="upload" -->
## [TELA 3: Arquivamento na Nuvem]
- **Destino:** Google Drive estruturado da contabilidade.
- **Regra de Diretório:** `/Contabilidade/{{empresa_identificada}}/{{competencia}}/{{tipo_documento}}/`
- **Regra de Nomenclatura:** `{{competencia}}_{{tipo_documento}}_{{cnpj_emissor}}_{{valor_total}}.pdf`

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Despacho Recibo WhatsApp" method="POST" url="https://chat.automatizaprocessos.tech/api/v1/webhook" -->
## [TELA 4: Recibo e Feedback no Chat]
- **Destino:** Retorno no WhatsApp do cliente no mesmo chat de origem.
- **Mensagem:**
  > "✅ Documento recebido com sucesso!\n\n📄 Tipo: {{tipo_documento}}\n💰 Valor: R$ {{valor_total}}\n📅 Competência: {{competencia}}\n\nJá foi arquivado na pasta fiscal da sua empresa."

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="plx_document_errors" name="Handler de Excecoes e Auditoria" -->
## [TELA 5: Tratamento de Exceções & Auditoria]
- Em caso de falha em qualquer nó:
  1. Grava o payload bruto e o stack trace na tabela de auditoria (Postgres 16).
  2. Dispara alerta no canal de monitoramento da equipe técnica.
  3. Não descarta o arquivo original.
