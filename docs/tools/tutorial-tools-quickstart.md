# Tutorial: Do Zero à Primeira Venda com Checkout, POS e IA

> **Quadrante Diataxis:** Tutorial (Aprendizado Orientado a Ação)  
> **Objetivo:** Configurar um produto, emitir cobrança via Gateway AbacatePay / Pix, registrar uma venda no POS Balcão e acompanhar o despacho no WhatsApp em 4 passos rápidos.  
> **Tempo estimado:** 5 minutos.

---

## O que você vai construir

Você vai configurar um ambiente comercial completo:
1. Cadastrar um produto no catálogo.
2. Ativar a integração com o Gateway AbacatePay.
3. Realizar uma venda instantânea no POS Balcão com enriquecimento de dados fiscais (BrasilAPI).
4. Simular a liquidação com webhook e verificar a reconciliação automática da proposta e envio de comprovante no WhatsApp.

---

## Pré-requisitos

- Acesso autenticado ao Cockpit Comercial (`https://chat.automatizaprocessos.tech` ou ambiente local `http://localhost:5173`).
- Um workspace ativo configurado com um canal WhatsApp pareado (`pairing` ou `open`).
- Chave de API do AbacatePay (ou chave de desenvolvimento `abc_test_...`).

---

## Passo 1: Cadastrar um Produto no Catálogo (Resultado em 1 minuto)

O catálogo de produtos alimenta tanto o POS Balcão quanto a IA Comercial.

1. No menu lateral do Cockpit, clique em **Catálogo** (`/catalog`).
2. Clique no botão **+ Novo Produto**.
3. Preencha os campos básicos:
   - **Nome:** `Plano de Consultoria MCT Pro`
   - **SKU:** `CONS-MCT-01`
   - **Preço (R$):** `497,00` (armazenado como `49700` centavos no banco)
   - **Descrição:** `Consultoria estratégica de automação e engenharia reversa de processos.`
4. Clique em **Salvar Produto**.

> 💡 **Verificação:** O produto aparece imediatamente na listagem com o selo verde `Ativo`.

---

## Passo 2: Configurar o Gateway de Pagamentos AbacatePay

Com o produto cadastrado, habilite o checkout gerenciado com Pix e Cartão.

1. Acesse **Configurações > Cobrança & Pix** (`/settings/pix`).
2. Localize o card **Gateway AbacatePay (Checkout & Billing Transacional)**.
3. Ative a chave **Habilitar Cobrança via AbacatePay**.
4. Insira as credenciais da sua conta AbacatePay:
   - **API Key:** `abc_live_...` (ou `abc_test_...` para testes)
   - **Webhook Secret:** Chave secreta de validação HMAC (ex: `whsec_...`)
5. Clique em **Salvar Credenciais**.
6. Clique no botão **Copiar URL de Webhook**. A URL gerada possui o formato:
   `https://chat.automatizaprocessos.tech/v1/webhooks/abacatepay/<seu-workspace-id>`
7. Cole essa URL no painel do AbacatePay em **Configurações > Webhooks** marcando o evento `billing.paid`.

---

## Passo 3: Realizar uma Venda Instantânea no POS Balcão

Agora execute uma venda balcão vinculando o cliente e o produto.

1. Em qualquer tela do Cockpit, clique no botão **Venda Balcão** no topo direito (ou atalho de teclado `Alt + P`).
2. O **Drawer de Venda Balcão** desliza na tela:
   - **Cliente:** Selecione um contato existente ou informe o número WhatsApp (`49988447562`).
   - **CNPJ/CPF (Opcional):** Digite o CNPJ da empresa cliente (ex: `00000000000191`).
   - O sistema aciona em background a **BrasilAPI** e preenche automaticamente Razão Social, Logradouro, Bairro e Município.
3. Adicione o item `Plano de Consultoria MCT Pro` (Quantidade: 1).
4. No método de pagamento, selecione **AbacatePay (Link de Checkout)**.
5. Clique em **Gerar Cobrança & Link**.

> 🎉 **Resultado Imediato:** O sistema gera o link de checkout `https://abacatepay.com/pay/bill-...` e o código Pix Copia e Cola para pagamento na hora.

---

## Passo 4: Liquidação e Reconciliação Automática

Quando o cliente efetua o pagamento no link do AbacatePay:

1. O gateway envia a notificação `billing.paid` assinada com HMAC SHA-256 para `/v1/webhooks/abacatepay/<workspaceId>`.
2. O motor do SOS Sales V3 valida a assinatura de forma timing-safe.
3. A cobrança transita para status `PAID` com timestamp em `paid_at`.
4. A proposta vinculada é aceita (`accepted`), o desfecho comercial é registrado e o worker enfileira a mensagem no WhatsApp:
   ```
   Olá! Seu pagamento no valor de R$ 497,00 referente a "Plano de Consultoria MCT Pro" foi confirmado com sucesso! 🎉
   Em breve nossa equipe entrará em contato com os próximos passos.
   ```
5. No Cockpit, a conversa do contato é atualizada com a tag verde de **Venda Concluída**.

---

## O que você construiu

Você estruturou um fluxo operacional completo onde:
- Os produtos do catálogo servem tanto aos atendentes no balcão quanto ao robô de atendimento com IA.
- O pagamento é processado e liquidado com segurança criptográfica estrita.
- A contabilidade e o histórico de compras do contato são mantidos 100% íntegros sem intervenção manual.
