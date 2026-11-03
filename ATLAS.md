# ATLAS SOBERANO — SOS VENDAS & MCT OS

> Francisco Rios | 69.553.990 FRANCISCO TAVEIRA RIOS (CNPJ: 69.553.990/0001-91) | MCT LTDA | Chapecó, SC  
> Filosofia: Poder invisível, simplicidade visível. Truth in Data.  
> Hierarquia: P0 (Kernel Soberano) > P1 (Atlas & CODEBASE) > P2 (Agentes & Skills).

> **Estado operacional — 22/10/2026:** a VPS `/opt/chat-sales-v3` é a referência de produção; o checkout local contém alterações não reconciliadas. O runtime observado tem 17 containers em quatro ilhas. Este Atlas conserva decisões e marcos históricos; confira o [dossiê de retomada da VPS](sos-vendas-codex-handover.md) para estado atual, evidências e pendências. Nunca sincronize a árvore local inteira.

---

## 1. Topologia de Infraestrutura Soberana

- **Host de Produção Ativo:** Hostinger KVM 4 (`srv2078434.hstgr.cloud` - Datacenter Brasil, Campinas/SP).
- **IPv4:** `200.141.17.99` (4 vCPUs, 16 GB RAM, 200 GB NVMe).
- **Acesso SSH:** `ssh -i ~/.ssh/id_rsa_mct_deploy root@200.141.17.99`
- **Antiga VPS (179.197.72.221):** Descomissionada e destruída. Dados 100% resgatados e preservados localmente em `emergency_backups/`.
- **Diretório da Aplicação em Produção:** `/opt/chat-sales-v3`
- **Domínio Ativo do Cockpit / CRM:** `https://chat.automatizaprocessos.tech`
- **Domínio de Automações:** `https://automacao.automatizaprocessos.tech`
- **Landing Page Oficial:** `https://automatizaprocessos.tech`
- **Reverse Proxy & SSL:** Caddy (`sos-sales-caddy`) com emissão TLS automática Let's Encrypt para `chat.automatizaprocessos.tech`.
- **Topologia de Portas Internas & Contêineres:**
  - `chat-sales-web`: Porta interna 80 (Nginx servindo build SPA otimizada).
  - `chat-sales-api`: Porta interna 4400 (Fastify 5 gateway HTTP).
  - `chat-sales-worker`: Background processing (BullMQ, InboxProcessor, OutboxDispatcher, CapiDispatcher).
  - `sos-sales-postgres`: PostgreSQL 16 (Porta 5432 interna, banco `sos_sales_v3`).
  - `sos-sales-redis`: Redis 7 (Porta 6379 interna, cache e filas operacionais).
  - `sos-sales-waha`: WAHA Core (Porta 3000 interna mapeada para 3006 no host).

---

## 2. Decisões Arquiteturais Macro & Milestones (P0)

### 2.1 Motor de Inteligência Artificial Soberano (Dual-Engine)
- **NVIDIA NIM como Padrão Soberano:**
  - Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`.
  - **Decisão Crítica (Outubro/2026):** O modelo `meta/llama-3.3-70b-instruct` atingiu EOL oficial na infraestrutura da NVIDIA em 26/08/2026 (HTTP 410 Gone). O modelo de referência soberano foi migrado para `nvidia/nemotron-3-super-120b-a12b`, entregando capacidade superior de raciocínio, aderência estrita a restrições e latência reduzida.
  - Modelos rápidos certificados: `nvidia/nemotron-3.5-lightning-30b-a3b` e `nvidia/llama-3.1-nemotron-70b-instruct`.
- **OpenRouter como Provedor Alternativo Aberto:**
  - Endpoint: `https://openrouter.ai/api/v1/chat/completions`.
  - Modelos homologados: `anthropic/claude-3.5-sonnet`, `google/gemini-2.5-flash`, `deepseek/deepseek-chat`.
  - Cabeçalhos de rastreabilidade: `HTTP-Referer` e `X-Title` obrigatórios.
- **Chaves de API Isoladas:** Cada tenant pode utilizar a credencial central da empresa ou definir sua própria chave em `workspaces.ai_api_key`.

### 2.2 Grounding e limites do atendimento por IA
- **Regra de projeto:** respostas devem usar dados e regras cadastrados e encaminhar o que não puderem confirmar. Isso reduz risco, mas não prova ausência de erro em todas as respostas.
- **Grounding:** o fluxo fornece contexto de catálogo e regras comerciais disponíveis ao worker; cobertura varia por capacidade e registro. Não assumir que toda resposta está ancorada em quatro fontes sem conferir o caso.
- **Protocolo de Ignorância & Transbordo Humano:** Dúvidas fora do escopo geram a tag `[TRANSBORDO_HUMANO: motivo]`. O sistema transiciona a thread para `waiting_human`, grava `handoff_reason` e gera alerta executivo no Cockpit para o atendente humano assumir com um clique.

### 2.3 Memória de Aquisição Meta CTWA (Click-to-WhatsApp Ads)
- Leads originados de anúncios trazem metadados de anúncio (`headline`, `body`).
- Ingestão contínua em `commercial_journeys` e injeção contextual em `<origem_do_lead_anuncio_meta>`. A IA inicia a conversa ciente da dor e da promessa do criativo específico clicado pelo lead.

### 2.4 Fronteira do n8n (Regra Inquebrável)
- O n8n é utilizado unicamente como acervo de pesquisa, scrapers e testes exploratórios de laboratório.
- Toda lógica core de produto, despacho de mensageria, transações financeiras e controle de filas reside exclusivamente no monorepo SOS Sales.

### 2.5 Autenticação Soberana & Gestão Multi-Tenant de Equipe (MCT OS v2.0)
- **Criptografia Nativa com Scrypt:** Senhas armazenadas com salt de 16 bytes e validação `timingSafeEqual`. Zero dependências cloud para autenticação.
- **Isolamento de Membros:** Gestão de equipe no Cockpit Comercial (`Configurações > Equipe & Acessos`). Operadores vinculados unicamente à sua respectiva empresa sob RLS.
- **Troca de Contexto:** `POST /v1/auth/switch-workspace` permite alternância imediata de empresas permitidas com novo JWT sem reautenticação.

### 2.6 Perímetro Defensivo & WAF (SecurityShield)
- **Detecção de Scanners:** Interceptação imediata de ferramentas ofensivas (`sqlmap`, `nikto`, `masscan`) e sondagens de arquivos sensíveis (`/.env`, `/wp-admin`, `../`).
- **IP Auto-Jail:** Bloqueio de 15 minutos em chave volátil no Redis (`sos:shield:jail:<ip>`) com `HTTP 403` e `Retry-After: 900`.
- **Anti-Brute Force:** Limite de 10 tentativas de login/min por IP e bloqueio temporário de 5 minutos da conta após 5 erros consecutivos de senha.
- **Timing Attack Mitigation:** Cálculo de scrypt dummy em e-mails não existentes para igualar a latência de processamento (~60ms).
- **Rate Limit Global:** Cota de 120 req/min por IP com cabeçalhos RFC 6585.

### 2.7 Governança Operacional SaaS & Disaster Recovery
- **Backup Diário Encriptado (AES-256):** Execução automática às 03:00 AM via crontab com verificação de integridade do stream e retenção de 7 dias em `/opt/sos-sales/backups/daily/`.
- **Watchdog de Auto-Cura:** Sentinela no crontab a cada 5 minutos monitorando `https://chat.automatizaprocessos.tech/ready`, reiniciando automaticamente a API em caso de 3 falhas consecutivas e alertando caso o disco ultrapasse 85%.
- **Log Caps:** Limite rígido de logs no Docker Compose fixado em 20 MB por arquivo e máximo de 3 arquivos por container.

