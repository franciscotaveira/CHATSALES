# CODEBASE.md — SOS Sales V3 (Greenfield Sovereign Architecture)

> MCT OS v2.0 | Francisco Rios | 36.473.741 FRANCISCO TAVEIRA RIOS (CNPJ: 36.473.741/0001-37) | MCT LTDA | Chapecó, SC  
> Filosofia: Poder invisível, simplicidade visível. Truth in Data.  
> Última atualização: 20 de outubro de 2026 (Migração Hostinger KVM 4, Domínio automatizaprocessos.tech, Topologia de Ilhas e Governança Anti-Tampering VPS)

---

## 1. Stack Técnica Soberana

- **Runtime & Gerenciador de Pacotes:** Node.js >= 20.0.0, pnpm 11.7.0.
- **Linguagem & Compilação:** TypeScript 5.8.2, Turborepo 2.10.13, tsup 8.5.1 (ESM/CJS).
- **Servidor HTTP & Gateway:** Fastify 5.12.5 (Ingress com rawBody, teto de 512 KB, blind-enumeration protection).
- **Banco de Dados & RLS:** PostgreSQL 16 com FORCE ROW LEVEL SECURITY em todas as tabelas comerciais e de fila.
  - Roles de banco segregadas com menor privilégio:
    - `sos_app_user`: Operações de aplicação autenticada com tenant scoping.
    - `sos_ingress_user`: Resolução de webhook por token hash via função security definer `lookup_channel_ingress`.
    - `sos_worker_user`: Polling de filas (`outbound_commands`, `channel_webhook_inbox`) e transições de estado via `withWorkerTransaction`.
    - `sos_migration_owner`: DDL e migrações estruturais.
- **Fila & Cache:** Redis 7 (Docker Compose), BullMQ 5.41.6.
- **Motores de Mensageria & Conversão:**
  - `meta_waba`: Meta WhatsApp Cloud API Oficial (Templates, HSM, Webhooks normatizados).
  - `waha`: WhatsApp HTTP API local em container Docker com engine `WEBJS` e pinning estrito por digest de imagem (`latest-2026.8.2@sha256:...`). Zero modo privilegiado.
  - `meta_capi`: Meta Conversions API para Business Messaging (`whatsapp`) na Graph API `v26.0` (padrão) com envio estrito via Bearer Token, WABA account ID explícito e percurso CTWA ponta a ponta.
- **Criptografia & Segredos:** Keyring versionado com AES-256-GCM, derivação scrypt, `DatabaseSigningSecretResolver` e trigger de auditoria imutável (`audit_events`).
- **Observabilidade:** Pino logger estruturado (`@sos-sales/observability`) com ausência de telefone (mesmo mascarado) nos logs de dispatch/worker e ausência de tokens ou segredos em claro.

---

## 2. Mapa do Monorepo

```
/
├── apps/
│   ├── api/          # Gateway HTTP Fastify: webhooks, autenticação e rotas públicas
│   ├── worker/       # Motor assíncrono: InboxProcessor, OutboxDispatcher e WorkerRuntime
│   └── web/          # Interface administrativa (React/Vite)
├── packages/
│   ├── application/  # Services de canal, registry, dispatch, retry policies e segurança SSRF
│   ├── auth/         # Verificação de tokens JWT/JWKS e injeção de contexto de workspace
│   ├── contracts/    # Tipos DTO, contratos de webhook e eventos de mensageria
│   ├── database/     # Repositórios (ChannelInstance, OutboundCommand), pools e helpers de RLS
│   ├── domain/       # Regras de negócio puras (validação E.164, atribuição comercial)
│   ├── observability/# Loggers estruturados e mascaramento de PII
│   └── ui/           # Design system e componentes visuais reutilizáveis
├── infra/
│   └── docker/       # Configurações do Postgres e init scripts com isolamento de roles
└── scripts/          # Ferramentas operacionais, test runner hermético e CI quality gate
```

---

## 3. Padrões Ativos e Decisões Arquiteturais Invariáveis (P0)

### 3.1 Ausência de Shell em Componentes Comprovados
- O script de verificação de ambiente WAHA (`scripts/smoke-docker-waha.ts`) opera estritamente sem invocação de shell, usando `child_process.execFile` com argumentos em array tipado e sem interpolação de strings (`exec`, `execSync` e `spawn({shell: true})` são proibidos nesse componente).
- Utilitários de runner de CI (`scripts/ci-gate-runner.ts`) utilizam chamadas de processo controladas para orquestração interna de gates locais. Não há ausência global de `execSync` no monorepo fora dos componentes que exigem essa garantia estrita.

### 3.2 Seleção Explícita de Instâncias de Canal (CH-10)
- Múltiplas linhas do mesmo provedor podem coexistir ativas no mesmo workspace (ex: linha Comercial e linha Suporte).
- O envio outbound **SEMPRE** exige o `channel_instance_id` explícito no comando de outbox.
- É terminantemente proibido selecionar arbitrariamente a "primeira instância ativa" ou inferir linha automaticamente.

### 3.3 Fail-Closed Policy (Sem Fallback Silencioso)
- Se o envio por WAHA falhar, o sistema **NUNCA** tentará despachar silenciosamente via Meta WABA.
- Se o envio por WABA falhar, o sistema **NUNCA** tentará despachar via WAHA.
- Falhas na linha atribuída entram no ciclo de retentativa governada daquela linha ou transitam para `dead_letter`.

### 3.4 Concorrência de Workers, Leases e Fencing Tokens
- Polling de filas executado exclusivamente com `FOR UPDATE SKIP LOCKED`.
- Cada claim gera um `lease_token` (UUID) e um `lease_until` temporizado.
- Heartbeats de trabalho renovam o lease com verificação estrita de posse.
- Se o lease expirar ou for assumido por outro worker, qualquer operação em voo é abortada imediatamente com erro de `FENCING` e não sobrescreve o banco.

### 3.5 Tratamento de Timeouts Ambíguos e Reconciliação
- Erros de rede inconclusivos (ex: `ETIMEDOUT`, `ECONNRESET`, socket hangup) **NÃO** realizam retentativa imediata cega para evitar envio duplicado de mensagens ao cliente.
- Comandos com erro ambíguo transitam imediatamente para `reconciliation_required`.
- O poller periódico de reconciliação (`reconcileBatch`) compara o comando contra `provider_delivery_events` tardios recebidos via webhook antes de marcar status final.
- Ausência de evidência/webhook **NUNCA** causa reenvio automático: o comando permanece em `reconciliation_required` até confirmação oficial ou decisão humana auditada.

