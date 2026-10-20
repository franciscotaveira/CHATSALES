# Catálogo e Manual de Ferramentas Soberanas — SOS Sales V3

> **MCT OS v2.0** | Francisco Rios | MCT LTDA | Chapecó, BR  
> **Filosofia:** Poder invisível, simplicidade visível. Truth in Data.  
> **Framework Documental:** Diataxis (Tutorial, How-To, Reference, Explanation) via Matt Pocock's Documentation Engine.

---

## Visão Geral das Ferramentas do Ecossistema

O SOS Sales V3 consolida 8 ferramentas e motores autônomos que operam de ponta a ponta sobre o PostgreSQL 16 (sob isolamento estrito via Row Level Security), Redis 7 e orquestração assíncrona BullMQ:

| # | Ferramenta / Motor | Domínio | Arquivos Core |
|---|---|---|---|
| **1** | **Gateway AbacatePay & Pix BACEN EMV** | Faturamento & Checkout | `abacatepay.service.ts`, `abacatepay-webhook.routes.ts`, `PixSection.tsx` |
| **2** | **POS Balcão (Venda Direta Instantânea)** | Vendas Omnichannel | `pos-sales.routes.ts`, `CounterSaleDrawer.tsx` |
| **3** | **Enriquecimento Cadastral BrasilAPI** | Fiscal & Compliance | `enrichment.service.ts`, `enrichment.routes.ts` |
| **4** | **Motor de Mensageria Dual (WAHA + WABA)** | Comunicação WhatsApp | `ChannelDispatchService.ts`, `channels.routes.ts`, `waba-cost-optimizer` |
| **5** | **IA Comercial Soberana Dual-Engine** | Atendimento & Fechamento | `ai-engine.ts`, `AiReceptionistProcessor.ts`, `ai_agent_versions` |
| **6** | **Transmissão Inteligente & Campeã A/B** | Remarketing & Audiência | `broadcasts.routes.ts`, `broadcast-processor.ts` |
| **7** | **Meta Conversions API (CAPI v26.0)** | Atribuição CTWA Ads | `capi-dispatcher.ts`, `conversion_events` |
| **8** | **SecurityShield, Sentinela & Backups** | Infraestrutura & Defesa | `watchdog-chat-sales.sh`, `backup-encrypted.sh`, `SecurityShield` |

---

## Navegação pelo Framework Diataxis

Cada quadrante atende a um objetivo específico do operador ou desenvolvedor:

```
                  APRENDIZADO (Prático)
                           ▲
                           │
       [1] TUTORIAL        │        [2] HOW-TO GUIDES
   (Passo a passo inicial  │    (Receitas para tarefas
   do zero à primeira venda)│    operacionais do dia a dia)
                           │
───────────────────────────┼───────────────────────────► EXECUÇÃO (Tarefas)
                           │
      [4] EXPLANATION      │        [3] REFERENCE
   (Por que o sistema foi  │    (Contratos técnicos de API,
   desenhado dessa forma)  │    schemas, banco e payloads)
                           │
                           ▼
                  COMPREENSÃO (Teórico)
```

1. 🚀 **[Tutorial: Do Zero ao Fechamento com Pagamento e IA](./tutorial-tools-quickstart.md)**  
   Aprenda em menos de 3 minutos a criar um produto, configurar o checkout Pix/AbacatePay, habilitar o POS Balcão e ver o comprovante cair no WhatsApp do cliente.

2. 🛠️ **[How-To: Guias Práticos Operacionais](./howto-tools-operations.md)**  
   Instruções operacionais diretas com validação passo a passo e solução de problemas para cada uma das 8 ferramentas.

3. 📖 **[Reference: Especificação Técnica Completa](./reference-tools-catalog.md)**  
   Contratos canônicos de endpoints Fastify, schemas PostgreSQL, payloads de webhook, tabelas de banco e variáveis de ambiente.

4. 🧠 **[Explanation: Decisões Arquiteturais e Segurança](./explanation-tools-architecture.md)**  
   Entenda o "porquê" de cada escolha: por que não usamos n8n no core, por que HMAC timing-safe é obrigatório, como funciona o RLS fail-closed e a política anti-alucinação.

---

## Regras de Ouro de Operação (P0)

1. **Truth in Data:** Nenhuma ferramenta inventa dados, valores ou simulações. Ausência de dados resulta em estado vazio explícito.
2. **Fail-Closed:** Falhas em integrações externas nunca executam fallback silencioso entre canais ou provedores de pagamento não homologados.
3. **RLS Obrigatório:** Todas as operações no banco executam sob o contexto da empresa autenticada (`SET LOCAL app.current_tenant_id`).
