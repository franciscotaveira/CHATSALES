---
id: CONT-02-conciliacao-extrato-ofx
titulo: Conciliação Automática de Extrato Bancário OFX x Notas Fiscais
empresa: PLX Contabilidade & Gestão Financeira
versao: 1.0.0
canal_entrada: whatsapp
trigger_tipo: webhook
responsavel: Francisco Rios
tags: [contabilidade, conciliacao, ofx, extrato, fiscal, whatsapp]
---

# 1. Visão Geral da Rotina
O cliente ou seu assistente financeiro envia o arquivo de extrato bancário (.ofx ou .pdf) no grupo do WhatsApp da contabilidade. O workflow processa cada débito e crédito, busca no banco de dados e no Google Drive as notas fiscais correspondentes (por CNPJ e valor), calcula a taxa de conciliação do mês e devolve imediatamente no chat uma lista limpa com apenas as despesas que precisam de comprovante.

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="intake-extrato-bancario" name="Inbound Extrato WhatsApp" -->
## [TELA 1: Inbound WhatsApp do Extrato]
- **Origem:** Grupo de atendimento contábil no WhatsApp via WAHA / Chat Sales.
- **Entrada:** Arquivo `.ofx` ou documento bancário anexado.
- **Ação:** Validação da extensão do arquivo, identificação do CNPJ da empresa pelo número do WhatsApp e extração do payload binário.

<!-- @n8n:node type="n8n-nodes-base.code" name="Parser OFX e Extrator de Transacoes" -->
## [TELA 2: Parser e Normalização Bancária]
- **Origem:** Binário OFX (baseado na engenharia de `marcosdiez/contabilizei`).
- **Ação:** 
  - Extrair tags `<BANKTRANLIST>`, `<STMTTRN>`, `<TRNAMT>`, `<DTPOSTED>` e `<MEMO>`;
  - Limpar histórico bancário (remover ruídos como "DEB AUTOM", "PIX ENVIADO", "TBI");
  - Separar transações de débito (despesas) e crédito (receitas);
  - Formatar lista estruturada: `{ id, data, valor, historico, doc_ref }`.

<!-- @n8n:node type="n8n-nodes-base.postgres" operation="executeQuery" name="Cruzador com Acervo de Notas Fiscais" -->
## [TELA 3: Reconciliação com Notas Fiscais]
- **Origem:** Base de dados contábil na VPS Hostinger KVM 4.
- **Ação (baseado em `wandersonwhcr/balance`):**
  - Para cada saída bancária, buscar no PostgreSQL se existe NF-e/NFS-e com valor correspondente (+/- R$ 0,05 de tolerância de arredondamento) e competência compatível;
  - Se houver correspondência exata: marca status como `CONCILIADO` e vincula o ID da nota;
  - Se não houver documento: marca como `PENDENTE_COMPROVANTE`.

<!-- @n8n:node type="n8n-nodes-base.googleDrive" name="Arquivamento do Extrato no Drive" operation="upload" -->
## [TELA 4: Arquivamento Governança no Google Drive]
- **Destino:** Google Drive Soberano da empresa.
- **Pasta:** `/Contabilidade/{{empresa_slug}}/{{competencia}}/01_Extratos_Bancarios/`
- **Arquivo:** `Extrato_{{competencia}}_{{banco}}.ofx`

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Despacho Relatorio no WhatsApp" method="POST" url="https://chat.automatizaprocessos.tech/api/v1/webhook" -->
## [TELA 5: Resumo Executivo no WhatsApp]
- **Destino:** Chat do cliente.
- **Mensagem:**
  > "📊 *EXTRATO CONCILIADO COM SUCESSO!*\n\n"
  > "📅 Competência: {{competencia}}\n"
  > "✅ Lançamentos Conciliados: {{total_conciliado}} de {{total_lancamentos}} ({{taxa_percentual}}%)\n\n"
  > "🚨 *Faltam apenas {{total_pendente}} comprovantes para o fechamento:*\n"
  > "{{lista_pendencias_com_valor_e_data}}\n\n"
  > "Por favor, responda a esta mensagem enviando as fotos dos comprovantes acima para concluirmos o balanço."

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="plx_document_errors" name="Handler de Excecoes e Auditoria" -->
## [TELA 6: Auditoria e Falhas]
- Em caso de inconsistência de formato, grava o erro na tabela de auditoria e avisa o analista responsável sem interromper o fluxo.