### 2.8 Disparos em Massa com Importador Inteligente & Fechamento Pix na IA
- **Importador de Planilhas (CSV/XLSX/XLS):** Drag-and-drop no cliente com pré-visualização de auditoria, deduplicação em memória e sanitizador estrito para números brasileiros E.164 (DDD + 9 dígitos móveis, normalização de prefixos `55` e `0`, e rejeição determinística de fixos). Inserção transacional não-destrutiva via `createOrGetContact` com `ON CONFLICT DO UPDATE`, preservando integridade referencial e histórico de conversas.
- **Segmentação Dinâmica (`SMART_FILTER`):** Filtros nativos sob RLS para reativação comercial:
  - `NON_BUYERS`: Contatos cadastrados sem propostas pagas e sem cobranças Pix pagas (`status = 'PAID'`).
  - `PIX_ABANDONED`: Contatos que possuem cobrança Pix em status `EXPIRED` ou `PENDING` e que nunca concluíram uma compra com status `PAID` (recuperação ativa de checkout/carrinho abandonado).
  - `INACTIVE_30_DAYS`: Contatos sem atividade de mensagem ou proposta nos últimos 30 dias.
  - `CTWA_RESCUE`: Contatos originados de anúncios Meta sem conversão.
  - Endpoint `GET /v1/workspaces/:workspaceId/broadcasts/audience-count` para contagem reativa em tempo real.
- **Atribuição Comercial & Vencedora A/B por Faturamento Real:**
  - Métricas agregadas em `GET /v1/workspaces/:workspaceId/broadcasts/campaigns` cruzando destinatários de cada variante com `pix_charges` (`status = 'PAID'`).
  - O algoritmo da variante campeã A/B elege com autoridade a variante que gerou maior receita monetária (`salesCents`), com fallbacks sequenciais para taxa de conversão, respostas e aberturas (`🏆 Campeã Comercial`).
  - Índices de performance de produção: `idx_broadcast_recipients_contact_camp` e `idx_pix_charges_contact_paid`.
- **Fechamento Instantâneo de Ofertas com Pix na IA (`<fechamento_comercial_pix>`):**
  - Prompt Grounding Dual-Engine instrui a IA a emitir a tag canônica `[OFFER_PIX: <productId>]` quando o lead aceitar uma oferta ou demonstrar intenção de compra ("quero", "manda o pix", "fechado").
  - O `AiReceptionistProcessor` intercepta a tag, emite o código Pix Copia e Cola EMV oficial BACEN via `createPixCharge` do `@sos-sales/database` utilizando a chave Pix cadastrada no workspace e anexa a instrução de pagamento em bloco de código monoespaçado formatado para WhatsApp.
  - A ausência de credencial Pix impede criar a cobrança; respostas conversacionais podem continuar conforme o caminho. O resultado depende das precondições do worker e não é garantia de disponibilidade.

### 2.9 Resiliência Operacional WAHA & Cockpit Layout (Outubro/2026)
- **Auto-Heal e Pré-validação de Sessão WAHA:**
  - A rota `POST /v1/workspaces/:workspaceId/channels/:channelId/sync` agora inspeciona proativamente o estado da sessão no motor WAHA (`/api/sessions/:session`) antes de solicitar o histórico de conversas.
  - Se a sessão estiver parada (`STOPPED`), dispara automaticamente tentativa de inicialização (`/api/sessions/start`). Se exigir leitura de QR Code (`SCAN_QR_CODE`), atualiza deterministicamente o status do canal para `pairing` e retorna JSON amigável ao usuário, eliminando respostas opacas `502 Bad Gateway / 422 Unprocessable Entity`.
  - Mapeamento das sessões soberanas na VPS `179.197.72.221`:
    - Workspace `11111111-1111-1111-1111-111111111111` (SOS Sales - Francisco Taveira `+554988447562`) -> Sessão WAHA `plx-documentos` (216 threads, 7.141 mensagens).
    - Workspace `22222222-2222-2222-2222-222222222222` (Haven Escovaria `+554988370054`) -> Sessão WAHA `haven` (671 threads, 9.527 mensagens).
- **Contenção Estrita de Layout no Cockpit & Design System:**
  - `ConversationRow` / `ListItem`: Snippets de pré-visualização passam por `renderWhatsappMarkdown` com `{ singleLine: true }` para converter quebras de linha (`\n`) em espaços contínuos, impedindo que tags `<br />` causem vazamento vertical de texto sobre contatos adjacentes.
  - `ChannelsSection`: Reestruturação dos cards de canal em dois blocos (informações no topo com ícone 38x38px de largura fixa e barra dedicada de ações com divisor no rodapé), eliminando colapso de nomes de canais.
  - Filtro Multi-Canal no Inbox: Inclusão de seletor dinâmico no cabeçalho do Cockpit (`Todos os Canais` ou canal específico), garantindo que workspaces com canais híbridos (WABA Oficial + WAHA) alternem e visualizem os leads de forma transparente.
- **Topologia de Repositórios Git (Dual-Push Soberano):**
  - `origin` configurado com push simultâneo para `https://github.com/franciscotaveira/CHATSALES.git` e `https://github.com/franciscotaveira/SOS-SALES.git`.

### 2.10 Consolidação Soberana REA (Ciclos UX1 a UX449 & Migrações 037 a 063)
- **Engenharia Reversa Semântica (REA):**
  - Extração e análise de AST cobrindo os 27 grupos funcionais do ecossistema, eliminando coerções *truthy* cegas (`res.campo || []`), unificando contratos criptográficos em `channels.routes.ts` (`encryptedBase64/ivBase64/authTagBase64/keyVersion`) e impondo `workspace:manage` na configuração de IA.
  - Mais de 1.300 testes Vitest automatizados cobrindo ciclos de vida de inbox, dossiê, funnel, templates, transmissões e sessões de canal.
- **Banco de Dados de Produção Alinhado (44 Tabelas / Migrações 037 a 063):**
  - Execução sequencial com rollback garantido no PostgreSQL 16 da VPS (`200.141.17.99`):
    - `guided_agent_plans` (038), `integration_event_receipts` (040), `external_payment_confirmations` (044), `outbound_webhook_jobs` (045).
    - `broadcast_preparations` (048), `broadcast_message_tests` (049), `pix_creation_requests` (050), `proposal_creation_requests` (051).
    - `ai_agent_versions` (053), `ai_revision_test_runs` (056), `ai_checkout_requests` (058), `channel_session_bindings` (061).
  - Menor privilégio ativo: revogados comandos destrutivos do worker sobre confirmações financeiras e histórico sem recibo.
- **Resiliência de UI/UX & Validação de Mutações (UX448 e UX449):**
  - Validação estrita de respostas de mutação em `useChannelQr` com `confirmedMutationResponse`, protegendo apresentação visual e estados de erro do provedor WAHA.
  - Conformidade Meta App Review: páginas públicas [PublicLegalPage.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/PublicLegalPage.tsx) (`/legal/terms` e `/legal/privacy`) responsivas e auditadas com o e-mail de DPO `suporte@automatizaprocessos.tech`.
  - Rebuild produtivo de `chat-sales-web` e reinicialização coordenada de `chat-sales-api` e `chat-sales-worker` na VPS, mantendo latência de banco em 7-14ms e Redis em 0-1ms.

### 2.11 Gateway AbacatePay & Conciliação Comercial Transacional REA (Migração 064)
- **Topologia Híbrida de Liquidação:**
  - O SOS Sales V3 passa a suportar liquidação dual: Pix Direto BACEN EMV nativo (sem intermediários bancários) e Gateway AbacatePay para links de checkout transparentes e cobranças com cartão/Pix gerenciado.
  - **Migração 064 (`064_abacatepay_gateway_integration.sql`):** Adição de `abacatepay_api_key`, `abacatepay_webhook_secret` e `abacatepay_enabled` em `public.workspaces`, e adição de `gateway_provider`, `gateway_charge_id` e `gateway_checkout_url` em `public.pix_charges` com índices dedicados `idx_pix_charges_gateway_charge` e `idx_workspaces_abacatepay_enabled`.
