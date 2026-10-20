# Referência Técnica do Catálogo de Ferramentas (Reference)

> **Quadrante Diataxis:** Reference (Informação Factual e Contratos Técnicos)  
> **Escopo:** Endpoints HTTP Fastify, Schemas PostgreSQL, Headers de Autenticação, Payloads JSON e Eventos.

---

## 1. Gateway AbacatePay (`apps/api/src/routes/abacatepay.routes.ts`)

### Endpoints Administrativos (Autenticados com Bearer JWT)

#### `GET /v1/workspaces/:workspaceId/abacatepay/config`
Retorna a configuração do gateway para o workspace.
- **Headers:** `Authorization: Bearer <jwt>`
- **Resposta `HTTP 200`:**
  ```json
  {
    "enabled": true,
    "apiKeyConfigured": true,
    "webhookSecretConfigured": true,
    "webhookUrl": "https://chat.automatizaprocessos.tech/v1/webhooks/abacatepay/11111111-1111-1111-1111-111111111111"
  }
  ```

#### `PUT /v1/workspaces/:workspaceId/abacatepay/config`
Atualiza credenciais e status de ativação.
- **Corpo da Requisição:**
  ```json
  {
    "apiKey": "abc_live_1234567890",
    "webhookSecret": "whsec_abcdef123456",
    "enabled": true
  }
  ```
- **Campos Opcionais:** `apiKey` e `webhookSecret` podem ser omitidos se já cadastrados.
- **Resposta `HTTP 200`:** `{ "success": true }`

#### `POST /v1/workspaces/:workspaceId/abacatepay/billing`
Cria link de checkout transparente e registra cobrança no ledger do workspace.
- **Corpo da Requisição:**
  ```json
  {
    "title": "Assinatura Mensal",
    "amount": 29700,
    "customer": {
      "name": "Cliente Exemplo",
      "email": "cliente@email.com",
      "cellphone": "49988447562",
      "taxId": "00000000000191"
    },
    "threadId": "33333333-3333-3333-3333-333333333333",
    "proposalId": "44444444-4444-4444-4444-444444444444"
  }
  ```
- **Resposta `HTTP 201`:**
  ```json
  {
    "chargeId": "55555555-5555-5555-5555-555555555555",
    "gatewayChargeId": "bill_abc123",
    "checkoutUrl": "https://abacatepay.com/pay/bill_abc123",
    "amount": 29700,
    "status": "PENDING"
  }
  ```

---

### Endpoints de Webhook (`apps/api/src/routes/abacatepay-webhook.routes.ts`)

#### `POST /v1/webhooks/abacatepay/:workspaceId` e `POST /v1/webhooks/abacatepay`
Recebimento assíncrono de notificações de pagamento.
- **Headers Obrigatórios:**
  - `Content-Type: application/json`
  - `AbacatePay-Signature: t=<timestamp_segundos>,v1=<hmac_sha256_hex>`
- **Validação de Assinatura:**
  - Payload assinado: `<timestamp>.<raw_body_json>`
  - Algoritmo: HMAC-SHA256 com a chave secreta do workspace.
  - Janela de tolerância: 300 segundos.
  - Comparação: `crypto.timingSafeEqual` (proteção estrita contra timing attacks).
- **Exemplo de Payload (`billing.paid`):**
  ```json
  {
    "event": "billing.paid",
    "data": {
      "billing": {
        "id": "bill_abc123",
        "status": "PAID",
        "amount": 29700,
        "metadata": {
          "workspaceId": "11111111-1111-1111-1111-111111111111",
          "threadId": "33333333-3333-3333-3333-333333333333",
          "proposalId": "44444444-4444-4444-4444-444444444444"
        }
      }
    }
  }
  ```
- **Respostas:**
  - `HTTP 200`: `{ "received": true, "reconciled": true }`
  - `HTTP 401`: `{ "error": "Assinatura invalida ou ausente" }` ou `{ "error": "Replay attack detectado" }`

---

## 2. POS Balcão (`apps/api/src/routes/pos-sales.routes.ts`)