#### 3.5.1 Matriz de Estados do Outbox
- **`pending`**: Comando registrado aguardando claim ou aguardando retentativa temporizada (`next_attempt_at <= clock_timestamp()`).
- **`processing`**: Reclamado por um worker com posse de lease temporizado (`lease_token`, `lease_until`). Leases expirados são recuperados exclusivamente para `reconciliation_required` por `reclaimExpiredLeases()`.
- **`sent`**: Confirmação positiva recebida do provedor e persistida atomicamente junto com `messages` e `provider_delivery_events`. Estado terminal de sucesso.
- **`failed`**: Falha transitória governada com retentativa agendada (`next_attempt_at`, `retry_count < max_retries`). **NOTA:** Não existe estado `retry` no schema PostgreSQL; retentativas usam `failed` com `next_attempt_at`.
- **`dead_letter`**: Falha definitiva (rejeição permanente do canal ou esgotamento de retentativas). Estado terminal de erro.
- **`reconciliation_required`**: Estado ambíguo (timeout de rede, queda de socket, perda de lease pós-envio, lease de processamento expirado, ou falha na persistência local pós-envio).
  - **Reconciliação Automática:** Somente transita para `sent` (se houver delivery event positivo) ou `dead_letter` (se houver evento negativo definitivo). Sem evidência conclusiva, **permanece** em `reconciliation_required` indefinidamente (zero reenvio cego).
  - **Resolução Humana Auditada:** Executada exclusivamente via `adminReconcile` / `reconcileItem`. Resolução como `sent` exige `externalMessageId` real fornecido pelo operador (proibido identificadores artificiais). Toda resolução gera registro imutável em `audit_events`.

### 3.6 Integridade Referencial Composta Multi-Tenant
- A integridade de isolamento é forçada a nível de schema pelas chaves compostas:
  - `(workspace_id, channel_instance_id) REFERENCES channel_instances(workspace_id, id)`
  - `(workspace_id, channel_instance_id, message_id) REFERENCES messages(workspace_id, channel_instance_id, id)`
  - `(workspace_id, channel_instance_id, thread_id) REFERENCES commercial_threads(workspace_id, channel_instance_id, id)`
- É impossível vincular um comando de um workspace a um canal de outro workspace.

### 3.7 Higiene de Dados, PII e Tratamento de Erros
- Telefone, mesmo mascarado, não é registrado nos logs de dispatch/worker (apenas identificadores técnicos como `commandId`, `workspaceId`, `channelInstanceId` e códigos de erro allowlisted são emitidos).
- Payloads brutos em `provider_delivery_events` são encriptados com AES-256-GCM.
- Erros persistidos em `outbound_commands.error_message` e logs utilizam exclusivamente códigos canônicos e mensagens allowlisted sanitizadas, sendo proibida a persistência de `err.message` bruto, respostas brutas de provedores, telefones, corpos de mensagem, URLs de mídia, tokens, hashes, idempotency keys ou stack traces.
- Erros de domínio (`ChannelDispatchBaseError`) implementam método `.toJSON()` que suprime a propriedade interna `cause`, impedindo vazamento de stack traces ou credenciais em APIs externas.

### 3.8 Meta Conversions API (CAPI) para Business Messaging (v26.0)
- **Governança da Graph API:** Contrato padrão `v26.0`, com allowlist restrita de versões suportadas `["v25.0", "v26.0"]`. Qualquer versão fora desse escopo gera fail-closed imediato com código canônico `CAPI_GRAPH_VERSION_INVALID`. Política preventiva de revisão a cada 60 dias documentada em `docs/architecture/META-VERSIONING.md`.
- **Segurança de Transporte & Segredos:** Token de acesso Meta transmitido **exclusivamente** via cabeçalho `Authorization: Bearer <token>`. É terminantemente proibido o envio de token via query string (`?access_token=...`). Tokens são mascarados preventivamente contra vazamentos em logs, DB e receipts (`replace(/EA[A-Za-z0-9]+/g, '[REDACTED_ACCESS_TOKEN]')`).
- **Resolução Estrita de WABA ID:** `resolveSourceWaba` requer obrigatoriamente `parsed.waba_account_id` ou `parsed.waba_id`. Phone Number ID (`row.account_id`) é categoricamente rejeitado como identificador de conta WABA CAPI, gerando `CAPI_WABA_ID_MISSING` com zero chamadas HTTP.
- **Validação Numérica de Dataset ID:** Credenciais persistidas no banco são validadas pela regex `/^\d{10,20}$/`. Prefixos legados (`pixel_*`) ou strings arbitrárias são rejeitados com `CAPI_DATASET_ID_INVALID`. Identificadores sintéticos são restritos ao modo laboratório com `endpointUrl` explícito.
- **Validação Estrita de Endpoint Sintético (SSRF Guard):** Em modo laboratório, `validateSyntheticEndpoint` exige que o `endpointUrl` utilize estritamente protocolo `http:` ou `https:`, proíba credenciais embutidas (`username:password@`) e restrinja o destino exclusivamente a interfaces de loopback locais (`localhost`, `127.0.0.1`, `::1`). Redirecionamentos HTTP 3xx são desabilitados (`redirect: "manual"`) e rejeitados imediatamente com `CAPI_SYNTHETIC_ENDPOINT_INVALID`.
- **Atribuição CTWA Ponta a Ponta e Isolamento por Conversa:** Percurso end-to-end verificado: webhook referral WABA (`referral.ctwa_clid`) -> normalizador (`metadata.ctwaClid`) -> `inbox-processor` (`commercial_journeys.ctwa_clid` + `attribution_source='ctwa_meta'`) -> `recordCommercialOutcome` -> `conversion_events.user_data.ctwaClid` -> payload CAPI despachado com isolamento multi-tenant RLS. A correlação de jornada pelo `inbox-processor` é restrita estritamente à conversa receptora (`WHERE workspace_id = $1 AND thread_id = $2`), impedindo contaminação de jornadas orgânicas do mesmo contato em outros canais/conversas.
- **Projeção de Receipt Protegido:** O receipt gravado em `conversion_events.receipt` é estritamente projetado contendo apenas `{ graph_api_version, events_received: 1, fbtrace_id }`. O array `messages` arbitrário foi eliminado.
- **Garantia Global Zero-Network:** Interceptor HTTP instalado nos testes de integração do worker bloqueia qualquer tentativa de chamada para `graph.facebook.com` ou redes externas com `FAIL_CLOSED_NETWORK_VIOLATION`. Testes executam exclusivamente contra mock servers locais (`127.0.0.1`).
- **Códigos Canônicos de Erro:** Allowlist estrita de 19 códigos canônicos (`CAPI_ERROR_CODES`), prevenindo vazamento de stack traces ou payloads externos.

### 3.9 Gateway AbacatePay & Conciliação Transacional de Pagamentos (Migração 064)
- **Topologia de Pagamentos Híbrida:**
  - Suporte concomitante para Pix BACEN EMV nativo (`pix_charges`) e cobranças via Gateway AbacatePay para links de checkout transparentes.
  - **Schema & Migração 064:** Campos de workspace (`abacatepay_api_key`, `abacatepay_webhook_secret`, `abacatepay_enabled`) e campos de rastreabilidade em `pix_charges` (`gateway_provider`, `gateway_charge_id`, `gateway_checkout_url`).
- **Segurança de Webhook & HMAC Timing-Safe:**
  - Verificação de assinatura no cabeçalho `AbacatePay-Signature` (`t=timestamp,v1=hash`) via `crypto.timingSafeEqual` com prevenção de replay attacks (janela de tolerância de 300 segundos).
  - Rotas expostas: `POST /v1/webhooks/abacatepay/:workspaceId` (escopada por tenant) e `POST /v1/webhooks/abacatepay` (resolução dinâmica por metadados de webhook).