- **Segurança de Webhook & Mitigação de Timing Attack:**
  - Validação rigorosa de assinatura HMAC SHA-256 no cabeçalho `AbacatePay-Signature` (`t=timestamp,v1=hash`) usando `crypto.timingSafeEqual` com tolerância de drift de relógio de 5 minutos (300s).
  - Rotas de Webhook isoladas: Endpoint tenant-scoped (`POST /v1/webhooks/abacatepay/:workspaceId`) e endpoint de resolução global por metadados (`POST /v1/webhooks/abacatepay`).
- **Ciclo de Conciliação Transacional de Ponta a Ponta:**
  - Ao receber o evento `billing.paid`, o `abacatepay.service.ts` executa reconciliação transacional completa:
    1. Atualiza `pix_charges.status = 'PAID'` e timestamp `paid_at`.
    2. Atualiza propostas vinculadas (`proposals.status = 'accepted'`).
    3. Registra desfecho comercial em `commercial_outcomes` com valor bruto e canal de origem.
    4. Dispara enriquecimento cadastral via BrasilAPI (caso haja CPF/CNPJ).
    5. Emite mensagem de confirmação de pagamento para o cliente via fila `outbound_commands` no WhatsApp.
- **Cockpit Comercial & Gestão de Credenciais:**
### 2.12 Transição de Marca SOS Vendas & Precificação Canônica AbacatePay v2 (Outubro/2026)
- **Marca Oficial Soberana:** Reposicionamento comercial e institucional para **SOS Vendas** (marca de produto e operação), sob razão social `69.553.990 FRANCISCO TAVEIRA RIOS (CNPJ: 69.553.990/0001-91)` / `MCT LTDA` (Chapecó/SC).
- **Precificação Anual Base de R$ 1.200,00:**
  - Anual Pix: R$ 1.080,00 (10% OFF, R$ 90/mês). Checkout: `https://app.abacatepay.com/pay/bill_kAfpgk4PpKJcqY5KGbbEEGmS`.
  - Anual Cartão: 12× R$ 100,00 (R$ 1.200,00 total). Checkout: `https://app.abacatepay.com/pay/bill_Bahszz3UEuXzqqZhGg25HQeX`.
  - Semestral Pix: R$ 570,00 (5% OFF, R$ 95/mês). Checkout: `https://app.abacatepay.com/pay/bill_dM6P6Pnf1LHTLQbSGMyjYNzs`.
  - Semestral Cartão: 6× R$ 100,00 (R$ 600,00 total). Checkout: `https://app.abacatepay.com/pay/bill_GERMqWZAEKDM4Rm16sqJpd51`.
- **Compatibilidade AbacatePay API v2:** O script `scripts/setup-abacatepay-plans.mjs` administra produtos e checkouts pelos endpoints v2 correspondentes. A criação de cobrança transparente usa `/v2/transparents/create` para chaves v2; não há fallback por `/v1`.

### 2.13 Resolução de @lid no WAHA & Unificação de Contatos
- **Correção de JIDs @lid:** Motor WAHA multi-device pode entregar mensagens sob `@lid`. No fluxo de entrada do worker (`apps/worker/src/processors/inbox-processor.ts`), o resolver usa `/api/{session}/lids/{lid}` para obter o JID telefônico antes de persistir o contato; coberto por teste com sessão codificada e falha fechada quando a resposta não é um telefone.
- **Fusão em Banco de Produção:** Contatos e mensagens duplicados em `@lid` unificados nas threads canônicas de Suzana Rios (`+554991810054`) e Francisco Taveira (`+554898583228`), eliminando duplicatas no Inbox.

### 2.14 Arquitetura Modular & Módulo Adicional sob Demanda: Emissão Fiscal (NFS-e)
- **Diretriz de Escopo Base vs Módulos (P0):** A anuidade cobre o Núcleo Comercial (Cockpit, Funis, IA Copiloto/Autônoma, Catálogo de Produtos e Pix Nativo).
- **Emissão Automática de Nota Fiscal (NFS-e):** Formalizada como **Módulo Adicional sob Demanda**, contratado à parte de acordo com o município da empresa (devido à fragmentação de provedores municipais ABRASF/DSF/Betha/Ginfes, certificado digital A1 e custos por requisição de API).
- **Transparência Contratual:** A MCT LTDA emite nota fiscal da assinatura SaaS do SOS Vendas para o cliente; a emissão fiscal de notas de venda para clientes finais é provida pelo módulo adicional. Módulos adicionais também cobrem Meta WABA Oficial e Conectores ERP (Bling, Tiny, Omie).

### 2.15 Banco de Modelos Canônicos (70 modelos no contrato local revisado em 24/10/2026)
- **Repositório Central de Modelos:** `packages/contracts/src/template-library.ts` (70 modelos únicos em 13 segmentos; teste direcionado e compilação dos contratos passaram). A importação cria rascunho local, não aprovação Meta.
- **Estado de publicação:** expansão editorial aditiva acrescentou 33 modelos, preservando os 37 anteriores. A fonte e os bundles de API/Web foram atualizados na VPS após backup seletivo; saúde técnica passou, mas não houve validação autenticada da jornada de importação em produção.
- **Cockpit Comercial & Landing Page:** Aba nativa no Cockpit (`TemplatesPage.tsx` / `TemplateLibrarySection.tsx`) com busca e importação em 1-clique, e vitrine visual interativa na Landing Page (`#modelos`) com previews em formato de balão WhatsApp.
- **Produção na VPS:** imagens Docker compiladas e rodando na Hostinger Cloud KVM 4 (`chat.automatizaprocessos.tech` e `automatizaprocessos.tech`). O estado do catálogo em produção deve ser lido da seção de publicação deste documento, não inferido da fonte local.

### 2.16 PLX Automações: Módulo M02B Checklist Recorrente & Modo Sombra Governança
- **Módulo M02B em Operação:** Implementado o motor autônomo de checklist contábil periódico via PostgreSQL Data Tables (`plx_checklist_regras_v1` e `plx_checklist_execucoes_v1`), integrando diretamente com os 104 documentos organizados no Google Drive em `plx_v3_documentos`.
- **Governança de Modo Sombra (P0):** Regras de cobrança operando com `send_enabled = false`, garantindo zero envio de mensagens no WhatsApp durante o período de homologação assistida da PLX Contabilidade (`120363430175893546@g.us`).
- **Engine Soberano:** Utilitário Python `/opt/plx-documentos/app/scripts/plx_checklist_engine.py` com rotinas de seed, materialização de competência, reconciliação automatizada e relatórios executivos de auditoria.
- **Automação Diária:** Cronjob configurado no host às 07:00 AM para reconciliação contínua da competência ativa.

### 2.17 Sinergia Soberana: B2G Cockpit ➔ Atlas Copiloto (Tesouraria Ativa & Swing Trade)
- **Topologia de Ilhas Conectadas:**
  - **Ilha 3 — Atlas Copiloto:** Porta interna `18080`, Caddy TLS `https://atlas.automatizaprocessos.tech`.
  - **Ilha 4 — B2G Cockpit:** Porta interna `8096`, Caddy TLS `https://b2g.automatizaprocessos.tech`.
- **Princípio Inviolável de Segregação Patrimonial (P0):**
  - **Float de Fornecedor (Passivo Circulante):** Capital de terceiros retido entre o pagamento do órgão público e o vencimento do boleto do distribuidor (D+15 a D+45). Fica 100% blindado em Renda Fixa de Liquidez Diária (CDB 100% CDI / Tesouro Selic). Zero risco de mercado.
  - **Lucro Líquido Real MCT (Capital Próprio Livre):** Alimenta a esteira de Swing Trade da B3 (`VALE3`, `WEGE3`, `PETR4`, `BBAS3`, `ITUB4`, `BOVA11`) pelo `TradingSignalsScanner`, operando assimetrias técnicas com Risco:Retorno mínimo de 1:2.5.
