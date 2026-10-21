# ATLAS SOBERANO — SOS VENDAS & MCT OS

> Francisco Rios | 69.553.990 FRANCISCO TAVEIRA RIOS (CNPJ: 69.553.990/0001-91) | MCT LTDA | Chapecó, SC  
> Filosofia: Poder invisível, simplicidade visível. Truth in Data.  
> Hierarquia: P0 (Kernel Soberano) > P1 (Atlas & CODEBASE) > P2 (Agentes & Skills).

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

### 2.2 Truth in Data & Anti-Alucinação Estrito
- **Zero Mock / Zero Alucinação:** A IA nunca inventa preços, prazos ou políticas comerciais.
- **Grounding Dinâmico em 4 Camadas:** Todo atendimento ancora diretamente nos dados de `public.products`, `ai_business_rules` e `ai_faq`.
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
  - Zero risco de parada: se o workspace não tiver chave cadastrada, a IA envia a resposta conversacional normalmente sem interromper o atendimento.

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
- **Compatibilidade AbacatePay API v2:** Script `scripts/setup-abacatepay-plans.mjs` com endpoints `/v2/products/create` e `/v2/checkouts/create`, e auto-fallback inteligente em `abacatepay.service.ts` para `/v2/transparents/create` quando a chave é v2 (`abc_dev_wtSQfDwwBrpNKt6ktA1Gg0kc` - Recrutaria).

### 2.13 Resolução de @lid no WAHA & Unificação de Contatos
- **Correção de JIDs @lid:** Motor WAHA multi-device entrega mensagens sob `@lid`. Implementado o resolver em `channels.routes.ts` via `/api/{session}/lids/{lid}` para recuperar o número E.164 real antes de criar o contato.
- **Fusão em Banco de Produção:** Contatos e mensagens duplicados em `@lid` unificados nas threads canônicas de Suzana Rios (`+554991810054`) e Francisco Taveira (`+554898583228`), eliminando duplicatas no Inbox.

### 2.14 Arquitetura Modular & Módulo Adicional sob Demanda: Emissão Fiscal (NFS-e)
- **Diretriz de Escopo Base vs Módulos (P0):** A anuidade cobre o Núcleo Comercial (Cockpit, Funis, IA Copiloto/Autônoma, Catálogo de Produtos e Pix Nativo).
- **Emissão Automática de Nota Fiscal (NFS-e):** Formalizada como **Módulo Adicional sob Demanda**, contratado à parte de acordo com o município da empresa (devido à fragmentação de provedores municipais ABRASF/DSF/Betha/Ginfes, certificado digital A1 e custos por requisição de API).
- **Transparência Contratual:** A MCT LTDA emite nota fiscal da assinatura SaaS do SOS Vendas para o cliente; a emissão fiscal de notas de venda para clientes finais é provida pelo módulo adicional. Módulos adicionais também cobrem Meta WABA Oficial e Conectores ERP (Bling, Tiny, Omie).

### 2.15 Banco de Modelos Canônicos (70+ Templates WhatsApp em 13 Segmentos)
- **Repositório Central de Modelos:** `packages/contracts/src/template-library.ts` (70+ templates divididos em Utilidade [85% mais barato] e Marketing para 13 segmentos comerciais).
- **Cockpit Comercial & Landing Page:** Aba nativa no Cockpit (`TemplatesPage.tsx` / `TemplateLibrarySection.tsx`) com busca e importação em 1-clique, e vitrine visual interativa na Landing Page (`#modelos`) com previews em formato de balão WhatsApp.
- **Produção na VPS:** Imagens Docker compiladas e rodando na Hostinger Cloud KVM 4 (`chat.automatizaprocessos.tech` e `automatizaprocessos.tech`).

---

## 3. Diretrizes de Segurança e Isolamento

- **PostgreSQL RLS:** `FORCE ROW LEVEL SECURITY` em todas as tabelas comerciais. Nenhuma query executa sem o tenant contextual (`SET LOCAL app.current_tenant_id`).
- **Autenticação Segura:** Sessões de usuário autenticadas por JWT HS256 criptograficamente seguro via `JwtIdentityProvider`.
- **Mascaramento de PII:** Ausência de telefone e segredos em texto puro em logs de aplicação e despacho.
- **Firewall UFW Ativo:** Apenas portas 22 (SSH restrito a chaves), 80 (HTTP) e 443 (HTTPS) expostas. Portas de banco e Redis estritamente confinadas à rede interna Docker.
