# Guias Práticos de Operação (How-To Guides)

> **Quadrante Diataxis:** How-To (Execução Prática Orientada a Tarefas)  
> **Público:** Operadores de vendas, gestores de tráfego, administradores de sistema e desenvolvedores.  
> **Formato:** Pré-requisitos ➔ Passos de Ação ➔ Verificação ➔ Solução de Problemas.

---

## 1. Como Configurar e Testar o Gateway AbacatePay

### Objetivo
Habilitar a emissão de cobranças com Pix e Cartão via AbacatePay e garantir que os webhooks de confirmação estejam ativos.

### Passos
1. No Cockpit, vá em **Configurações > Cobrança & Pix**.
2. Preencha sua `API Key` e `Webhook Secret` fornecidos pelo AbacatePay.
3. Copie a URL do webhook: `https://chat.automatizaprocessos.tech/v1/webhooks/abacatepay/<workspaceId>`.
4. Cadastre a URL no dashboard do AbacatePay em **Desenvolvedores > Webhooks**, selecionando o evento `billing.paid`.
5. Para testar o endpoint manualmente via cURL:
   ```bash
   TIMESTAMP=$(date +%s)
   BODY='{"event":"billing.paid","data":{"billing":{"id":"bill_test_123","status":"PAID","amount":49700,"metadata":{"workspaceId":"<workspaceId>"}}}}'
   SECRET="seu_webhook_secret"
   SIGNATURE=$(printf "$TIMESTAMP.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

   curl -X POST "https://chat.automatizaprocessos.tech/v1/webhooks/abacatepay/<workspaceId>" \
     -H "Content-Type: application/json" \
     -H "AbacatePay-Signature: t=$TIMESTAMP,v1=$SIGNATURE" \
     -d "$BODY"
   ```

### Verificação
- A resposta deve retornar `HTTP 200` com `{ "received": true, "reconciled": true }`.
- A cobrança correspondente em `pix_charges` passa a ter `status = 'PAID'` e `paid_at` preenchido.

### Solução de Problemas
- **Erro `401 Unauthorized - Assinatura invalida ou ausente`:** Verifique se o `Webhook Secret` inserido no Cockpit corresponde exatamente ao gerado no AbacatePay.
- **Erro `401 Unauthorized - Replay attack detectado`:** O relógio do servidor que enviou o webhook está com mais de 300 segundos de discrepância em relação ao servidor da aplicação.

---

## 2. Como Utilizar o POS Balcão com Enriquecimento BrasilAPI

### Objetivo
Registrar rapidamente uma venda presencial ou remota com preenchimento instantâneo de dados corporativos a partir de um CNPJ.

### Passos
1. Abra o Cockpit e clique no botão **Venda Balcão** (`Alt + P`).
2. Digite os 14 dígitos do CNPJ no campo correspondente (sem pontuação).
3. O sistema consulta automaticamente a API de enriquecimento:
   ```
   GET /v1/enrichment/cnpj/00000000000191
   ```
4. O formulário é populado instantaneamente com:
   - Razão Social e Nome Fantasia
   - Situação Cadastral (ativa/inapta)
   - CEP, Logradouro, Bairro e Cidade
   - CNAE Principal
5. Adicione os itens desejados do catálogo e clique em **Gerar Cobrança Pix**.

### Verificação
- O QR Code Pix é exibido na tela pronto para o cliente apontar a câmera do banco.
- O botão **Copiar Chave Copia e Cola** permite enviar o código em texto pelo WhatsApp.

### Solução de Problemas
- **CNPJ não encontrado ou offline:** Caso a Receita Federal ou a BrasilAPI estejam instáveis, o formulário permanece aberto para digitação manual, nunca travando o fluxo da venda.

---

## 3. Como Executar Transmissão com Campeã A/B por Receita Real

### Objetivo
Disparar mensagens em massa para clientes que abandonaram o checkout Pix ou estão inativos, elegendo automaticamente a variante com maior faturamento.