- **Rastreabilidade Contábil no Ledger:**
  - Boleta de execução e transações no SQLite WAL (`transactions`) recebem os campos auditáveis `origem_capital: "LUCRO_B2G"` e `b2g_opportunity_id`.
  - Vinculação de ponta a ponta entre a licitação pública municipal e a compra de ativos negociados na B3.
- **Demonstrativo Contábil do Balanço Soberano (Hermes Appraiser):**
  - Ingestão contínua do `b2g_pipeline` no método `calculate_sovereign_balance()`.
  - Ativo Circulante incorpora os empenhos e o rendimento acumulado de CDI do float; Passivo Circulante contabiliza as obrigações a liquidar com distribuidores.
- **Segurança Bancária 2FA (RFC 6238 TOTP / BACEN Res. 85):**
  - Motor nativo em Python (`security_2fa.py`) sem dependências externas; liquidação de ordens exige código de 6 dígitos via Google Authenticator / Apple Keychain.
- **Evidências de Homologação em Produção (24/10/2026):**
  - 122 testes automatizados aprovados (114 Python + 8 Node.js).
  - Webhook de disparo testado com sucesso a partir do B2G Cockpit (Dispensa Pneus Chapecó/SC: R$ 24k contrato, R$ 18.2k float no CDI e R$ 4.96k lucro em esteira de Swing Trade).
  - Ordem de compra de `ITUB4` executada e registrada com sucesso no Ledger Contábil em produção.

### 2.18 Mesa Quantitativa Soberana & Motor de Correção de Vieses (Meta-REA no Atlas)
- **Engenharia Reversa Aplicada (8 Repositórios de Trading):**
  - **Time Machine Monte Carlo (`backend/time_machine.py`):** 10.000 iterações bootstrap da distribuição empírica real (últimas 60 sessões B3) para cálculo de odds de alvo/stop, $EV$ e ORB 15m.
  - **Exposure Coach & Market Breadth (`backend/exposure_coach.py`):** Monitoramento das 20 maiores ações do Ibovespa (> MM200 / > MM50). Calibragem do teto de risco patrimonial (`EXPANSAO_TOTAL`: 100%, `DIVERGENCIA_MODERADA`: 50%, `REDUCE_ONLY_DEFENSIVO`: 0% com veto de compras).
  - **Position Sizer & Gestão de Risco (`backend/quant_desk.py`):** Half-Kelly, ATR Wilder (14p), Drawdown Guard e cap duro de 1% de risco financeiro patrimonial por trade.
  - **Copycat 13F & BDRs B3 (`backend/copycat.py`):** Espelhamento institucional SEC EDGAR (Buffett, Burry, Dalio) com mapeamento direto para BDRs da B3 e trades do Congresso Americano (STOCK Act).
  - **Oráculo Polymarket & Brier Score (`backend/prediction_oracle.py`):** Gamma API com sentimento real de apostas macro/eleições e calibração contínua por Brier Score em SQLite.
  - **Simulador Cego OPAL (`backend/backtest_simulator.py`):** Treino visual barra a barra com futuro oculto.
  - **Motor de Correção de Vieses (`backend/bias_engine.py`):**
    * *Viés de Confirmação:* Exigência obrigatória do Advogado do Diabo (Bear Case) e gatilho de invalidação.
    * *Viés de Recência (FOMO):* Detecção de preço esticado ($Z > 2.0$ acima da MM200 ou RSI > 72) com corte de 50% no lote sugerido.
    * *Viés de Excesso de Confiança:* Calibração bayesiana (Shrinkage) de probabilidades infladas pelo Brier Score.
    * *Custo Afundado & Ancoragem:* Trava de Stop Loss Ratchet (proibição de afrouxar stops), Teste da Folha em Branco e custo de oportunidade do CDI.
    * *Defasagem de 13F:* Alerta de precificação prévia quando o ativo subiu $> 20\%$ antes do reporte.
- **Homologação:** 177 testes automatizados passando 100% OK e jornada humana validada em produção.

### 2.19 Meta-REA Governamental: As 5 Alavancas do Compras.gov/SICAF & Arbitragem Negativa de Capital
- **Desconstrução Meta-REA do Marco B2G (Lei 14.133/2021 + LC 123/2006):**
  - **Exclusividade ME/EPP (<R$ 80k - Art. 48, I):** Itens com valor estimado até R$ 80.000 são 100% reservados para MPEs; grandes empresas e distribuidores nacionais estão proibidos por lei de concorrer.
  - **Cota Reservada de 25% (Art. 48, III):** Em certames de grande porte de bens divisíveis (pneus, merenda, suprimentos, cabos, LED), até 25% do certame é blindado para MPEs, permitindo faturar lotes volumosos sem guerra predatória de margens.
  - **Empate Ficto de 5% / 10% (Art. 44):** Lances de ME/EPP até 5% acima da menor proposta em Pregão Eletrônico geram prioridade legal de lance de desempate para arrematar o certame.
  - **Habilitação Blindada & Tardia (Art. 43 LC 123 + Dec. 8.538/15):** 5 dias úteis de prazo para regularização fiscal/trabalhista tardia de certidões vencidas, CND Federal unificada automática no Nível 3 do SICAF (Portaria Conjunta RFB/PGFN 103/2021 e 1.751/2014) e dispensa expressa de balanço patrimonial para bens de pronta entrega (Art. 3º do Dec. 8.538/15).
  - **Liquidez Garantida via AntecipaGov:** Módulo oficial do Compras.gov.br para antecipação de até 70% do contrato público homologado via cessão de crédito bancário, eliminando risco de inadimplência municipal.
- **Ciclo Financeiro Negativo & Conexão Atlas:**
  - `PNCP / Compras.gov` (Captação Exclusiva) ➔ `CrossPricingMatrix` (203 Fornecedores Verificados Sul) ➔ `Protocolo Harvey` (Faturamento a 45 dias contra Empenho) ➔ `Sniper 3 Lances` (Vitória 25-32% margem) ➔ `atlas_integration.py` (Float no CDI a 100% por 20 dias + Lucro em Swing Trade na B3).

### 2.20 Moat Soberano B2G v3.0 — Inteligência Empírica Histórica & Contratação Direta Art. 75, III (28/10/2026)
- **Expurgo Forense Total (*Truth in Data* P0):**
  - Removidos definitivamente `2.795` fornecedores sintéticos gerados por hash, `188` compras históricas com descontos fixos simulados (`14,5%` / `5,0%`) e `123` concorrentes contaminados em `/opt/mct-b2g/data/b2g.db` (backup íntegro preservado em `/opt/mct-b2g/backups/20261028_moat_v3/`), preservando 100% do funil ativo (`27` propostas, `2` empenhos e `159` leilões oficiais Modalidade 1).
