---
id: s2w-frot-01-compliance-frotas
titulo: Triagem e Dossiê de Liberação de Frotas e Motoristas (Logística & Compliance Rodoviário)
empresa: MCT DocOps Frotas
versao: 1.0.0
canal_entrada: whatsapp
trigger_tipo: webhook
frequencia: tempo_real
responsavel: Francisco Rios
tags: [frotas, transportadoras, whatsapp, ocr, antt, cnh, crlv, compliance]
---

# 1. Visão Geral da Rotina de Frotas

Transportadoras rodoviárias de carga e cooperativas do Oeste Catarinense e do Brasil sofrem com caminhões e carretas retidos em balanças e postos da PRF ou fiscalizações da ANTT devido a:
1. Exame toxicológico periódico vencido do motorista.
2. Certificado MOPP (Movimentação de Produtos Perigosos) expirado.
3. CRLV anual do caminhão ou da carreta atrasado.
4. Registro Nacional de Transportadores Rodoviários de Cargas (RNTRC / ANTT) suspenso ou vencido.
5. Laudo de Aferição do Cronotacógrafo do Inmetro vencido.

O encarregado de frota ou o próprio motorista tira foto do documento pelo celular e envia no WhatsApp da transportadora. A automação audita a validade, organiza a pasta do veículo/motorista no Drive e emite alertas 30, 15 e 5 dias antes de qualquer documento vencer.

---

# 2. Mapeamento de Telas & Ações S2W

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="frotas-documentos" -->
## [TELA 1: Inbound WhatsApp Frota]
- **Origem:** WhatsApp da transportadora ou grupo de motoristas.
- **Entrada:** Foto ou PDF de CNH, CRLV, ANTT, Toxicológico, MOPP ou Tacógrafo.
- **Ação:** Captura da mídia e extração do número do remetente.

<!-- @n8n:node type="@n8n/n8n-nodes-langchain.agent" name="Auditor de Compliance de Frotas" -->
## [TELA 2: Leitura & Validação com Inteligência Factual]
- **Origem:** Arquivo recebido.
- **Campos Estruturados Extraídos:**
  - `tipo_documento`: [CNH_EAR | TOXICOLOGICO | MOPP | CRLV_VEICULO | ANTT_RNTRC | LAUDO_TACOGRAFO]
  - `placa_veiculo`: string (padrão Mercosul ou antigo)
  - `cpf_motorista`: string (11 dígitos limpos)
  - `data_validade`: YYYY-MM-DD
  - `status_auditoria`: [LIBERADO | ATENCAO_RENOVAR | VENCIDO_RETER]
- **Regra de Decisão:**
  - Se `data_validade < hoje`: Marca como `🔴 BARRADO NA BALANÇA — NÃO INICIAR VIAGEM`.
  - Se `dias_para_vencer <= 30`: Marca como `🟡 ATENÇÃO — AGENDAR RENOVAÇÃO`.
  - Se `dias_para_vencer > 30`: Marca como `🟢 100% LIBERADO PARA VIAGEM`.

<!-- @n8n:node type="n8n-nodes-base.googleDrive" name="Organizador de Pastas da Frota" operation="upload" -->
## [TELA 3: Arquivamento na Pasta do Veículo / Motorista]
- **Destino:** Google Drive Soberano MCT Clientes.
- **Diretório:**
  - Para veículos: `/[Transportadora]/01_Veiculos_e_Carretas/{{placa_veiculo}}/`
  - Para motoristas: `/[Transportadora]/02_Motoristas/{{nome_motorista}}_{{cpf}}/`
- **Nome do Arquivo:** `{{data_validade}}_{{tipo_documento}}_{{identificador}}.pdf`

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Retorno Imediato no WhatsApp" method="POST" -->
## [TELA 4: Semáforo de Liberação no Chat]
- **Destino:** Retorno no WhatsApp do motorista e encarregado.
- **Mensagem:**
  > "🚚 **MCT DocOps Frotas — Auditoria Concluída**\n\n📄 **Documento:** {{tipo_documento}}\n🚛 **Placa / Motorista:** {{identificador}}\n📅 **Validade:** {{data_validade}} (Restam {{dias_restantes}} dias)\n\n**STATUS DE VIAGEM:** {{status_icone}} {{status_texto}}"

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="mct_frota_compliance_errors" -->
## [TELA 5: Tratamento de Exceções & Fila Segura]
- Se o documento estiver ilegível ou cortado:
  1. Responde no WhatsApp pedindo foto aberta com iluminação adequada.
  2. Registra log na tabela de auditoria.