### Passos
1. Acesse o menu **Transmissões** (`/broadcasts`).
2. Clique em **Nova Campanha**.
3. Selecione a audiência através do **Filtro Inteligente**:
   - `PIX_ABANDONED`: Clientes com Pix expirado que nunca compraram.
   - `INACTIVE_30_DAYS`: Contatos sem conversas há 30 dias.
4. Defina o Teste A/B:
   - **Variante A:** Oferta direta com desconto exclusivo de 10%.
   - **Variante B:** Abordagem consultiva oferecendo tirar dúvidas sobre o produto.
5. Ajuste a cadência de segurança (mínimo de 3 segundos entre mensagens) para proteger a saúde da linha.
6. Clique em **Iniciar Transmissão**.

### Verificação
- O relatório em tempo real exibe mensagens enviadas, entregues, lidas e taxa de resposta.
- Na aba **Faturamento Comercial**, a variante com maior receita total (`salesCents`) recebe o selo `🏆 Campeã Comercial`.

---

## 4. Como Recuperar Sessões WhatsApp Paradas no WAHA

### Objetivo
Diagnosticar e reiniciar uma linha comercial do WhatsApp que parou de sincronizar ou desconectou.

### Passos
1. No Cockpit, vá em **Canais de Atendimento** (`/settings/channels`).
2. Localize o card do canal com problema (ex: SOS Sales ou Haven Escovaria).
3. Clique no botão **Sincronizar Canal**.
4. O sistema executa o protocolo de auto-cura:
   - Consulta `/api/sessions/<nome_da_sessao>` no WAHA.
   - Se a sessão estiver parada (`STOPPED`), dispara `/api/sessions/start`.
   - Se a sessão exigir QR Code, altera o status para `pairing` e abre o modal do QR Code na tela.
5. Se for necessário ler novamente o QR Code:
   - Abra o WhatsApp no celular comercial.
   - Acesse **Aparelhos Conectados > Conectar Aparelho**.
   - Aponte a câmera para o QR Code gerado no Cockpit.

### Verificação
- O canal retorna ao status verde `Ativo / Conectado` (`WORKING`).
- As mensagens pendentes na fila são sincronizadas automaticamente.

---

## 5. Como Inspecionar Disparos da Meta Conversions API (CAPI)

### Objetivo
Verificar se os eventos de compra e conversão originados de anúncios Click-to-WhatsApp (CTWA) estão sendo reportados corretamente à Meta.

### Passos
1. Acesse a VPS via SSH:
   ```bash
   ssh -i ~/.ssh/id_rsa_mct_deploy root@200.141.17.99
   ```
2. Inspecione os logs do dispatcher da CAPI:
   ```bash
   docker logs --tail 100 chat-sales-worker | grep -i "capi"
   ```
3. Consulte no PostgreSQL os recibos de entrega registrados:
   ```bash
   docker exec -it sos-sales-postgres psql -U postgres -d sos_sales_v3 -c "
     SELECT id, event_name, status, receipt->>'fbtrace_id' AS fbtrace_id, created_at
     FROM conversion_events
     ORDER BY created_at DESC
     LIMIT 5;
   "
   ```

### Verificação
- Os eventos devem constar com status `SENT` e conter um `fbtrace_id` válido retornado pelos servidores da Meta Graph API v26.0.

---

## 6. Como Executar e Validar o Backup Diário Criptografado (AES-256)

### Objetivo
Realizar um snapshot completo do banco de dados e arquivos de mídia e garantir a integridade do backup.

### Passos
1. Conecte na VPS e execute o utilitário de host:
   ```bash
   vps-backup
   ```
2. O script executa o dump via pipeline:
   ```
   pg_dump ➔ gzip ➔ openssl enc -aes-256-cbc ➔ sha256sum
   ```
3. Para testar a integridade e restauração em ambiente isolado:
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/root/.backup_vault_key \
     -in /opt/sos-sales/backups/daily/backup_latest.sql.gz.enc | gunzip -t
   ```

### Verificação
- A saída do comando `gunzip -t` deve ser silenciosa (código de saída `0`), confirmando que os dados criptografados estão 100% íntegros e descompactáveis.