- **Os 4 Fossos Competitivos Compostos (`app/core/moat_intelligence.py`):**
  1. **Memória Empírica por Item (`item_price_memory` — `411+` itens reais homologados):** Ingestão direta de `/itens` + `/resultados` do PNCP em SC, PR e RS com preço unitário homologado real, deságio verdadeiro, porte do vencedor e detecção de cascata de inabilitação (`Art. 90`).
  2. **DNA Municipal Sul (`municipal_intelligence` — `572+` órgãos perfilados):** Aprendizado empírico por CNPJ do órgão público (portal eletrônico padrão, deságio médio local, exigência de amostra e propagação automática de portal para `73+` editais abertos sem link no PNCP).
  3. **Forense de Rivais & Grafo Societário QSA (`competitors_intelligence` — `112+` rivais reais):** Classificação matemática de assinatura de lance (`HUMANO_INTEIRO`, `ROBO_CENTAVO`, `ROBO_AGRESSIVO`) combinada ao cruzamento de sócios na BrasilAPI para impugnação por conluio (`Art. 14, IV`, Lei 14.133/2021).
  4. **Caçador Granular de Itens Desertos (`Art. 75, III`) + Ofício PDF 1-Clique (`deserted_tenders` — `71+` itens ativos):** Captura itens individuais desertos/fracassados dentro de pregões comuns (com normalização automática de verba global cadastrada em quantidade a `R$ 1,00`), validação automática dos 9 CNAEs da MCT LTDA (`🟢 CNAE 100% Compatível` vs `🤝 ANVISA / BROKER 6%`), cotação WhatsApp 1-clique e geração instantânea do **Ofício Formal de Contratação Direta em PDF** (`GET /api/b2g/deserted/{id}/art75-pdf`).
- **Pareamento Regional Estrito por Subfamília (`CrossPricingMatrix` + `203` Fornecedores Reais):**
  - Matching por fronteira de palavra (`\b`), bônus de especialista (`+90 pts`) e proximidade de UF (`+35 pts`), conectando cada subfamília ao fornecedor real correto (ex: `Cimento` ➔ `Votorantim Cimentos Sul`, `Telha` ➔ `Martins Atacadista de Telhas Curitiba`, `Madeira` ➔ `Madeireira Chapecó` / `Damo Madeiras Cascavel`), bloqueando contaminação entre subnichos e retornando estado honesto quando não há distribuidor cadastrado para itens ultra-específicos.
- **Retroalimentação Autônoma Contínua:** Daemon `_autonomous_moat_daemon` integrado ao ciclo de vida do `b2g-app` executando varredura histórica e enriquecimento QSA/BrasilAPI a cada 12 horas.

### 2.21 MCT Mesa de Compras Técnicas — Engenharia Reversa Temporal de Canteiro & Banco de Dados Vivo (02/11/2026)
- **Topologia de Trading & Suprimentos:**
  - Aplicação ativa em `https://b2g.automatizaprocessos.tech/compras.html` (porta 8096, container `b2g-app`).
  - Intermediação pura conforme LC 116/2003, Subitem 10.05 e Anexo III do Simples Nacional (6% Fator R). Venda direta com entrega no canteiro (RICMS Anexo 5 / Súmula 432 STJ). Zero mercadoria transitando em conta bancária da MCT.
- **Motor de Engenharia Reversa Temporal & Curva S:**
  - Decomposição algorítmica da obra em 5 etapas físicas progressivas: Mobilização (0-8%), Fundações Profundas (8-22%), Estrutura/Pavimento Tipo (22-65%), Alvenaria & Instalações (65-85%) e Acabamentos/Fachada (85-100%).
  - Previsão cirúrgica de recompra quinzenal Just-in-Time (aço CA-50 corte & dobra a cada 14 dias para lajes tipo).
- **Banco de Dados Vivo (Truth in Data):**
  - Tabela `procurement_site_calibrations` e colunas de canteiro em `procurement_private_permits`.
  - Abordagem em duas vias: Pitch Teórico Empático (desarme de objeções com foco em chuvas e mobilização de armadores) e Pitch Calibrado (confirmação da etapa física real e cota de aço travada com usina).
  - UI/UX Interativa 360° com Stepper Visual das 5 fases, indicação da etapa ativa no canteiro, console de calibração em tempo real e barra master de avanço físico.
- **Métrica Comercial Double-Take MCT:**
  - Fee do comprador: 10% a 15% sobre a economia líquida comprovada.
  - Rebate da distribuidora: 2% a 4% sobre o faturamento líquido faturado a prazo (28/42 dias).

### 2.22 Playbook de Operações do Cockpit MCT & HUD Interativo (02/11/2026)
- **Manual Canônico de Operação:** `docs/PLAYBOOK_OPERACAO_FERRAMENTA_MCT.md` (e artefato no brain).
- **HUD Interativo na Interface (`compras.html`):**
  - Botão `📖 Playbook do Operador` adicionado na barra superior (topbar).
  - Modal `#modal-playbook` com 5 abas táticas:
    1. *Grade Horária (08h às 18h):* 6 blocos diários de execução militar com Checklist Interativo salvo em `localStorage` e métricas diárias (15 contatos, 3 canteiros calibrados, 2 propostas emitidas, 1 seguro cotado).
    2. *O Mapa das 10 Telas:* Navegação orientada pelos 4 Squads com atalhos diretos (`jumpToCockpitTab`).
    3. *Jornada 360° & Curva S:* Conceito de previsão temporal por alvará e protocolo de calibração empática de canteiro.
    4. *O Motor Double-Take:* Simulação da laje típica de 10t com ganho limpo de R$ 3.780 em 35 minutos, faturamento direto usina-canteiro (Súmula 432 STJ) e NFS-e 10.05.
    5. *Scripts de Guerra & Objeções:* Scripts com botões de cópia rápida em 1-clique e contorno para as 4 objeções universais ("já tenho fornecedor", "quanto custa?", "atrasou por chuva", "manda por e-mail").
- **Endpoints Expostos:**
  - `GET /playbook`: Entrega direta do Markdown canônico com `Content-Type: text/markdown; charset=utf-8`.
  - `GET /api/procurement/playbook`: Retorno JSON estruturado para consumo programático.

### 2.23 Central de Automação de Suprimentos, Pacing Governor & Ouvido Inteligente WAHA (02/11/2026)
- **Módulo Operacional:** `app/core/procurement_automation.py` integrado a `app/main.py`.
- **Fila de Disparo com Pacing Governor (Anti-Ban):**
  - Despacho cadenciado com jitter humano (3 a 7 minutos de intervalo aleatório) e carimbos de agendamento em `procurement_dispatch_queue`.
  - Protege 100% o chip contra bloqueios por rajadas de mensagens na Meta.
- **Ouvido Inteligente WAHA & Auto-Calibragem Cognitiva de Canteiro:**
  - Webhook oficial ativo: `POST /api/whatsapp/webhook` conectado ao container WAHA (`sos-sales-waha:3000`).
  - Parser cognitivo semântico (`parse_site_feedback_message`): detecta automaticamente se o construtor mencionou chuvas, atrasos em semanas/dias, ou a etapa atual da obra (fundações, lajes, estrutura, acabamentos).
  - Executa `calibrate_private_work_site()` de forma autônoma no SQLite com score de confiança $\ge 75\%$, atualizando a Curva S da obra sem intervenção humana.
- **HUD no Cockpit (`compras.html`):**
  - Botão `⚡ Fila & Automação` com contador dinâmico na Topbar.
  - Modal `#modal-automation-queue` com controle de fila, countdown do próximo envio, botão para enfileirar lotes de 5 obras e log em tempo real de mensagens recebidas.
  - Opção de envio `Fila com Pacing (Anti-Ban)` integrada na tela da Jornada da Obra 360°.

---


## 3. Diretrizes de Segurança e Isolamento

- **PostgreSQL RLS:** `FORCE ROW LEVEL SECURITY` em todas as tabelas comerciais. Nenhuma query executa sem o tenant contextual (`SET LOCAL app.current_tenant_id`).
- **Autenticação Segura:** Sessões de usuário autenticadas por JWT HS256 criptograficamente seguro via `JwtIdentityProvider`.
- **Mascaramento de PII:** Ausência de telefone e segredos em texto puro em logs de aplicação e despacho.
- **Firewall UFW Ativo:** Apenas portas 22 (SSH restrito a chaves), 80 (HTTP) e 443 (HTTPS) expostas. Portas de banco e Redis estritamente confinadas à rede interna Docker.


## Estado da IA assistida contextual — 24/10/2026