- **Ciclo Transacional de Fechamento (`billing.paid`):**
  - Implementado em `apps/api/src/services/abacatepay.service.ts`:
    1. Transição de `pix_charges.status = 'PAID'` e timestamp `paid_at`.
    2. Transição automática de propostas comerciais associadas (`proposals.status = 'accepted'`).
    3. Registro de desfecho comercial em `commercial_outcomes`.
    4. Enriquecimento de dados fiscais via BrasilAPI (quando CPF/CNPJ presente).
    5. Disparo transacional de confirmação ao cliente via fila `outbound_commands` no WhatsApp.
- **Gestão no Cockpit Web:**
  - Painel administrativo em [PixSection.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/settings/PixSection.tsx) integrado com `api-client.ts` para configuração de credenciais, toggle ativo/inativo e cópia de webhook com 1 clique.

---

## 4. Estado de Homologação e Limites Operacionais

- **Implementado e Homologado Localmente:**
  - Persistência atômica e autoridade única via repositório transacional Outbox (`OutboundCommandRepository`).
  - Worker de despacho outbox (`OutboxDispatcher`) com claiming concorrente `FOR UPDATE SKIP LOCKED`, heartbeat de renovação de lease e fencing anti-split-brain.
  - RLS estrito fail-closed em todas as tabelas comerciais e filas.
  - Fail-closed entre canais (zero fallback entre WAHA e Meta WABA).
  - Sanitização de erros allowlisted e ausência absoluta de PII telefônica em logs operacionais.
  - Reconciliação governada de timeouts ambíguos via `provider_delivery_events`.
  - **Produção (Migração para Hostinger KVM 4 — 4 vCPUs / 16 GB RAM):**
    - Antiga VPS `179.197.72.221` descomissionada e destruída. Backups integrais preservados em `emergency_backups/`.
  - **Absorção de Dados V2 -> V3:** 100% concluída com zero data loss (dump encriptado de 23 MB validado localmente).
    - 30 Workspaces consolidados (incluindo Haven Escovaria, SOS Sales Oficial, Sora Ritual Spa, Geral e Chapecó Matriz).
    - 759 Contatos com normalização E.164 estrita.
    - 851 Conversas Comerciais (`commercial_threads`).
    - 826 Jornadas Comerciais (`commercial_journeys`) preservadas com atribuição CTWA Meta Ads.
    - 15.455 Mensagens preservadas com histórico completo e status de entrega.
    - 11 Instâncias de Canal e 6 Credenciais criptografadas via AES-256-GCM.
  - **Containers Operacionais:**
    - `chat-sales-api`: Fastify 5.12.5 (porta interna 4400, health check HTTP 200).
    - `chat-sales-worker`: Background runtime processando `channel_webhook_inbox` e `outbound_commands`.
    - `chat-sales-web`: Cockpit administrativo servido via Nginx/Caddy.
    - `sos-sales-postgres`: PostgreSQL 16 Alpine com RLS estrito e roles segregadas.
    - `sos-sales-redis`: Redis 7 Alpine com caching e rate limiting.
    - `sos-sales-waha`: WAHA Core 2026.8.1 (Chromium com sessões ativas preservadas, `default` +554988447562 em status `WORKING`).
    - `sos-sales-caddy`: Reverse proxy TLS automático gerenciando `chat.automatizaprocessos.tech`, `automacao.automatizaprocessos.tech` e `automatizaprocessos.tech`.

---

## 5. Comandos de Homologação e Verificação

- **Testes Herméticos com Banco Real:**
  ```bash
  ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test:db:run
  ```
- **Suíte de Workers (Hermética / Concorrência Segura):**
  ```bash
  pnpm --filter @sos-sales/worker exec vitest run --fileParallelism=false
  ```
- **Verificação de Tipos Monorepo:**
  ```bash
  pnpm turbo typecheck
  ```
- **Compilação Monorepo:**
  ```bash
  pnpm turbo build
  ```
- **CI Quality Gate:**
  ```bash
  ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm ci:gate
  ```

---

## 6. Integração com a Biblioteca Soberana de Workflows (n8n Brain)

A infraestrutura de automações externas da MCT LTDA está centralizada em um diretório local de workflows (fora deste monorepo, path configurado por ambiente/operador):

- **Acervo Auditado:** 13.053 JSONs brutos, 4.715 workflows n8n classificados e traduzidos em PT-BR (`00 - Catalogo/workflows-completo-4715-ptbr.csv`).
- **Top 256 Homologados:** Seleção prioritária íntegra (`workflows-256-selecionados-ptbr.csv`) com links simbólicos em `01 - Selecionados para revisao/`.
- **Engenharia Reversa de Órfãos:** 763 blueprints estruturais resgatados de fluxos com nós rompidos do repositório Zie619, minerando 512 prompts de IA e 477 snippets de JavaScript (`blueprints-engenharia-reversa-ptbr.csv`).
- **Resgate e Sanitização de Quarentena:** 18 workflows que continham credenciais esquecidas de terceiros (tokens Apify, GitLab, Perplexity, Google API e chaves privadas RSA do Meta WhatsApp Flows) foram 100% desinfetados, validados e salvos como JSONs prontos para teste na subpasta `01 - Selecionados para revisao/11 - Resgatados da Quarentena/`.
- **Fronteira Arquitetural (P0):** Workflows n8n operam como laboratório de apoio, scrapers auxiliares e esteiras de prototipagem rápida. Toda lógica comercial transacional de alta confiabilidade, mensageria CTWA, ingestão de webhooks e outbox assíncrono pertencem estritamente a este monorepo SOS Sales.

---

## 7. Motor de Inteligência Artificial Soberano (Multi-Provider & Anti-Alucinação)

### 7.1 Arquitetura Dual-Engine (`SovereignLlmClient`)
- **Provedor Padrão:** **NVIDIA NIM** via `https://integrate.api.nvidia.com/v1/chat/completions`.
  - Modelo Soberano Ativo: `nvidia/nemotron-3-super-120b-a12b` (substituição formal do `meta/llama-3.3-70b-instruct` descontinuado pela Nvidia em 26/08/2026).
  - Modelos Alternativos Homologados: `nvidia/nemotron-3.5-lightning-30b-a3b` (ultrarrápido), `nvidia/llama-3.1-nemotron-70b-instruct` (factual).
- **Provedor Alternativo:** **OpenRouter** via `https://openrouter.ai/api/v1/chat/completions`.
  - Modelos Homologados: `anthropic/claude-3.5-sonnet` (alta precisão), `google/gemini-2.5-flash`, `deepseek/deepseek-chat`.
  - Cabeçalhos de rastreabilidade obrigatórios: `HTTP-Referer: https://chat.automatizaprocessos.tech` e `X-Title: Chat Sales V3 Commercial Receptionist`.
- **Governança de Credenciais por Workspace:**
  - Colunas `ai_provider`, `ai_model`, `ai_api_key` em `public.workspaces`.
  - Resolução hierárquica fail-closed: Chave customizada do tenant -> Chave de ambiente do servidor (`NVIDIA_API_KEY` / `OPENROUTER_API_KEY`).

