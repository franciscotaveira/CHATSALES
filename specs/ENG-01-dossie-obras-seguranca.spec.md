---
id: ENG-01-dossie-obras-seguranca
titulo: Triagem e Dossie de Liberacao de Obras e SST (Compliance Industrial)
empresa: MCT DocOps / Construtoras e Prestadores Industriais
versao: 1.0.0
canal_entrada: whatsapp
trigger_tipo: webhook
responsavel: Francisco Rios
tags: [engenharia, construtora, sst, seguranca_do_trabalho, compliance, aurora, brf, tirol, drive, whatsapp]
---

# 1. Visão Geral da Rotina
O mestre de obras, administrativo ou técnico de segurança envia fotos ou PDFs de documentos de colaboradores (ASO, NRs, Ficha de EPI) e da empresa (CNDs, PGR, PCMSO, ART) pelo WhatsApp. A automação processa a mídia via visão computacional, extrai os dados do colaborador e as datas de validade, arquiva organizadamente na árvore do Google Drive da construtora e registra no motor de checklist da VPS. Em seguida, responde no WhatsApp confirmando a conformidade ou alertando se o documento já está vencido/próximo de vencer para evitar que a equipe seja barrada na portaria de indústrias contratantes (Aurora Coop, BRF, Tirol).

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="intake-documentos-engenharia" name="Inbound WhatsApp Engenharia" -->
## [TELA 1: Inbound WhatsApp / Canteiro de Obras]
- **Origem:** Grupo de WhatsApp da Obra ou conversa direta do mestre de obras/administrativo.
- **Entrada:** Arquivo de mídia (`image/jpeg`, `image/png`, `application/pdf`) acompanhado de legenda opcional.
- **Ação:** Captura do arquivo temporário, extração do número do remetente e identificação da construtora associada.
- **Validação:** Se não for mídia válida, responde com orientações dos formatos aceitos (PDF ou fotos nítidas).

<!-- @n8n:node type="@n8n/n8n-nodes-langchain.agent" name="Extrator SST Vision OCR" -->
## [TELA 2: Leitura, OCR & Validação de Validade SST]
- **Origem:** Arquivo binário recebido.
- **Ação:** Passar visão computacional / OCR para extração estruturada de metadados:
  - `categoria_documento`: [COLABORADOR | EMPRESA | OBRA]
  - `tipo_documento`: [ASO | NR-35 | NR-33 | NR-10 | NR-12 | NR-18 | FICHA_EPI | CND_FGTS | CNDT | CND_FEDERAL | PGR | PCMSO | ART]
  - `nome_colaborador`: string (se categoria COLABORADOR)
  - `cpf_colaborador`: string (11 dígitos limpos)
  - `data_emissao`: YYYY-MM-DD
  - `data_validade`: YYYY-MM-DD
  - `dias_ate_vencer`: inteiro calculado (`data_validade - hoje`)
  - `status_validade`: [VALIDO | PROXIMO_VENCIMENTO | VENCIDO]
  - `apto_altura`: boolean (se ASO)
  - `apto_espaco_confinado`: boolean (se ASO)
- **Contrato de Decisão:**
  - Se `confidence < 0.80` ou foto ilegível: Encaminha para Quarentena / Revisão Manual (`stage: manual_quarantine`).
  - Se `status_validade == 'VENCIDO'`: Marca alerta crítico de não conformidade para portaria.

<!-- @n8n:node type="n8n-nodes-base.googleDrive" name="Organizador de Pastas Google Drive" operation="upload" -->
## [TELA 3: Arquivamento na Árvore do Google Drive Soberano]
- **Destino:** Google Drive Dedicado da MCT Clientes.
- **Regras de Diretório e Nomenclatura:**
  - **Se Categoria Colaborador:**
    - Diretório: `/[NOME_CONSTRUTORA]/02_Colaboradores/{{nome_colaborador}}_{{cpf_colaborador}}/`
    - Arquivo: `{{tipo_documento}}_Validade_{{data_validade}}_{{nome_colaborador}}.pdf`
  - **Se Categoria Empresa (CNDs / PGR):**
    - Diretório: `/[NOME_CONSTRUTORA]/00_Dossie_Geral_Empresa/CNDs_Certidoes/`
    - Arquivo: `{{tipo_documento}}_Validade_{{data_validade}}.pdf`
  - **Se Categoria Obra Específica:**
    - Diretório: `/[NOME_CONSTRUTORA]/01_Obras_Ativas/{{nome_obra}}/`
    - Arquivo: `ART_{{nome_obra}}_{{data_emissao}}.pdf`

<!-- @n8n:node type="n8n-nodes-base.postgres" name="Registro no Banco de Conformidade" operation="insert" -->
## [TELA 4: Registro no Checklist Engine da VPS]
- **Destino:** Tabelas de Checklist e Inventário no PostgreSQL do n8n (`plx_checklist_execucoes_v1` / `plx_v3_documentos`).
- **Ação:**
  - Registra o documento com timestamp, link do Drive, CPF, tipo e validade.
  - Atualiza a data da última renovação do colaborador no painel de conformidade.

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Despacho WhatsApp Recibo & Status Portaria" method="POST" url="https://chat.automatizaprocessos.tech/api/v1/webhook" -->
## [TELA 5: Recibo e Status de Liberação no WhatsApp]
- **Destino:** Retorno no WhatsApp do remetente (mestre de obras / adm).
- **Mensagem Formato Aprovado:**
  > "✅ *Documento Processado com Sucesso!*"
  > 
  > 👷‍♂️ *Colaborador:* {{nome_colaborador}} (CPF: {{cpf_colaborador}})
  > 📄 *Documento:* {{tipo_documento}}
  > 📅 *Validade:* {{data_validade}} (Restam {{dias_ate_vencer}} dias)
  > 🛡️ *Status Portaria:* {{status_liberacao_icone}} {{status_liberacao_texto}}
  > 
  > 📁 *Arquivo salvo no Drive da Obra.*
- **Mensagem Formato Alerta (Se Vencido ou < 10 dias):**
  > "⚠️ *ALERTA DE SEGURANÇA / PORTARIA!*"
  > 
  > 👷‍♂️ *Colaborador:* {{nome_colaborador}}
  > 📄 *Documento:* {{tipo_documento}}
  > ❌ *Situação:* Este documento vence em {{dias_ate_vencer}} dias (ou já está VENCIDO).
  > ⛔ *Risco:* A equipe poderá ser barrada na portaria da indústria (Aurora/BRF/Tirol). Favor providenciar a reciclagem imediatamente."

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="eng_document_errors" name="Handler de Quarentena e Erros" -->
## [TELA 6: Tratamento de Exceções & Quarentena]
- Se o documento estiver ilegível, cortado ou sem identificação:
  1. Arquiva na pasta `/[NOME_CONSTRUTORA]/99_Quarentena_Revisao_Manual/`.
  2. Registra o incidente na tabela de erros para auditoria.
  3. Responde imediatamente no WhatsApp solicitando o reenvio legível.
