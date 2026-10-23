---
id: LICIT-01-radar-pncp-editais
titulo: Radar Autônomo de Licitações Públicas (PNCP) com Alerta de CND
empresa: MCT Soberano • Inteligência B2G
versao: 1.0.0
canal_entrada: schedule
trigger_tipo: cron
responsavel: Francisco Rios
tags: [licitacoes, compras_governamentais, pncp, cnd, telegram, whatsapp]
---

# 1. Visão Geral da Rotina
Executada diariamente às 06:30 AM via cron schedule. A automação consulta a API oficial do Portal Nacional de Contratações Públicas (PNCP) e diários oficiais buscando novos editais e avisos de licitação (obras, materiais, prestação de serviços, software) para os municípios de Santa Catarina e região Oeste. Ao encontrar oportunidades elegíveis, o fluxo audita a situação das certidões da empresa (FGTS, CNDT e Receita Federal) e envia um briefing estruturado no Telegram da diretoria com link do edital e checklist de habilitação.

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.cron" triggerTimes="[{\"mode\":\"custom\",\"cronExpression\":\"30 6 * * 1-5\"}]" name="Cron Matinal 06h30" -->
## [TELA 1: Trigger Agendado Matinal]
- **Frequência:** Segunda a sexta-feira às 06:30 AM.
- **Entrada:** Configuração dos municípios alvo (IBGE Chapecó 4204202, Concórdia, Xanxerê, Joaçaba, etc.) e termos-chave do portfólio.

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Consulta API PNCP Dados Abertos" method="GET" url="https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" -->
## [TELA 2: Varredura de Editais no PNCP]
- **Endpoint:** `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao` (inspirado em `Licitei/dados-publicos-mcp`).
- **Parâmetros:**
  - `dataInicial`: data do dia anterior
  - `uf`: `SC`
  - `codigoModalidadeContratacao`: Pregão Eletrônico, Concorrência, Dispensa
- **Ação:** Captura da lista de editais e downloads dos termos de referência.

<!-- @n8n:node type="n8n-nodes-base.code" name="Filtro Semantico por Catalogo do Cliente" -->
## [TELA 3: Filtro Semântico e Score de Aderência]
- **Origem:** Lista bruta de contratações do dia.
- **Ação:**
  - Cruzar palavras-chave do objeto da licitação contra os serviços habilitados do cliente;
  - Descartar itens sem aderência técnica;
  - Extrair: órgão comprador, objeto resumido, valor estimado e data limite de propostas.

<!-- @n8n:node type="n8n-nodes-base.postgres" operation="executeQuery" name="Auditoria de CNDs do Cliente" -->
## [TELA 4: Verificação de CNDs e Aptidão Jurídica]
- **Origem:** Base PostgreSQL da VPS (`mct_cnd_sentinel`).
- **Ação (baseado em `cgamboa-fisher/Skill-Juridico-BR`):**
  - Consultar se a empresa possui CND do FGTS (Caixa), CNDT (Trabalhista) e Receita Federal com validade superior à data do pregão;
  - Se faltar certidão: flag de alerta vermelho para renovação urgente;
  - Se todas estiverem regulares: selo de `HABILITAÇÃO IMEDIATA GARANTIDA`.

<!-- @n8n:node type="n8n-nodes-base.telegram" name="Despacho Briefing no Telegram" operation="sendMessage" -->
## [TELA 5: Despacho Executivo no Telegram]
- **Destino:** Canal privado ou chat executivo da diretoria.
- **Mensagem:**
  > "🏛️ *RADAR DE LICITAÇÕES PNCP — OPORTUNIDADE DETECTADA!*\n\n"
  > "🏢 *Órgão:* {{orgao_comprador}}\n"
  > "📦 *Objeto:* {{objeto_resumido}}\n"
  > "💰 *Valor Estimado:* R$ {{valor_estimado}}\n"
  > "⏱️ *Prazo Limite de Envio:* {{data_limite_proposta}}\n\n"
  > "🛡️ *Status de Habilitação Jurídica/Fiscal:*\n"
  > "• FGTS Caixa: {{status_fgts}} (Válido até {{val_fgts}})\n"
  > "• CNDT Trabalhista: {{status_cndt}}\n"
  > "• Receita Federal: {{status_rfb}}\n\n"
  > "🔗 [Baixar Edital no Portal]({{url_edital}})"

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="pncp_radar_logs" name="Log de Auditoria e Falhas" -->
## [TELA 6: Log de Auditoria]
- Registra cada varredura, total de editais lidos e oportunidades identificadas.