### 7.2 Camadas de Grounding Factual e Protocolo de Ignorância (Truth in Data)
- O prompt do agente é gerado deterministicamente pelo `buildGroundedSystemPrompt` em 4 camadas imutáveis:
  1. `<identidade_e_escopo>`: Nome, personalidade comercial e tom.
  2. `<catalogo_oficial_de_produtos>`: Injeção direta de registros `public.products` (título, descrição, preço em centavos, categoria, badge).
  3. `<regras_operacionais_e_faq>`: Horários, endereço, formas de pagamento, regras gerais e perguntas frequentes cadastradas no workspace.
  4. `<protocolo_de_ignorancia_e_transbordo>`: Proibição estrita de suposições ou dados não ancorados. Se a informação solicitada pelo cliente não estiver no contexto, a IA emite a tag canônica `[TRANSBORDO_HUMANO: motivo estruturado]`.
- O parser `parseAiResponse` extrai o texto limpo para o cliente e detecta automaticamente a intenção de transbordo, gravando `handoff_reason` e `handoff_at` na thread.

### 7.3 Memória do Anúncio Meta (CTWA Hook Memory)
- Eventos de entrada oriundos de Meta Ads (Click-to-WhatsApp) têm seus dados de anúncio (`headline`, `body`) extraídos em `inbox-processor` e persistidos em `commercial_journeys.ad_headline` e `ad_body`.
- A camada `<origem_do_lead_anuncio_meta>` injeta o gancho original no contexto do agente, permitindo que a IA receba o lead alinhada com a oferta de anúncio específica que gerou o clique.

### 7.4 Briefing no Cockpit e Simulador Dry-Run
- **Cockpit Visual:**
  - Mensagens da IA sinalizadas com badge `🤖 {agentName} (IA)`.
  - Status `waiting_human` exibe card de briefing executivo com o motivo exato registrado pelo modelo e botão `[Assumir Conversa]`.
- **Simulador Interativo:**
  - Endpoint seguro `POST /v1/workspaces/:workspaceId/ai-agent/simulate`.
  - Playground no frontend (`Configurações > IA`) com métricas ao vivo: latência em ms, produtos catalogados, validação de transbordo e visualização do balão de chat.

---

## 8. PIPELINE SOBERANO DE MÍDIA MULTIMODAL (ÁUDIO, VÍDEO, FOTOS E DOCUMENTOS)

### 8.1 Ingestão e Normalização Agnóstica de Provedores
- **Normalização WAHA (`WahaWebhookNormalizer`):**
  - Processa tanto eventos `message` quanto `message.any`.
  - Resolução de identidades WhatsApp LID (`@lid`) mapeando `_data.Info.SenderAlt` para o telefone real E.164.
  - Inbound seguro: quando `payload.to` for nulo, resolve deterministicamente via `rawPayload.me.id` ou `me.jid`.
  - Detecção estrita de `contentType`: áudios de voz PTT (`.oga`, `.opus`, `audio/ogg`), vídeos QuickTime/MP4 (`.qt`, `.mp4`), documentos (`.pdf`, `.docx`) e imagens (`.jpeg`, `.png`, `.webp`).

### 8.2 Proxy de Streaming Seguro e Isolamento de Rede (`/media/proxy`)
- **Arquitetura de Isolamento:** Os contêineres de engine (WAHA na porta 3000 interna) rodam isolados na rede Docker fechada e exigem chaves mestras (`x-api-key`). O navegador do cliente não tem acesso direto a essas portas internas nem pode injetar cabeçalhos em tags HTML `<audio>`, `<img>` ou `<video>`.
- **Rota Unificada:** `GET /v1/workspaces/:workspaceId/media/proxy`
  - Suporta `wahaPath` (para arquivos internos do WAHA) e `mediaId` (para Meta Graph API).
  - Autenticação via header `Authorization: Bearer` ou query parameter `?token=` (validada pelo `auth.plugin.ts`).
  - Suporte a cabeçalhos `Range: bytes` para busca/seek instantâneo de áudio e vídeo nos players nativos.
  - Forwarding fiel de `Content-Type`, `Content-Length`, `Content-Range` e cache imutável `Cache-Control: public, max-age=86400, immutable`.
- **Cockpit (`MessageBubble.tsx`):**
  - Reescreve dinamicamente URLs legadas internas (`waha:3000/api/files/...`) para a rota autenticada `/media/proxy`.
  - Renderização nativa: Player de áudio HTML5 com microfone e controle de reprodução, player de vídeo com controles e aspect ratio contido, card de documento com botão de download seguro e visualizador de imagem responsivo.

---

## 9. AUTENTICAÇÃO SOBERANA & GESTÃO DE EQUIPE MULTI-TENANT (MCT OS v2.0)

### 9.1 Motor Criptográfico Nativo (Scrypt)
- Implementado em `@sos-sales/auth` (`password-hasher.ts`):
  - Formato serializado canônico: `scrypt:<salt_hex>:<hash_hex>`.
  - Salt criptográfico pseudo-randômico de 16 bytes (`crypto.randomBytes`).
  - Comparação estrita com tempo constante (`crypto.timingSafeEqual`) eliminando timing-attacks.
  - Zero dependência externa de pacotes compilados (100% biblioteca padrão `node:crypto`).

### 9.2 Endpoints de Autenticação e Multi-Tenancy
- `POST /v1/auth/login`:
  - Recebe `{ email, password, workspaceId? }`.
  - Busca usuário por `LOWER(email)` e valida senha via `verifyPassword`.
  - Resolve workspaces do usuário via função `SECURITY DEFINER` `getUserWorkspaces(user.id)`.
  - Emite token JWT de 7 dias com payload assinado (`sub: user.id`, `email`, `role`, `workspace_id`).
- `POST /v1/auth/switch-workspace`:
  - Recebe `{ workspaceId }`.
  - Valida se o usuário autenticado possui vínculo ativo naquele tenant.
  - Emite novo JWT com escopo atualizado sem exigir reautenticação de senha.

### 9.3 Gestão de Equipe & Acessos por Workspace
- Rotas governadas sob isolamento RLS estrito:
  - `GET /v1/workspaces/:workspaceId/members`: Lista membros do tenant ativo.
  - `POST /v1/workspaces/:workspaceId/members`: Convida/cria membro com papel (`admin`, `manager`, `operator`) e senha inicial criptografada.
  - `PATCH /v1/workspaces/:workspaceId/members/:memberId`: Altera cargo e/ou redefine senha.
  - `DELETE /v1/workspaces/:workspaceId/members/:memberId`: Remove membro (com guarda contra exclusão do proprietário ou auto-exclusão).
- **Cockpit Comercial (`SettingsPage.tsx` -> `TeamSection.tsx`):**
  - Aba "Equipe & Acessos" com listagem visual de membros, badges de permissão, modal de cadastro com geração e cópia de senha em um clique, edição de perfil e confirmação de remoção.

---

## 10. BLINDAGEM OPERACIONAL SAAS & DISASTER RECOVERY (MCT OS v2.0)

