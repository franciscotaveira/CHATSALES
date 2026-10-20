# SOS Vendas — Sistema Operacional Comercial para WhatsApp & Pix

> Sistema Operacional Comercial Greenfield com Migração Segura (MCT OS v2.0)  
> Titularidade: Francisco Taveira Rios | MCT LTDA  
> Data: Outubro de 2026

---

## 1. Visão Geral

O **SOS Vendas** fecha o ciclo comercial de ponta a ponta:
`Aquisição Meta Ads / CTWA / Lead Ads → Atendimento Cockpit (WhatsApp Dual Engine: WABA + WAHA) → Qualificação & Funil/Agenda → Cobrança Pix Nativa (AbacatePay) → Fechamento com Prova → Feedback CAPI com Recibo`.

### Decisões Arquiteturais Fundamentais (ADRs)
- [ADR-001: Fronteira e Escopo Fechado do MVP](docs/adr/ADR-001-mvp-frontier.md)
- [ADR-002: Estratégia de Autenticação e RLS Multi-Tenant](docs/adr/ADR-002-auth-strategy.md)
- [ADR-003: Armazenamento e Ciclo de Vida de Segredos](docs/adr/ADR-003-secrets-lifecycle.md)
- [ADR-004: Migração e Coexistência V2/V3 (Strangler Fig)](docs/adr/ADR-004-migration-coexistence.md)

---

## 2. Portas do Ambiente Local / Docker Lab

| Serviço | Porta | Descrição |
|---|---:|---|
| **Web App** | `3400` | React 19 + Vite + Vanilla CSS tokens |
| **API Backend** | `4400` | Fastify 5 + Zod + OpenAPI |
| **PostgreSQL 16** | `55440` | Banco relacional com RLS por tenant (`sos_v3_pgdata`) |
| **Redis 7** | `6389` | Fila BullMQ & cache (`sos_v3_redisdata`) |

---

## 3. Comandos Rápidos

```bash
# 1. Instalar dependências
pnpm install

# 2. Executar build de todos os pacotes e apps
pnpm run build

# 3. Validar tipagem TypeScript strict
pnpm run typecheck

# 4. Iniciar ambiente Docker Lab
docker compose up -d

# 5. Iniciar serviços em modo de desenvolvimento local
pnpm run dev
```

---

## 4. Estrutura do Monorepo

```text
CHAT-SALES/
├── apps/
│   ├── api/                 # Fastify 5: Liveness (/health), Readiness (/ready), Rotas Zod
│   ├── worker/              # BullMQ: Inbound, Outbound e CAPI Dispatcher
│   └── web/                 # React 19 + Vite: Design system e Cockpit
├── packages/
│   ├── contracts/           # Schemas Zod, tipos de eventos e DTOs
│   ├── domain/              # Entidades puras, Value Objects e Regras
│   ├── application/         # Casos de uso e Interfaces (Ports)
│   ├── database/            # Client PostgreSQL, migrations SQL e RLS
│   └── observability/       # Pino logger com redaction de segredos
├── docs/
│   ├── adr/                 # ADR-001 a ADR-004 formalizados
│   └── tools/               # Catálogo e Manual de Ferramentas (Diataxis)
└── docker-compose.yml       # Docker Lab hermético isolado
```

---

## 5. Documentação de Ferramentas & Motores (Diataxis)

Acesse o manual completo e auditado de ferramentas:
- 📖 **[Catálogo de Ferramentas Soberanas](docs/tools/README.md)**
  - 🚀 [Tutorial: Do Zero à Primeira Venda](docs/tools/tutorial-tools-quickstart.md)
  - 🛠️ [How-To: Guias Práticos de Operação](docs/tools/howto-tools-operations.md)
  - 📋 [Reference: Especificações de APIs e Schemas](docs/tools/reference-tools-catalog.md)
  - 🧠 [Explanation: Decisões Arquiteturais e Racional de Design](docs/tools/explanation-tools-architecture.md)