O modo assistido agora tem caminho de fonte explícito: ação manual do atendente → versão guiada `assist` aprovada/publicada → contexto textual mínimo e limitado por tenant → sugestão revisada no composer. A API não executa ações nem envia; só retorna texto com revisão e mensagem de origem. Mensagens do cliente são conteúdo não confiável; mudanças de contexto durante inferência descartam o resultado. Fonte sincronizada seletivamente na VPS e imagens de validação temporárias compiladas com sucesso. Runtime ativo permanece inalterado; falta uma publicação deliberada e homologação com configuração de empresa autorizada, sem inferir que o modelo real foi validado.

## Proteção de artefatos estáticos da landing — 24/10/2026

O Caddy compartilhado bloqueia nomes AppleDouble e arquivos de backup no host público antes do `file_server`, com rota explicitamente ordenada. O Caddyfile ativo em `/opt/sos-sales/Caddyfile` foi validado e recarregado; os artefatos encontrados foram preservados em `/opt/sos-sales/backups/public-landing-audit-20261024T081816Z/`. O filesystem servido de `/var/www/landing` é somente leitura e não possui bind mount observado. Evidência detalhada em `docs/auditorias/2026-10-20-sos-vendas/LANDING-BACKUP-EXPOSURE-2026-10-24.md`.


## Revisão financeira AbacatePay no cockpit — 24/10/2026

`PixSection.tsx` agora diferencia erro de leitura da fila vazia, valida o resultado da resolução e pede confirmação humana antes de registrar recebimento. Quatro testes focados e typecheck passaram. Build canônico limitado ao Web foi publicado; API e worker não foram recriados. Healthcheck interno do Web e acesso pelo Caddy passaram; health HTTPS público não foi confirmado por timeout. Relatório completo: `docs/auditorias/2026-10-20-sos-vendas/ABACATEPAY-SETTLEMENT-REVIEW-UI-2026-10-24.md`.

### 3.10 Acesso mínimo do worker à cobrança Pix após confirmação — migration 088

`createPixCharge()` lê três dados do workspace para montar o BR Code local: `default_pix_key`, `default_pix_merchant_name` e `default_pix_merchant_city`. Após a revogação do SELECT amplo pela migration 084, esses campos precisam de grants de coluna específicos. A migration aditiva 088 concede somente essa projeção ao `sos_worker_user`; RLS/FORCE RLS filtram pelo workspace configurado na transação, e as chaves/segredos AbacatePay continuam negados. Em produção, o SQL foi aplicado em transação após backup e conferido com `SET ROLE`; contexto ausente retornou zero linhas. Testes PostgreSQL 16 isolado: ACL 1/1 e fluxo funcional 31/31. Sem restart ou deploy de aplicação. Aplicação manual não comprova a ordem do journal, que não foi encontrado. Rollback e hashes estão em `docs/auditorias/2026-10-20-sos-vendas/COBERTURA.md`.

### Refund/dispute transparente — migration 089

Readback VPS confirma a função de contenção `public.pause_pix_confirmation_for_lifecycle(uuid,uuid,text)`. `transparent.refunded` e `transparent.disputed` preservam estados financeiros terminais; a disputa gera revisão humana e não suspende workspace, refund não suspende a assinatura SaaS. A função pausa notificação de confirmação Pix pendente ou em processamento, não fulfillment externo genérico. Testes em PG16 descartável: ciclo 5/5 e auditoria funcional 33/33. Webhook real não foi recebido. Evidência e limites: `docs/auditorias/2026-10-20-sos-vendas/ABACATEPAY-TRANSPARENT-LIFECYCLE-IMPLEMENTATION-2026-10-24.md`.


---

## Ecossistema de Rotina Executiva TDAH & Consumidores WAHA (28/10/2026)

Na VPS `200.141.17.99`, a sessão `sos-vendas` do container `sos-sales-waha` atende também os módulos pessoais de produtividade TDAH do Francisco, todos isolados em banco SQLite próprio (`/opt/monday-tdah/data/monday_tdah.db`) e regidos por trava **fail-closed** (`AUTHORIZED_OPERATORS` e `AUTHORIZED_RECIPIENTS` restritos ao grupo `120363429829527658@g.us` e ao número/LID do Francisco):

- **Cockpit Monday TDAH (`/opt/monday-tdah/server.py`, container `monday-tdah` em `127.0.0.1:4600`):** publicado em `https://tarefas.automatizaprocessos.tech` sob `basic_auth` no Caddy (`HTTP 401` sem credencial). Abas: *Tarefas & Foco*, *Pauta SiGA* (leitura local de `siga_cache`), *Finanças (Caixa)* e *Segundo Cérebro*.
- **Ponte WhatsApp QG (`/opt/plx-documentos/app/scripts/mct_whatsapp_hermes_bridge.py`, systemd `mct-hermes-whatsapp.service`):** transcrição local via `whisper-asr` (`127.0.0.1:9000`) e roteamento determinístico unificado (`route_user_intent`) para pauta SiGA, conclusão rápida (`feito #ID`), caixa pessoal/empresarial, notas e resumos de grupos.
- **SiGA Sentinel & Inteligência de Grupos (`/opt/siga-sentinel/`):** 100% *read-only* no SiGA SW e Google Drive, reutilizando `_siga_session` com reconciliação estrita por aba (`jobs_tab_6` Aprovados e `jobs_tab_3` Em Andamento) e leitura incremental por watermark dos 5 grupos corporativos autorizados às `08:30`, `12:30` e `17:30 BRT` (`/etc/cron.d/mct-group-digest`).
- **Fuso Horário Operacional (`BRT / UTC-3`):** o host permanece em `Etc/UTC` para preservar logs e bancos das 4 ilhas; todos os módulos Python de rotina usam `datetime.timezone(timedelta(hours=-3))` explícito e o `crontab` `root` dispara rotinas matinais em `UTC = BRT + 3h` (`06:30`, `07:00`, `07:15`, `07:30` e `08:00 BRT`). Backup pré-reconciliação em `/root/backups/routine-audit-20261028-170038`.
- **Unificação no Hermes Agent Hub v0.22.4 (`127.0.0.1:8642` — 28/10/2026):**
  - Migrado o arsenal completo do Mac (`~/.hermes`) para `/root/.hermes` na VPS (`134` pastas / `~420` skills, `17` perfis especialistas de subagentes com symlink de skills, hooks, plugins, workflows, scripts e índice híbrido FTS5 BM25 em `/root/.hermes/hybrid_memory.db` com cron horário `:17`), além das novas skills soberanas `mct-routine-tdah` e `mct-b2g-fiscal-motors`.
  - Serviço `hermes-gateway.service` ativo exclusivamente em loopback (`127.0.0.1:8642`), operando `nvidia/nemotron-3-ultra-550b-a55b` (`reasoning_effort: xhigh`, `service_tier: fast`) com `21+` toolsets nativos (`kanban`, `project`, `tts`, `browser`, `delegation`, `memory`, `session_search`, `terminal`, `file`, `code_execution`, `web`) e servidores MCP `mct_soberano`, `memory` e `sequential-thinking`.
  - **Tavibot (`mct-tavibot.service`)** e **Ponte WhatsApp QG (`mct-hermes-whatsapp.service`)** compartilham o mesmo cérebro executivo (`X-Hermes-Session-Key: mct_executive_francisco`) e continuidade de sessão (`X-Hermes-Session-Id` persistido em `/opt/plx-documentos/app/data/hermes_sessions.json`), mantendo os atalhos determinísticos `<100ms` e suporte a voz via `whisper-asr` em ambos os canais. Backup pré-migração em `/root/backups/hermes-hub-migration-20261028-183140`.
