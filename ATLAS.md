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
