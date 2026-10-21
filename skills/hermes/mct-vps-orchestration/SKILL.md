---
name: mct-vps-orchestration
description: "Orquestração soberana da VPS Hostinger (200.141.17.99): status de containers, monitoramento de saúde do n8n, SOS Vendas, backups e redes isoladas."
version: 1.0.0
author: Francisco Rios / MCT LTDA
license: Proprietary
platforms: [linux]
metadata:
  hermes:
    tags: [vps, docker, hostinger, n8n, caddy, backup, mct-os]
prerequisites:
  commands: [docker, systemctl, free, df]
---

# MCT VPS Hostinger Orchestration

Esta skill ensina o Hermes Agent a operar como o sysadmin e guardião da infraestrutura da VPS Hostinger Cloud KVM 4 (`200.141.17.99`).

## Topologia das Ilhas na VPS:
1. **Ilha SOS Vendas (`/opt/chat-sales`):**
   - Rede Docker: `sos-sales-network`
   - Containers: `chat-sales-web` (Cockpit Next.js), `chat-sales-api` (porta 4400), `chat-sales-worker`, `sos-sales-waha` (porta 3000), `sos-sales-postgres` (porta 5432), `sos-sales-redis` (porta 6379), `sos-sales-caddy` (portas 80 e 443 com SSL Let's Encrypt).
2. **Ilha PLX Contabilidade & n8n (`/opt/plx-documentos`):**
   - Rede Docker: `plx-network`
   - Containers: `n8n` (porta 5678 interna), `plx-n8n-db` (Postgres 16 com 148 tabelas).
3. **Ilha Hermes Agent (`/opt/hermes-island`):**
   - Cérebro: `nvidia/nemotron-3-ultra-550b-a55b` via NVIDIA NIM.
   - Gateway de Mensageria e Subagentes.

## Comandos Operacionais Aprovados:
- **Verificar saúde e consumo de hardware:**
  ```bash
  free -h && df -h / && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  ```
- **Consultar Workflows Recentes no n8n:**
  ```bash
  docker exec -i plx-n8n-db psql -U plx_user -d plx_n8n -t -A -c "SELECT id, name, active FROM workflow_entity ORDER BY \"createdAt\" DESC LIMIT 10;"
  ```
- **Executar Backup Soberano Turnkey:**
  ```bash
  /usr/local/bin/vps-backup
  ```
- **Reiniciar Ilhas Específicas (se houver degradação):**
  ```bash
  /usr/local/bin/chat-sales-restart
  /usr/local/bin/plx-restart
  /usr/local/bin/caddy-reload
  ```

## Regras Inquebráveis (P0):
- NUNCA exponha portas no UFW além das 22 (SSH), 80 (HTTP) e 443 (HTTPS).
- NUNCA use `localhost` dentro de containers Docker (use o nome do container ou host bridge `172.17.0.1`).
- NUNCA use n8n fora da VPS (nossa instância é 100% auto-hospedada e soberana).
- Estado vazio deve ser exibido como "Sem dados ainda", nunca dados simulados.