- **Reconciliação B2G Cockpit v2.3 & Dossiê PDF no Hermes 550B (`/opt/mct-b2g` — 28/10/2026):**
  - Unificado `hermes_service.py` ao `hermes_digestor.py`: auditorias de editais no `550B` agora executam automaticamente a extração literal de PDFs do PNCP (com arquivo e página) e respeitam *Truth in Data* (`prazo_entrega_dias` real do PDF ou `None`, eliminando o fallback sintético de `15` dias).
  - Blindado `whatsapp_notifier.py` em modo **Fail-Closed P0**: alertas internos (*Edital Ouro*, *Leilão Ouro*, *Sniper Alert*) apontam para o grupo **Hermes QG (`120363429829527658@g.us`)**, e cotações para números externos de fornecedores retornam exclusivamente o link `wa.me` 1-clique sem disparo automático na sessão `sos-vendas`.
  - Corrigido tratamento de campos nulos do SQLite em `cross_pricing_matrix.py` (`find_matching_suppliers`) e sincronizados seletivamente os módulos atualizados com `/opt/mct-b2g` (`31/31` testes `pytest` aprovados; backup em `/root/backups/b2g-sync-20261028-194040`).
- **Ilha Atlas v3.0 Sovereign (`/opt/atlas`, container `atlas-app` em `127.0.0.1:18080:8000` -> `https://atlas.automatizaprocessos.tech` — 28/10/2026):**
  - **Corpus Jurídico Oficial Embarcado (`ctresb/leis` SHA-256):** Lei 15.270/2025 (*Pacing Governor* `R$ 50k/mês` em dividendos + escudo de isentos `LCI/LCA/CRI/CRA/FIIs` contra IRPFM `R$ 600k/ano`), Decreto 6.306/2007 (Sentinela Anti-IOF 1-29 dias no Float B2G) e Lei 11.033/2004 (abatimento automático do IRRF Dedo-Duro na DARF `6015`).
  - **Importador SINACOR B3 (`.PDF` / `.XLSX`) & Sessão Zero-Trust (`Cookie HttpOnly` 12h):** Parser nativo para notas de corretagem B3 e autenticação HMAC-SHA256 com revogação instantânea de nonce.
  - **Ponte B2G Cockpit ➔ Atlas com Segregação Contábil CPC 00 (`sos-sales-network`):** Webhook e pull direto de `http://b2g-app:8096/api/opportunities` (`POST /api/b2g/sync-cockpit`), separando empenhos contratados no Balanço Hermes (`empenhado`, `em_transito`, `liquidacao`) de propostas off-balance em disputa (`proposta`, `cotacao`), com Sentinela Proativa (`WAHA QG` + `Telegram`) restrita a passivos contratados e frontend desacoplado em 4 módulos (`sentinel-v3.js`, `ledger-hermes.js`, `trading-quant.js`, `service.js` com cache-busting `?v=3.0.1`).
- **Moat Soberano B2G v3.1 & Tese Distribuidora MCT (`/opt/mct-b2g`, `b2g-app` em `127.0.0.1:8096` -> `https://b2g.automatizaprocessos.tech` — 28/10/2026):**
  - **Diretriz Permanente de Portfólio & Escada de 3 Degraus (Rumo à Distribuidora MCT):** **Degrau 1 (Assessoria Licitatória & Parcerias em Serviços — Caixa Sem Risco e Aprendizado Pago):** faturamento legal imediato sob os CNAEs já ativos `8219-9/99` (*Preparação documental e apoio administrativo*) e `7319-0/02` (*Promoção de vendas*), com motor `broker_partner_engine.py` cruzando empresas executoras reais de `SC/PR/RS`, Pitch Cego Anti-Bypass via `wa.me` 1-clique e Contrato PDF `Non-Circumvention` atrelado à Ordem Bancária pública; **Degrau 2 (Arbitragem Direta MCT):** Mercadorias ME/EPP `<= R$ 80 mil`, Desertas `Art. 75, III`, Automóveis (`veiculo` FIPE + autopeças monofásicas), Imóveis (`imovel` VGV) e Lotes Físicos da RFB (`produtos_receita`); **Degrau 3 (Distribuidora MCT):** formação de estoque próprio guiada pela `curva_abc_futura_distribuidora`. **Veto permanente** a SaaS/licenças perpétuas de software e produtos bélicos controlados pelo Exército/DFPC.
  - **Blindagens Operacionais Ativas (`Truth in Data P0`):** Trava Fiscal Automática de Teto MEI (`LC 123 Art. 18-A § 7º`: itens `<= R$ 81 mil` em 1º lugar para venda direta no MEI com DAS fixo; itens `> R$ 81 mil` convertidos automaticamente em `BROKER_ATACADO_ACIMA_TETO_MEI` a `6%` na NFS-e para zerar risco de desenquadramento retroativo), priorização de janela tática `>= 48h` no ranking Broker, isolamento estrito de setor nos parceiros (`sec_hits >= 1` + `exclude_rx` + filtro RJ/Falência/Inativa RFB), trava `lance <= teto_edital` + `Stop 18%` na Mesa Sniper, `203` atacadistas reais verificados no Sul (c/ dupla cotação `1ª` e `2ª Opção` em Desertas `Art. 75, III`) e enriquecimento item-aware cobrindo `99,35%` dos editais abertos em `SC/PR/RS`.
  - **Paridade Full-Stack `Frontend ↔ FastAPI ↔ SQLite` (`?v=20261029c` — `29/10/2026`):** `47/47` arquivos de código de `app/` com `100%` de paridade `SHA-256` entre Mac e `b2g-app` (`42/42` testes `pytest` + `node --check`), incluindo: (i) aba `Resultados` conectada a `GET /api/results/summary?uf=...` (separando caixa liquidado de propostas em disputa); (ii) `Deal Desk` (`GET /api/proposals/list?uf=...`) unificando `lance_efetivo` e `lucro_efetivo` sem prazo sintético `5d`; (iii) `Quote Desk` (`normalizeQuoteStage`) reconciliando os 4 enums reais de `b2g.db` (`COTACAO_GERADA`, `COTACAO_EM_ANDAMENTO`, `COTACAO_RECEBIDA`, `PROPOSTA_ENVIADA`); (iv) `Leilões` e `Acervo` incluindo `modalidade_codigo IN (1, 7, 13)` sem multiplicador artificial `FIPE * 1.8` nem `"Setup R$ 750"` fixo; (v) calculadora fiscal do Drawer aplicando `0%` variável na NF-e até `R$ 81 mil` (`MEI DAS Fixo`) e `4,0%` (`Anexo I Simples ME`) acima; e (vi) remoção segura dos 4 arquivos órfãos com backup em `/root/backups/b2g-fullstack-align-20261029/`.
  - **Central de Portais, Bancos & Harvester Multi-Fontes Sem `e-CNPJ` (`?v=20261029e` — `29/10/2026`):** Novo módulo `app/core/portal_registry_and_harvester.py` + visão `#portalsSection` (`🔑 Portais & Bancos`), mapeando `33` grupos (`~40` plataformas, `31` operáveis hoje sem `e-CNPJ` via `Gov.br Prata/Ouro`, `CNH + CCMEI`, `assinador.iti.br` ou `Parceiro Broker 6%`, com cofre SQLite `portal_registrations` + `sovereign_credentials_meta`) e `6` conectores reais em produção: (1) `Superbid Exchange Sul` (`offer-query.superbid.net` — lotes bancários/cooperativas/frotas com veto de semoventes e zero FIPE sintética); (2) `Mega Leilões Sul` (`megaleiloes.com.br/{sc,pr,rs}` SSR — lotes bancários e 2ª praça judicial com deságio oficial `50%` quando há 1ª/2ª praça distintas); (3) `SLE Receita Federal` (`100` editais alfandegários com flag `permitePF`); (4) `SESC-SC Sistema S` (`33` editais e leilões abertos `100%` fora do PNCP com extração automática via `pypdf` de lance mínimo, FIPE oficial e orçamento não-sigiloso direto dos PDFs anexos); (5) `PNCP Mod 1 e 13` (leilões municipais/estaduais exclusivos PNCP); e (6) `POST /api/portals/import-caixa-csv` (`📤 Importar CSV Caixa` p/ `Lista_imoveis_SC/PR/RS.csv` sem violar CAPTCHA Radware). Backup em `/root/backups/b2g-portals-wave2-20261029/`.
  - **Hardening Zero-Trust, Higiene SQLite & Automação Anti-`429` (`49/49` testes `pytest` — `29/10/2026`):** (i) `auth_middleware` em `app/main.py` blindando `100%` de `/api/b2g/sniper/*`, `/api/b2g/extension/download`, `/api/b2g/proposals/download/*`, `/api/docs` e `/*-pdf` (`HTTP 401` sem cookie/chave), `secure=is_https`, Extensão Chrome MV3 `v2.1.0` (`extension/background.js`) e `mct_telegram_secretary.py` autenticados com `x-sovereign-key`; (ii) `HermesAppraiser.build_honest_arbitrage` aplicado em `/api/auctions`, `/analyze`, `/dossier` e alertas WhatsApp (eliminando reinjeção runtime de FIPE sintética `lance / 0.55`, preservando `0` `SBID_%` artificiais e `R$ 87.528,00` FIPE real no `SESCSC_16529`); (iii) `archive_expired_radar_opportunities()` saneando os `1.127` registros `radar` legados contaminados com `0.62x` / `COTACAO_EM_ANDAMENTO` (preservando os `27` processos reais em `proposta` e `2` em `empenhado`), além de arquivar `432` vencidos (`encerrado_sem_disputa`) e `937` fora da Região Sul (`fora_escopo_uf`); (iv) regra tributária MEI (`0%` variável até `R$ 81 mil` / `4,0%` Anexo I acima) unificada na Mesa Sniper (`calculate_bidding_desk` + `record_bidding_bid`), disputas persistidas em `sniper_monitored_disputes`, `4` índices compostos `idx_opp_*` no SQLite e cronômetro do Kanban lendo `data_encerramento_proposta`; e (v) coletor 4h `SC/PR/RS` com retry de `TimeoutError`/`URLError`, colheita multi-portais `2x/dia` (`45 9,16 * * *` UTC) e snapshot diário quente (`10 3 * * *` UTC -> `/root/backups/b2g-daily/`). Backups em `/root/backups/b2g-refinements-20261029/` e `/root/backups/b2g-refinements-wave2-20261029/`.