### 10.1 Perímetro de Segurança & WAF (`SecurityShield`)
- Implementado em `apps/api/src/services/security-shield.ts` e ativado no hook `onRequest`:
  - **WAF & Anti-Scanner:** Intercepta ferramentas ofensivas automatizadas (`sqlmap`, `nikto`, `masscan`, `dirbuster`, `nmap`) e sondagens de arquivos sensíveis (`/.env`, `/wp-login.php`, `/.git`, `/dump.sql`, path traversal `../`).
  - **IP Auto-Jail:** Bloqueia imediatamente o IP do atacante por 15 minutos via chave volátil atômica no Redis (`sos:shield:jail:<ip>`), respondendo com `HTTP 403 Forbidden` e `Retry-After: 900`.
  - **Anti-Brute-Force & Credential Stuffing:** Teto de 10 tentativas de login por minuto por IP e travamento de segurança da conta alvo após 5 falhas consecutivas de senha por 5 minutos.
  - **Mitigação de Timing Attack / User Enumeration:** Execução de scrypt dummy em e-mails inexistentes para equiparar a latência de resposta a contas existentes.
  - **Rate Limiting Global:** Cota de 120 requisições por minuto por IP em todos os endpoints `/v1/*` com injeção de cabeçalhos RFC 6585 (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`).
  - **Cabeçalhos OWASP:** Injetados em todas as respostas pelo Fastify e Caddy (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, e supressão do header `Server`).

### 10.2 Motor de Backup & Recuperação de Desastres (RTO < 20 min / RPO < 24 h)
- **Rotina Diária (`scripts/backup-database.sh`):**
  - Executado diariamente às 03:00 AM via crontab do host.
  - Executa `pg_dump` transacional do banco `sos_sales_v3` com o superuser `sos_user` (Bypass RLS habilitado).
  - Compactação máxima `gzip -9` e encriptação simétrica militar AES-256-CBC com derivação PBKDF2 (`openssl`).
  - Teste de integridade em memória do fluxo descriptografado antes de confirmar a gravação.
  - Rotação automática retendo os últimos 7 dias em `/opt/sos-sales/backups/daily/`.
- **Restauração Assistida (`scripts/restore-database.sh`):**
  - Decodificação, teste de senha e injeção controlada de dump com trava de confirmação contra sobrescrita acidental.

### 10.3 Watchdog de Auto-Cura & Higiene de Recursos
- **Sentinela (`scripts/healthcheck-watchdog.sh`):**
  - Executado a cada 5 minutos via crontab do host.
  - Monitora `https://chat.automatizaprocessos.tech/ready` (validando conectividade de aplicação, banco Postgres e Redis).
  - Auto-cura: em caso de 3 falhas consecutivas de probe, reinicia o container `chat-sales-api` automaticamente e registra log com timestamp em `/var/log/chat-sales-watchdog.log`.
  - Alerta de capacidade: emite alerta crítico se o disco ultrapassar 85% de uso.
- **Higiene de Disco e Logs:**
  - Limite de logs em `docker-compose.prod.yml` fixado em `max-size: 20m` e `max-file: 3`.
  - Limpeza semanal de cache de compilação do Docker aos domingos às 04:00 AM (`docker builder prune -f --filter "until=168h"`).

---

## 11. MOTOR DE DISPAROS EM MASSA, IMPORTADOR INTELIGENTE & FECHAMENTO PIX NA IA

### 11.1 Importador de Planilhas & Sanitização E.164 Determinística
- **Componente:** `BroadcastTemplateDialog.tsx`
  - Suporte completo a planilhas `.csv`, `.xlsx` e `.xls` processadas client-side via biblioteca `xlsx`.
  - Auto-detecção de colunas de telefone (`telefone`, `celular`, `phone`, `whatsapp`, `contato`) e nome (`nome`, `name`, `cliente`, `contato`).
  - Fallback resiliente: caso o cabeçalho seja atípico, realiza varredura celular por expressão regular de dígitos telefônicos.
  - Sanitizador `sanitizeBrazilianPhoneE164`:
    - Remove caracteres não numéricos.
    - Lida com prefixos nacionais (`55`) e discagem com zero (`049...`).
    - Validação de DDDs válidos brasileiros (11 a 99).
    - Inserção transparente do 9º dígito em números legados de 8 dígitos (`XX9XXXXXXXX`).
    - Rejeição e descarte determinístico de números fixos (`+55XX[2-5]...`) e comprimentos inválidos.
  - Painel de auditoria visual pré-envio exibindo contadores de **Válidos**, **Duplicados** e **Descartados**, com tabela de amostra dos primeiros 10 contatos.
- **Inserção Segura no Backend:**
  - `POST /v1/workspaces/:workspaceId/broadcasts` com `audience.type: "IMPORT_LIST"` e lista `importedContacts: Array<{ phoneE164, name? }>`.
  - Inserção não-destrutiva via repositório `createOrGetContact` com `ON CONFLICT (workspace_id, phone_e164) DO UPDATE`, preservando integridade referencial, histórico de conversas e threads já existentes.

### 11.2 Segmentação de Audiência Dinâmica & Smart Filters (`SMART_FILTER`)
- **Filtros Nativos SQL sob RLS:**
  - `NON_BUYERS`: Localiza contatos cadastrados que não possuem jornadas com estágio `won` e categoricamente não possuem cobranças Pix com status `PAID` em `public.pix_charges` (`Truth in Data`).
  - `PIX_ABANDONED`: Localiza contatos com cobranças Pix expiradas ou pendentes (`status IN ('EXPIRED', 'PENDING')`) que nunca tiveram uma cobrança Pix paga (`status = 'PAID'`), viabilizando réguas automáticas de recuperação de carrinhos e cobranças abandonadas.
  - `INACTIVE_30_DAYS`: Contatos sem atividade de mensagem (`messages`) ou proposta comercial nos últimos 30 dias.
  - `CTWA_RESCUE`: Contatos originados de campanhas pagas do Meta Ads (`commercial_journeys.ad_headline IS NOT NULL` ou origem CTWA) que não converteram em vendas pagas.
- **Endpoint de Contagem ao Vivo:**
  - `GET /v1/workspaces/:workspaceId/broadcasts/audience-count`:
  - Aceita query params `type`, `smartFilter`, `stage` e retorna `{ success: true, count: number }` de forma ultra-rápida, alimentando badges dinâmicos no modal antes do operador clicar em disparar.

### 11.3 Fechamento Automático de Ofertas com Pix na IA (`<fechamento_comercial_pix>`)
- **Camada no Prompt Grounding (`ai-grounding-prompt.builder.ts`):**
  - Instrução explícita para o modelo: ao reconhecer intenção de compra ou aceitação de oferta ("quero", "manda o pix", "fechado"), responder confirmando o pedido e emitir a tag técnica `[OFFER_PIX: <productId>]`.
  - O modelo é estritamente proibido de inventar chaves ou códigos Pix no texto (Truth in Data).
- **Extração e Desacoplamento de Tags (`parseAiResponse`):**
  - Regex aprimorada `/\[(?:OFFER_PIX|GERAR_PIX):\s*([^\]]+)\]/i` extrai o identificador do produto e higieniza o texto que vai para o WhatsApp do cliente.
- **Emissão Transacional no Worker (`ai-receptionist.processor.ts`):**
  - Busca o produto correspondente no catálogo homologado `public.products`.
  - Chama `createPixCharge` do `@sos-sales/database` passando `workspaceId`, `threadId`, `contactId`, `productId`, `title`, `amountCents` e validade de 30 minutos.
  - Consulta a chave Pix padrão do workspace (`workspaces.default_pix_key`) e gera o payload oficial BACEN EMV Copia e Cola com cálculo de CRC16-CCITT.
  - Anexa o snippet formatado com código monoespaçado na mensagem que é enfileirada no Outbox transacional (`commercial_outbox_queue`).
  - Fallback gracioso com log de auditoria: caso o workspace não possua chave cadastrada, a mensagem conversacional da IA segue normalmente para o cliente sem interromper a thread.

### 11.4 Conciliação Pix em Tempo Real, Recibo Automático no WhatsApp & Cockpit Cashier
- **Serviço de Notificação Transacional (`pix-notification.ts`):**
  - Ao liquidar uma cobrança Pix (tanto na conferência manual de caixa quanto no webhook bancário via PSP), a função `enqueuePixConfirmationMessage` localiza a instância do canal e o telefone do contato e insere atomicamente:
    1. Uma mensagem outbound formatada no WhatsApp (`🎉 *PAGAMENTO CONFIRMADO!* ...`) em `public.messages` com `metadata.source = 'pix_confirmation'` e `chargeId`.
    2. Um comando no Outbox transacional (`public.outbound_commands`) com status `'pending'` e chave de idempotência `pix-confirm-${charge.id}`.
- **Cockpit Cashier & Histórico de Cobranças (`PixDrawer.tsx`):**
  - Navegação entre "Cobranças da Conversa" e "Nova Cobrança" com `SegmentedControl`.
  - Visualização em tempo real das cobranças geradas para o contato com badges de status (`PENDING`, `PAID`, `EXPIRED`), valor formatado e data/hora.
  - Ação de Caixa de 1 clique: botão "Confirmar Recebimento (Caixa)" para cobranças pendentes, chamando `POST /v1/workspaces/:workspaceId/pix-charges/:chargeId/confirm-payment`, atualizando o status na interface e disparando o recibo no WhatsApp.
  - Copiar Chave Copia e Cola e visualizador de QR Code sob demanda.
- **Identificação Visual na Mensagem (`MessageBubble.tsx`):**
  - Mensagens com `metadata.source === 'pix_confirmation'` são renderizadas com destaque esmeralda e badge "🎉 Recibo Pix Confirmado".
  - Mensagens geradas com cobrança Pix exibem badge informativo "⚡ Cobrança Pix Gerada".

### 11.5 Atribuição de Vendas Pix em Campanhas, Funil Comercial & Campeã A/B
- **Agregação e Atribuição Financeira em Tempo Real (`broadcasts.routes.ts`):**
  - `GET /v1/workspaces/:workspaceId/broadcasts/campaigns`:
  - Cruza `broadcast_recipients` com `public.pix_charges` (`WHERE pc.status = 'PAID' AND pc.paid_at >= r.sent_at`), apurando metricas por campanha e por variante:
    - `pix_sales_count`: Quantidade de vendas Pix convertidas pelo disparo.
    - `pix_sales_cents`: Faturamento monetário total atribuído à campanha.
    - `conversionRate`: Taxa de conversão percentual de vendas sobre destinatários alcançados.
    - `averageTicketCents`: Ticket médio real das conversões.
- **Determinação de Variante Vencedora A/B por Receita Comercial:**
  - A variante que obtiver maior receita (`salesCents`) é coroada vencedora com o selo `🏆 Campeã Comercial`.
  - Em caso de empate de faturamento, o desempate segue determinístico por taxa de conversão (`conversionRate`), respostas (`replyCount`) e aberturas (`readCount`).
- **Índices de Performance Criados (`035_broadcast_sales_attribution_indexes.sql`):**
  - `idx_broadcast_recipients_contact_camp`: `(contact_id, campaign_id, sent_at)` sob `sos_sales_v3`.
  - `idx_pix_charges_contact_paid`: `(contact_id, status, paid_at)` parcial para status `'PAID'`.
- **Telemetria no Frontend (`CampaignsList.tsx`):**
  - KPI de topo: "Faturamento Pix" com valor monetário em R$ e badge de volume de vendas.
  - Funil de Conversão: 6ª etapa "6. Vendas Pix" com percentual de conversão e badge de volume.
  - Comparativo A/B Lado a Lado: Exibição de Faturamento Pix, Vendas e Taxa por variante com badge `🏆 Campeã Comercial`.

---

## 12. ARQUITETURA META WAME 2026, OTIMIZADOR DE CUSTOS WABA & WYSIWYG WHATSAPP

### 12.1 Arquitetura WAME (WhatsApp Account Model Evolution — Migration 029)
- **Desacoplamento de Ativos no Meta Business Portfolio:**
  - Migração de WABA IDs monolíticos para o modelo WAME:
    - `channel_instances.waac_id`: Identificador do contêiner WhatsApp Assets & Accounts.
    - `channel_instances.pma_id`: Phone Number Management Asset, desacoplando o número como um ativo portável entre Business Portfolios sem perda de qualidade ou aprovação de templates.
    - `channel_instances.business_portfolio_id`: Identificador corporativo da organização dona do ativo.
- **Identidade Privada por BSUID (Business-Scoped User ID) & Usernames:**
  - Alteração na tabela `public.contacts`: `phone_e164` torna-se `nullable`.
  - Restrição `chk_contacts_identity` garantindo pelo menos uma âncora de identidade: `phone_e164 IS NOT NULL OR bsuid IS NOT NULL OR username IS NOT NULL`.
  - Índices parciais únicos por workspace: `uq_contacts_workspace_bsuid` e `uq_contacts_workspace_username`.
  - No `waba-normalizer.ts` e `inbox-processor.ts`, resolução idempotente com `ON CONFLICT (workspace_id, bsuid)` ou `ON CONFLICT (workspace_id, phone_e164)`.
- **Janela FEP 7-Day Window (168 Horas — Free Entry Point):**
  - Campanhas originadas por Click-to-WhatsApp Ads (`ctwa_meta`) recebem isenção integral de tarifas de conversação da Meta por 168 horas completas.
  - `commercial_journeys.fep_expires_at = clock_timestamp() + INTERVAL '7 days'`.
  - Visualização em tempo real no cockpit (`ConversationHeader.tsx`) com badge informativo de dias restantes de CTWA Grátis.
- **Deep Linking Soberano `wa.me` (`ChannelsSection.tsx`):**
  - Geração e cópia de URLs canônicas `https://wa.me/<e164>?text=<pre-filled-intent>` com sanitização de caracteres e acionamento nativo em mobile ou desktop sem exigir cadastro prévio do número na agenda do lead.

### 12.2 Otimizador de Custos WABA ("Cavalo de Troia da Utilidade")
- **Engenharia de Economia Tarifária (~85% a 90% de Desconto):**
  - Tarifação Meta: Mensagens de Marketing custam ~R$ 0,38 por conversa, enquanto Utilidade custa ~R$ 0,04.
  - Estratégia `UTILITY_TROJAN` injetada no gerador de IA (`templates.routes.ts`):
    - Redige mensagens no formato de notificação de conta, confirmação ou atualização operacional ("Atualização de Proposta", "Crédito Pendente", "Encaixe Prioritário").
    - Aprovação algorítmica garantida na categoria `UTILITY`.
    - Ao ser entregue e respondida pelo cliente, abre a Janela de Atendimento Gratuito (Service Window de 24 horas), permitindo que a IA converse, qualifique e envie ofertas de vendas sem custos adicionais de marketing.
- **Presets de Alta Conversão:**
  - `CreateTemplateDialog.tsx` expõe seletor explícito de estratégia com badge de 85% de economia e 3 modelos mestres MCT pré-configurados.

### 12.3 Pré-visualização WYSIWYG Realista e Mapeamento Automático
- **Interface Realista do WhatsApp (`BroadcastTemplateDialog.tsx`):**
  - Card de pré-visualização fiel com simulação do contato "Francisco", bolha verde de mensagem com horário de entrega, tiques duplos e renderização de botões interativos (Quick Reply e Call to Action).
  - Indicador de economia e badge da categoria do template (Utilidade vs Marketing).
- **Mapeamento de Variáveis Sem Fricção:**
  - Auto-detecção de `{{1}}` para o primeiro nome do lead com card verde de auto-mapeamento: `[👤 Nome do Contato (Automático) • Auto 100%]`.
  - Disparo de broadcast em lote (`broadcasts.routes.ts`) monta ordenadamente os `bodyParameters` da Meta Cloud API com fallback gracioso para o primeiro nome sanitizado.
- **Cobertura de Testes Automatizados:**
  - 35/35 testes unitários validados no Vitest (`phone-and-spreadsheet-sanitizer.test.ts`), cobrindo sanitização telefônica brasileira, parsing de planilhas e integridade de variáveis.

---

## 13. HARDENING ANTI-BAN, INTEGRAÇÕES EXTERNAS & COMMAND PALETTE (ITERATION 2.7)

### 13.1 Interceptador Anti-Ban de Opt-Out (`InboxProcessor`)
- **Conformidade Estrita com LGPD e Políticas Meta WhatsApp:**
  - Detecção nativa em `apps/worker/src/processors/inbox-processor.ts` de intenções de cancelamento ou saída através de regex normalizado: `\b(sair|pare|parar|stop|cancelar|descadastrar|remover|nao quero|não quero)\b`.
  - Ao detectar o opt-out:
    - O contato é imediatamente marcado com `opt_out = true` no banco.
    - Comandos de saída pendentes ou agendados para este contato no outbox são abortados.
    - A IA recepcionista e os disparos em lote (`broadcasts`) ignoram o lead estritamente, prevenindo denúncias de spam ou bloqueios de chip/WABA.
  - Cobertura de testes unitários herméticos em `apps/worker/src/__tests__/opt-out-detection.test.ts`.

### 13.2 Adaptador de Webhook PSP Cakto (`cakto-webhook.routes.ts`)
- **Baixa Automática e Conciliação Multicanal:**
  - Endpoint público autenticado `/v1/webhooks/cakto` no Fastify Ingress (`apps/api/src/routes/cakto-webhook.routes.ts`).
  - Suporte a eventos de status: `purchase_approved`, `pix_generated`, `refund_approved`, `chargeback`.
  - Tratamento transacional sob RLS com idempotência por `transaction_id`:
    - Baixa automática de propostas comerciais (`commercial_proposals`) associadas ao lead.
    - Atualização do estágio na jornada comercial para `WON` e transição do funil.
    - Notificação em tempo real no WhatsApp com confirmação do pagamento e envio de recibo.

### 13.3 Pipeline de Transcrição Whisper STT (`whisper-transcriber.ts`)
- **Ingestão Transparente de Áudios de WhatsApp:**
  - Módulo soberano em `apps/worker/src/services/whisper-transcriber.ts`.
  - Ao receber mensagem com `mediaType === 'audio'` ou `ptt === true` (áudio de voz do WhatsApp via WAHA ou Meta WABA):
    - O worker faz o download seguro via SSRF-shield.
    - Transcreve o áudio para texto em português via OpenAI Whisper API (`model: whisper-1`).
    - O texto transcrito é injetado no corpo da mensagem da conversa e repassado ao `AiReceptionistProcessor`.
    - A IA responde contextualizada com o áudio falado pelo lead sem qualquer fricção operacional.

### 13.4 Command Palette Global Soberana (`⌘K` / `Ctrl+K`)
- **Navegação & Busca Unificada em Tempo Real (`CommandPalette.tsx`):**
  - Componente de design system em `packages/ui/src/components/CommandPalette/CommandPalette.tsx`.
  - Atalho global `⌘K` (Mac) e `Ctrl+K` (Linux/Windows) integrado no `AppShell` e `Header.tsx`.
  - Busca federada no cliente com indexação de:
    - **Contatos & Conversas Recentes:** Busca por nome, telefone e última mensagem.
    - **Campanhas de Disparo:** Acesso imediato às métricas e histórico.
    - **Catálogo de Produtos & Ofertas:** Busca instantânea por título e preço formatado.
    - **Navegação Rápida:** Troca entre módulos (Cockpit, Broadcasts, Catálogo, Radar, Configurações).
    - **Filtros Rápidos do Cockpit:** Atalhos para "Aguardando Humano", "Não Lidas" e "Novos Leads".
  - Testes unitários com renderização e acessibilidade em `packages/ui/src/__tests__/command-palette.test.tsx`.

### 13.5 Onboarding Concierge & Provisionamento 1-Clique de Novas Empresas (`POST /v1/workspaces` & `CreateWorkspaceModal.tsx`)
- **Endpoint Transacional de Provisionamento (`POST /v1/workspaces`):**
  - Protegido por autenticação JWT e verificação de privilégio RBAC (`role: 'owner'`).
  - Execução transacional atômica no PostgreSQL 16:
    - Criação de organização com slug derivado e saneado.
    - Criação de workspace com fuso horário `America/Sao_Paulo`, moeda `BRL` e isolamento RLS ativo.
    - Hashing de senha forte via `hashPassword()` (scrypt nativo com salt criptográfico).
    - Criação/vínculo do novo usuário proprietário (`role: 'owner'`).
    - Vínculo automático do operador administrador (Francisco) também como `owner` na nova empresa, permitindo alternância instantânea de contexto no cockpit para suporte operacional concierge.
- **Interface Visual de Provisionamento (`CreateWorkspaceModal.tsx`):**
  - Modal integrado ao `AppShell` da interface web, disparado pelo botão `+ Criar Nova Empresa` no seletor de organizações do header e pelo atalho do Command Palette (`⌘K`).
  - Formulário com campos: Nome da Empresa, Nome do Responsável, E-mail do Administrador e Senha Inicial (com gerador de senha aleatória segura em 1 clique).
  - Tela de sucesso com:
    - Bloco de mensagem de boas-vindas pré-formatada para WhatsApp pronta para envio em 1 clique com URL de acesso, login e senha.
    - Botão de comutação imediata ("Entrar nesta Empresa Agora"), trocando o workspace ativo no `localStorage` e recarregando o cockpit.
  - Cobertura de testes unitários em `apps/web/src/__tests__/create-workspace-modal.test.tsx`.

### 13.6 Auto-Heal de Sessões WAHA, Resiliência de Layouts no Cockpit & Topologia Dual-Push Git (11 de outubro de 2026)
- **Auto-Heal e Pré-validação de Sessão WAHA (`channels.routes.ts`):**
  - Rota `POST /v1/workspaces/:workspaceId/channels/:channelId/sync` aprimorada para verificar o estado da sessão no motor WAHA (`/api/sessions/:session`) antes de chamar a sincronização de conversas.
  - Se a sessão estiver `STOPPED`, o backend dispara tentativa de inicialização automática (`/api/sessions/start`). Se a sessão demandar pareamento por QR Code (`SCAN_QR_CODE`), o canal é marcado como `pairing` e o backend retorna status amigável, prevenindo exceções brutas `502 Bad Gateway / 422 Unprocessable Entity`.
  - Mapeamento das instâncias soberanas ativas no PostgreSQL 16:
    - SOS Sales (`11111111-1111-1111-1111-111111111111`): Sessão `plx-documentos` (`+554988447562`, 216 threads, 7.141 mensagens).
    - Haven Escovaria (`22222222-2222-2222-2222-222222222222`): Sessão `haven` (`+554988370054`, 671 threads, 9.527 mensagens).
- **Contenção Estrita de Layout no Cockpit & Design System:**
  - `ConversationRow` / `ListItem`: `renderWhatsappMarkdown` recebeu opção `{ singleLine: true }` convertendo quebras de linha (`\n`) em espaços contínuos no snippet, com `overflow: hidden` e `text-overflow: ellipsis`, eliminando encavalamento vertical de mensagens sobre contatos vizinhos no Inbox.
  - `ChannelsSection`: Reestruturação completa do card de canais em layout de 2 linhas (topo: ícone fixo 38x38px com metadados do canal; rodapé: barra de ações com linha divisória sutil e `flex-wrap`), garantindo que até 5 botões de ação não espremam o título do canal.
  - Seletor Multi-Canal no Inbox (`InboxList.tsx` / `useInbox.ts`): Filtro de canais dinâmico no cabeçalho do Inbox (`Todos os Canais` ou canal específico), eliminando a badge estática `META_WABA` quando conversas de instâncias WAHA estão sendo navegadas.
- **Topologia de Repositórios Git (Dual-Push Soberano):**
  - Configuração do controle de versão local com `git remote set-url --add --push origin` para atualizar simultaneamente `https://github.com/franciscotaveira/CHATSALES.git` e `https://github.com/franciscotaveira/SOS-SALES.git`.

### 13.7 Infraestrutura Soberana: Migração Hostinger KVM 4, Ilhas Isoladas e Automação DNS API (20 de outubro de 2026)
- **Migração Turnkey para Hostinger Cloud KVM 4 (`200.141.17.99` — Campinas/SP):**
  - Hardware: 4 vCPUs AMD EPYC, 16 GB RAM, 200 GB NVMe, swapfile de 4 GB ativado contra OOM.
  - Perímetro defensivo UFW: `default deny incoming`, apenas portas 22 (SSH), 80 (HTTP) e 443 (HTTPS) abertas no host. Portas de banco e Redis com zero exposição pública.
  - Preservação total de dados (Truth in Data):
    - Base Chat Sales V3: 16.692 mensagens, 891 threads, 841 contatos, 30 workspaces restaurados com integridade RLS via backup criptografado AES-256.
    - Base PLX n8n: 148 tabelas restauradas em container dedicado (`plx-n8n-db`).
    - Base LUMA OS: Inicializada e auditada em container dedicado (`luma-db`).
- **Arquitetura Definitiva de 3 Ilhas Segregadas com Borda Unificada:**
  - **Ilha 1 (Chat Sales V3):** Diretório `/opt/chat-sales-v3/`, rede `sos-sales-network` contendo `chat-sales-web` (Nginx), `chat-sales-api` (Fastify 5), `chat-sales-worker`, `sos-sales-postgres`, `sos-sales-redis` e `sos-sales-waha` (limite 7.5 GB RAM).
  - **Ilha 2 (PLX Automações):** Diretório `/opt/plx-documentos/`, rede `plx-network` contendo `n8n` (v2.43.8) e `plx-n8n-db` (limite 4.0 GB RAM).
  - **Ilha 3 (LUMA OS):** Diretório `/opt/luma-os/`, rede `luma-network` contendo `luma-app` (Fastify/Node.js) e `luma-db` (Postgres 16) (limite 2.0 GB RAM).
  - **Borda Unificada:** Container `sos-sales-caddy` conectado simultaneamente às 3 redes (`sos-sales-network`, `plx-network`, `luma-network`), gerenciando TLS automático Let's Encrypt para todos os domínios.
- **Domínios Oficiais e Automação via Hostinger DNS API:**
  - Domínio soberano unificado: **`automatizaprocessos.tech`**.
  - Registros A e AAAA ativos na API REST da Hostinger (`https://developers.hostinger.com/api/dns/v1/zones/automatizaprocessos.tech`):
    - `chat.automatizaprocessos.tech` -> A `200.141.17.99`, AAAA `2a02:4780:6e:c5ee::1`
    - `automacao.automatizaprocessos.tech` -> A `200.141.17.99`, AAAA `2a02:4780:6e:c5ee::1`
    - `luma.automatizaprocessos.tech` -> A `200.141.17.99`, AAAA `2a02:4780:6e:c5ee::1`
    - `@` (`automatizaprocessos.tech`) -> A `200.141.17.99`, AAAA `2a02:4780:6e:c5ee::1`
    - `www.automatizaprocessos.tech` -> CNAME `automatizaprocessos.tech.`
  - Certificados SSL/TLS emitidos com sucesso e em operação ativa com HTTP/2 (auditados com retorno `HTTP/2 200` em todos os endpoints).
- **Governança Operacional Anti-Tampering & Ferramental de Migração 1-Click (P0):**
  - Guardrails e regras invioláveis instalados no host em `/root/SOVEREIGN_VPS_RULES.md`, `/root/README_IA.md`, `/etc/motd`, `/opt/README.md` e no monorepo em `docs/architecture/SOVEREIGN_VPS_OPERATING_MANUAL.md`.
  - Comandos globais utilitários em `/usr/local/bin/`: `vps-status`, `vps-backup`, `chat-sales-restart`, `plx-restart`, `luma-restart`, `caddy-reload`.
  - **1-Click Island Migration Protocol (`export-island`):** Ferramenta utilitária no host (`export-island <chat-sales|plx|luma>`) que gera snapshot atômico (dump Postgres + `.env` + compose + auto-installer `setup-new-vps.sh`) para migração instantânea para VPS própria quando qualquer ilha atingir maturidade e breakeven financeiro.
  - Crontab de produção com backup diário automático (03:00 AM) com criptografia AES-256 e sentinela watchdog a cada 5 minutos.