#### `POST /v1/workspaces/:workspaceId/pos/sales`
Registra uma venda presencial/direta gerando proposta e cobrança instantânea.
- **Corpo da Requisição:**
  ```json
  {
    "contactId": "22222222-2222-2222-2222-222222222222",
    "items": [
      {
        "productId": "77777777-7777-7777-7777-777777777777",
        "quantity": 2,
        "unitPriceCents": 15000
      }
    ],
    "paymentMethod": "PIX",
    "taxId": "00000000000191",
    "notes": "Cliente retirou no balcão"
  }
  ```
- **Resposta `HTTP 201`:**
  ```json
  {
    "saleId": "88888888-8888-8888-8888-888888888888",
    "proposalId": "44444444-4444-4444-4444-444444444444",
    "totalCents": 30000,
    "pixCopiaECola": "00020126580014BR.GOV.BCB.PIX...",
    "qrCodeBase64": "data:image/png;base64,iVBORw0KGgo...",
    "checkoutUrl": null
  }
  ```

---

## 3. Enriquecimento Cadastral BrasilAPI (`apps/api/src/routes/enrichment.routes.ts`)

#### `GET /v1/enrichment/cnpj/:cnpj`
Consulta pública e estruturada de CNPJ na base federal.
- **Parâmetro:** `cnpj` (14 dígitos numéricos).
- **Resposta `HTTP 200`:**
  ```json
  {
    "cnpj": "00000000000191",
    "razaoSocial": "BANCO DO BRASIL SA",
    "nomeFantasia": "DIRECAO GERAL",
    "situacaoCadastral": "ATIVA",
    "cnaeFiscal": 6422100,
    "cnaeFiscalDescricao": "Bancos múltiplos, com carteira comercial",
    "logradouro": "SBS QUADRA 1 BLOCO C LOTE 32",
    "numero": "SN",
    "bairro": "ASA SUL",
    "municipio": "BRASILIA",
    "uf": "DF",
    "cep": "70073901",
    "telefone": "6134939002"
  }
  ```

#### `GET /v1/enrichment/cep/:cep`
Consulta de endereço estruturado por CEP (8 dígitos).
- **Resposta `HTTP 200`:**
  ```json
  {
    "cep": "89801000",
    "state": "SC",
    "city": "Chapecó",
    "neighborhood": "Centro",
    "street": "Avenida Getúlio Dorneles Vargas"
  }
  ```

---

## 4. Estrutura de Banco de Dados Relacionada (PostgreSQL 16)

### Tabela `workspaces` (Extensão da Migração 064)
| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `abacatepay_api_key` | `TEXT` | `NULL` | Chave de API do AbacatePay (criptografada em repouso) |
| `abacatepay_webhook_secret` | `TEXT` | `NULL` | Segredo para validação de assinatura HMAC |
| `abacatepay_enabled` | `BOOLEAN` | `DEFAULT FALSE NOT NULL` | Habilitação do provedor no workspace |

### Tabela `pix_charges` (Extensão da Migração 064)
| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `gateway_provider` | `VARCHAR(32)` | `DEFAULT 'BACEN_DIRECT' NOT NULL` | Identificador do provedor (`BACEN_DIRECT`, `ABACATEPAY`) |
| `gateway_charge_id` | `VARCHAR(128)` | `NULL` | ID único da cobrança retornado pelo gateway |
| `gateway_checkout_url` | `TEXT` | `NULL` | URL pública da página de pagamento do gateway |

---

## 5. Variáveis de Ambiente e Dependências Críticas

| Variável | Padrão / Exemplo | Finalidade |
|---|---|---|
| `DATABASE_URL` | `postgresql://...:5432/sos_sales_v3` | Conexão principal com PostgreSQL sob RLS |
| `REDIS_URL` | `redis://sos-sales-redis:6379` | Cache, rate limit e filas BullMQ |
| `JWT_SECRET` | `64_bytes_hex_aleatorios` | Assinatura de tokens JWT HS256 |
| `ENCRYPTION_KEYRING` | `{"currentVersion":"v1","keys":{"v1":"..."}}` | Chave AES-256-GCM para dados sensíveis |
| `NVIDIA_NIM_API_KEY` | `nvapi-...` | Chave do motor primário de IA Nemotron |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Chave do motor secundário de IA |
| `WAHA_ENDPOINT` | `http://sos-sales-waha:3000` | API interna do WhatsApp HTTP API |
