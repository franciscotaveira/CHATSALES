---
name: mct-waha-operator
description: "Operação e diagnóstico do motor de mensageria WhatsApp WAHA (container sos-sales-waha) na VPS: checagem de sessões, auto-heal, QR code e resolução de JIDs @lid."
version: 1.0.0
author: Francisco Rios / MCT LTDA
license: Proprietary
platforms: [linux]
metadata:
  hermes:
    tags: [waha, whatsapp, docker, autoheal, qrcode, lid-resolution, mct-os]
prerequisites:
  commands: [docker, curl]
---

# MCT WAHA WhatsApp Engine Operator

Esta skill ensina o Hermes Agent a monitorar, diagnosticar e auto-curar as sessões do motor de mensageria **WAHA** rodando no container `sos-sales-waha` na VPS.

## Contexto Técnico
- **Container:** `sos-sales-waha` (rede interna `sos-sales-network`, porta 3000 interna).
- **Sessões Ativas:**
  - `default` / `plx-documentos` (+554988447562): Sessão operacional de atendimento e triagem documental da MCT/PLX.
  - `haven` (+554988370054): Sessão dedicada ao cliente Haven Escovaria.

## Comandos Operacionais no Host da VPS:

### 1. Inspecionar Saúde e Status de Todas as Sessões:
```bash
docker exec -i sos-sales-waha curl -s http://localhost:3000/api/sessions
```
*Estados possíveis:* `WORKING` (saudável), `STARTING` (iniciando), `SCAN_QR_CODE` (precisa escanear), `STOPPED` ou `FAILED`.

### 2. Reiniciar Sessão Travada (Auto-Heal):
Se uma sessão estiver em estado `FAILED` ou parada:
```bash
docker exec -i sos-sales-waha curl -s -X POST http://localhost:3000/api/sessions/<nome-da-sessao>/restart
```

### 3. Capturar QR Code para Re-Conexão (se desconectar):
```bash
docker exec -i sos-sales-waha curl -s http://localhost:3000/api/<nome-da-sessao>/auth/qr
```

### 4. Disparo Direto de Mensagem Transacional:
```bash
docker exec -i sos-sales-waha curl -s -X POST http://localhost:3000/api/sendText \
  -H "Content-Type: application/json" \
  -d '{"session": "default", "chatId": "<numero>@c.us", "text": "<mensagem>"}'
```

### 5. Resolução Determinística de JIDs `@lid`:
O WhatsApp frequentemente envia IDs de privacidade temporários terminados em `@lid` em vez do número telefônico internacional `@s.whatsapp.net` / `@c.us`. O Hermes deve:
- Consultar a tabela de contatos no Postgres `sos-sales-postgres` buscando pelo JID resolvido.
- Nunca duplicar contatos na base por causa de mensagens recebidas via `@lid`.
