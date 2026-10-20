# Arquitetura e Decisões de Design (Explanation)

> **Quadrante Diataxis:** Explanation (Compreensão Conceitual e Racional de Design)  
> **Tema Central:** Por que as ferramentas do SOS Sales V3 foram concebidas dessa forma e quais trade-offs governam o sistema.

---

## 1. Topologia de Pagamentos Híbrida: Pix Direto vs Gateway AbacatePay

### O Problema
Sistemas SaaS comerciais tradicionalmente sofrem de dois extremos dolorosos:
1. **Extremo A (Apenas Pix Direto BACEN):** O lojista não paga taxa percentual sobre o Pix, mas o cliente não tem a opção de pagar no cartão de crédito caso esteja sem saldo em conta, nem recebe uma experiência de checkout visual rica.
2. **Extremo B (Apenas Gateways Terceirizados):** O lojista fica refém de taxas de 2% a 5% sobre cada venda via Pix e sofre com bloqueios de saldo ou atrasos de repasse de intermediários bancários tradicionais.

### A Abordagem Soberana
O SOS Sales V3 implementou uma **Arquitetura de Liquidação Dual**:
- O operador pode operar 100% no **Pix Direto BACEN EMV nativo** (chave Pix direta, custo zero de intermediação e recebimento instantâneo em sua própria conta jurídica).
- O operador pode ativar o **Gateway AbacatePay** com 1 clique para habilitar links de checkout com cartão, parcelamento e geração automática de QR Code Pix com webhook governado.

```
                           ┌───────────────────────────────┐
                           │      INTENÇÃO DE COMPRA       │
                           │   (POS Balcão / IA Comercial) │
                           └───────────────┬───────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
       [Provedor BACEN Direto]                         [Gateway AbacatePay]
       - Custo: R$ 0,00                                - Taxas do Gateway
       - Pix Copia e Cola EMV                          - Link de Checkout + Cartão
       - Liquidação na Conta Jurídica                  - Webhook HMAC SHA-256
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │
                                           ▼
                           ┌───────────────────────────────┐
                           │    CONCILIAÇÃO TRANSACIONAL   │
                           │ - Status: PAID                │
                           │ - Proposta: Aceita            │
                           │ - Desfecho: Registrado        │
                           │ - Outbox: Recibo WhatsApp     │
                           └───────────────────────────────┘
```

### Trade-offs
- **Complexidade de Schema:** Exigiu estender `pix_charges` com campos de gateway (`gateway_provider`, `gateway_charge_id`, `gateway_checkout_url`) em vez de criar uma tabela paralela. Escolhemos estender para manter um **Ledger Unificado de Cobranças** sob a mesma auditoria e relatórios.
- **Assinatura de Webhooks:** A verificação com `crypto.timingSafeEqual` consome ciclos de CPU adicionais, mas elimina completamente o risco de ataque de timing na rota pública de webhooks.

---

## 2. A Fronteira Inquebrável do n8n (Por que n8n nunca no Core)

### O Problema
Workflows no n8n são rápidos para prototipagem, mas falham catastroficamente em sistemas corporativos de alta concorrência:
- Falta de controle fino de transações ACID e concorrência no PostgreSQL (`FOR UPDATE SKIP LOCKED`).
- Perda silenciosa de mensagens quando nós de terceiros falham ou reiniciam.
- Risco de vazamento de credenciais em workflows compartilhados ou instáveis.

### A Abordagem
- **n8n como Laboratório:** É estritamente confinado ao papel de scrapers de apoio, testes de mercado e pesquisa de automações.
- **SOS Sales Monorepo como Core:** Todo o despacho de mensagens, cálculo financeiro, validação de tokens JWT e gestão de filas roda exclusivamente em Fastify + Node.js + BullMQ + PostgreSQL RLS.

---

## 3. Motor Dual-Engine de IA: Por que NVIDIA Nemotron + OpenRouter

### O Problema
Depender de um único provedor proprietário de LLM (ex: exclusivamente OpenAI ou Anthropic) coloca a operação em risco de:
- **Downtime global de terceiros:** Se o provedor cair, o atendimento de milhares de leads é paralisado.
- **Alucinação comercial:** Modelos generalistas tendem a ser complacentes demais e inventam descontos ou condições comerciais não cadastradas.

### A Abordagem
1. **NVIDIA NIM (Nemotron 3 Super 120B / Llama 3.1 Nemotron):** Modelo de referência soberano com fine-tuning voltado a aderência estrita a restrições e menor custo por milhão de tokens.
2. **OpenRouter (Claude 3.5 Sonnet / Gemini 2.5 Flash):** Fallback automatizado caso a infraestrutura primária oscile.
3. **Grounding Factual em 4 Camadas:**
   - Camada 1: Catálogo de Produtos Ativos (`products`).
   - Camada 2: Regras de Negócio do Tenant (`ai_business_rules`).
   - Camada 3: Base de FAQ Auditada (`ai_faq`).
   - Camada 4: Protocolo de Ignorância com `[TRANSBORDO_HUMANO]` imediato caso a dúvida fuja do escopo factual.

---

## 4. Isolamento Multi-Tenant via PostgreSQL Row Level Security (RLS)

### O Problema
A maioria dos softwares multi-tenant depende de cláusulas manuais `WHERE workspace_id = $1` escritas em código TypeScript. Um único esquecimento de um desenvolvedor júnior em uma query expõe dados confidenciais de um concorrente.

### A Abordagem
- O SOS Sales V3 força `FORCE ROW LEVEL SECURITY` nativo no PostgreSQL em todas as tabelas.
- A aplicação autenticada executa um comando de sessão contextual antes de qualquer transação:
  ```sql
  SET LOCAL app.current_tenant_id = '<workspace_id>';
  ```
- O banco de dados bloqueia silenciosa e deterministicamente qualquer linha pertencente a outro tenant, mesmo que o código da API esqueça o filtro `WHERE`.