- **StockVision v2.1 — Catálogo Visual `SHA-256` & Estante Física Mobile (`/opt/stock-vision`, `stock-vision-app` em `127.0.0.1:4500` -> `https://automatizaprocessos.tech/estoque/haven` — `29/10/2026`):**
  - **Vault de Mídia Imutável (`MediaVault`):** fotos reais enviadas no WhatsApp ou pela câmera web são validadas por *magic bytes* (`JPEG/PNG/WebP/GIF`, limite `8 MB`), salvas atomicamente em `/opt/stock-vision/data/media/<tenant_id>/<sha256_32>.<ext>` e vinculadas em `stock_products` (`image_url`, `shelf_photo_url`), `stock_product_photos` e `stock_movements.photo_url`.
  - **Estante Visual & Organização de Prateleira:** toggle `🖼️ Estante Visual` / `📋 Tabela Contábil` em `/estoque/:tenantId`, pílulas de auditoria (`📐 Pendentes Contagem`, `📷 Sem Foto`, `🗺️ Sem Local` + locais dinâmicos), modal mobile `🔢 Contar / Local` (`POST /api/stock/:tenantId/products/:productId/organize`), upload direto da câmera comprimido no cliente para `1280px` JPEG (`POST /photo`), atalho WhatsApp `foto: <produto> - <local>` (opção `4️⃣ Só salvar foto no catálogo`), `!contagem <Local>: item qtd, ...` e miniaturas `=IMAGE(...)` nos CSVs com URL capability `SHA-256` isenta de Basic Auth no Caddy (`not path /api/stock/*/media/*`, mantendo `HTTP 401` em `/estoque*` e `/api/stock/:tenantId`).
  - **Resgate Retroativo WAHA & Validação (`55/55` testes Vitest):** `11/11` movimentações com foto da Haven Escovaria (`10` produtos distintos, incluindo *Klass Vough Brush Cleanser* em `Salinha de Maquiagem`) resgatadas de `sos-sales-waha:/app/.sessions/files/sos-vendas/` sem qualquer dado mock (*Truth in Data*). Backup em `/opt/stock-vision/data/backups/pre_visual_catalog_20261029/`.
- **MCT B2G v3.3 — Gerador de Demanda Perpétua & Central de IA com Pacing Governor (`02/11/2026`):**
  - **Mesa de Compras Técnicas & Curva ABC:** decomposição SINAPI Classe A (80% valor de canteiro: aço, cimento, tubos PEAD) integrada ao cruzamento de 203 usinas/distribuidores no Sul com entrega just-in-time e prazo faturado.
  - **Engenharia Reversa de Canteiro & Curva S (`site_timeline_calibration.py`):** cálculo preditivo da fase física da obra (Fundações, Estrutura, Alvenaria, Acabamentos) com auto-calibração cognitiva em tempo real via WhatsApp ("choveu 15 dias" -> ajusta desvio de cronograma).
  - **Gerador de Demanda Perpétua (`perpetual_demand_engine.py`):** ingestão matinal diária via crontab às `05:30 BRT` (`08:30 UTC`), filtragem de duplicidades em janela de 21 dias e auto-enfileiramento com Pacing Governor (intervalos humanos de 4 a 7 min entre envios das `09:15` às `18:00 BRT` via worker a cada 3 min) com disparo WAHA oficial na sessão `sos-vendas`.
  - **Central de Agentes & Treinamento de DOTs Soberanos:** 5 agentes de IA operando com Nemotron 550B Ultra Reasoning e Claude 3.5 Sonnet para elaboração de pitches, impugnações e defesas contratuais. Interface SPA atualizada em `https://b2g.automatizaprocessos.tech/compras.html`.
- **MCT B2G v3.4 — Diretoria B2G Turnkey, Blindagem Anti-Bypass & Resiliência PNCP (`03/11/2026`):**
  - **Expansão de Modelo: Co-Gestão e Diretoria B2G Terceirizada (Art. 12, II da Lei 14.133/2021):** Validação prática com parceiros locais especializados (Piloto: *Chapecó Películas LTDA*, CNPJ `16.581.349/0001-02` - Películas Automotivas, Prediais e PPF em raio de até 500 km no Sul). O parceiro atua exclusivamente como executor técnico e a MCT assume 100% da inteligência, habilitação e operação dos lances.
  - **Doutrina Anti-Bypass ("Não Entregar o Ouro"):** Ocultação obrigatória de números de edital, processos administrativos e hashes do PNCP em qualquer dossiê preliminar. Identificação estrita por código interno (`MCT-B2G-UF-ANO/TAG-SEQ`). Segregação física de pastas por parceiro em `docs/representacao_consultoria_b2g/clientes/<slug>/` para eliminar risco operacional de vazamento cruzado.
  - **Calibração Orçamentária Reversa & Trava de Stop Loss:** O parceiro define seu Piso Líquido Mínimo; a MCT calcula a faixa de disputa protegendo **10% a 15% de Success Fee** (devido em até 5 dias úteis após a liquidação bancária do empenho pelo órgão público). Trava hardcoded no robô impede lances abaixo do piso combinado. Contrato de representação formatado com força de Título Executivo Extrajudicial (Art. 784, III do CPC).
  - **Resiliência PNCP (`_safe_pncp_get`):** Implementado backoff exponencial com jitter randômico contra rate limit HTTP 429 e quedas transitórias de rede na API pública do PNCP, mantendo estabilidade contínua na varredura multi-UF do Sul.
