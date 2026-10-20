# Manual Operacional da VPS Soberana Hostinger KVM 4 (MCT OS v2.0)

> **Proprietário:** Francisco Rios | MCT LTDA | Chapecó, SC  
> **Servidor:** Hostinger Cloud KVM 4 (`srv2078434.hstgr.cloud`)  
> **IP Público:** `200.141.17.99` (Campinas, SP — Baixa Latência)  
> **Hardware:** 4 vCPUs AMD EPYC, 16 GB RAM, 200 GB NVMe, 4 GB Swap  
> **Domínio Mestre:** `automatizaprocessos.tech`  
> **Hierarquia:** P0 (Inviolável). Qualquer IA, LLM ou desenvolvedor deve seguir este manual.

---

## 1. Topologia de Ilhas Isoladas com Borda Unificada

O servidor de produção é blindado com segregação estrita por redes internas Docker. Nenhuma porta de banco de dados ou mensageria é exposta publicamente.

```
                                  [ INTERNET ]
                                       │
                      (Portas 80 HTTP / 443 HTTPS / 22 SSH)
                                       ▼
                       ┌───────────────────────────────┐
                       │   Borda: Caddy 2 (TLS Auto)   │
                       │     (sos-sales-caddy)         │
                       └───────┬───────────────┬───────┘
                               │               │
            ┌──────────────────┴──┐         ┌──┴──────────────────┐
            │  sos-sales-network  │         │     plx-network     │
            ▼                     ▼         ▼                     ▼
   ┌─────────────────┐  ┌─────────────┐ ┌─────────┐  ┌────────────────┐
   │ Chat Sales V3   │  │ PostgreSQL  │ │ n8n     │  │ n8n PostgreSQL │
   │ (API, Web, Work)│  │ + Redis     │ │ Engine  │  │ (plx-n8n-db)   │
   │ + WAHA Engine   │  │ (sos_sales) │ │         │  │                │
   └─────────────────┘  └─────────────┘ └─────────┘  └────────────────┘
      [ ILHA 1: Chat Sales V3 ]            [ ILHA 2: PLX Automações ]
```

---

## 2. As 7 Regras de Ouro Invioláveis (P0)

1. **PROIBIDO EXPOR PORTAS DE BANCOS OU REDIS NO HOST:**
   - O firewall UFW está ativo com `default deny incoming`. Apenas portas **22** (SSH), **80** (HTTP) e **443** (HTTPS) podem escutar no `0.0.0.0`.
   - NUNCA suba um container usando `-p 5432:5432` ou `-p 6379:6379`. Os containers comunicam-se exclusivamente pelo nome do serviço na rede interna.
2. **ZERO PERDA DE DADOS (PRESERVAÇÃO ESTRITA DE VOLUMES):**
   - NUNCA execute `docker compose down -v` nem `docker volume prune -f`.
   - NUNCA apague arquivos em `/opt/sos-sales/backups/daily/`.
3. **ISOLAMENTO DE NOVAS FERRAMENTAS:**
   - Para rodar uma nova aplicação (ex: Grafana, Dify, Typebot), crie SEMPRE um diretório próprio em `/opt/<nome-da-ferramenta>/` com um `docker-compose.yml` dedicado e uma rede Docker isolada (ex: `grafana-network`).
4. **ROTEAMENTO PÚBLICO EXCLUSIVO VIA CADDY:**
   - Para expor um serviço publicamente, conecte o container `sos-sales-caddy` à rede da nova ferramenta:
     `docker network connect <sua-rede> sos-sales-caddy`
   - Adicione o bloco correspondente em `/opt/sos-sales/Caddyfile` e execute `caddy-reload`.
5. **ORÇAMENTO DE MEMÓRIA (TETO POR ILHA):**
   - Capacidade total: 16 GB RAM + 4 GB Swap.
   - Teto Ilha Chat Sales: 7 GB (WAHA Chromium limitado a 2.5 GB).
   - Teto Ilha PLX / n8n: 5 GB.
   - Folga operacional e novas ferramentas: até 4 GB.
6. **TRUTH IN DATA (SEM DADOS FICTÍCIOS OU MOCKS):**
   - Não crie bancos de testes que colidam com as bases de produção (`sos_sales_v3` e `plx_n8n`).
7. **BACKUP OBRIGATÓRIO ANTES DE MANUTENÇÃO:**
   - Antes de aplicar migrações manuais ou updates grandes, execute o comando `vps-backup`.

---

## 3. Mapa de Serviços Ativos na VPS

| Container | Imagem | Finalidade | Rede Docker | Porta Interna |
| :--- | :--- | :--- | :--- | :--- |
| `sos-sales-caddy` | `caddy:2-alpine` | Borda TLS automático / Reverse proxy | `sos-sales-network`, `plx-network` | `80`, `443` (host) |
| `chat-sales-web` | `chat-sales-v3-web:latest` | Frontend React/Vite Cockpit Nginx | `sos-sales-network` | `80` (interno) |
| `chat-sales-api` | `chat-sales-v3-api:latest` | Fastify 5 API e Webhooks | `sos-sales-network` | `4400` (interno) |
| `chat-sales-worker` | `chat-sales-v3-worker:latest` | Outbox to Dispatcher Worker | `sos-sales-network` | — |
| `sos-sales-postgres` | `postgres:16-alpine` | PostgreSQL 16 Soberano | `sos-sales-network` | `5432` (interno) |
| `sos-sales-redis` | `redis:7-alpine` | Redis 7 Caching, Filas e Pub/Sub | `sos-sales-network` | `6379` (interno) |
| `sos-sales-waha` | `devlikeapro/waha:latest-2026.8.2` | WhatsApp Engine com sessões | `sos-sales-network` | `3000` (interno) |
| `n8n` | `docker.n8n.io/n8nio/n8n:latest` | Motor de Automações PLX | `plx-network` | `5678` (interno) |
| `plx-n8n-db` | `postgres:16-alpine` | Banco de dados do n8n | `plx-network` | `5432` (interno) |

---

## 4. Domínios Oficiais Ativos

| Subdomínio | Destino Caddy | Aplicação |
| :--- | :--- | :--- |
| `chat.automatizaprocessos.tech` | `chat-sales-web:80` + `chat-sales-api:4400` + `sos-sales-waha:3000` | Cockpit Comercial Chat Sales V3 |
| `automacao.automatizaprocessos.tech` | `n8n:5678` | Painel n8n PLX Automações |
| `automatizaprocessos.tech` | `/var/www/landing` | Landing Page Oficial institucional |
| `www.automatizaprocessos.tech` | `/var/www/landing` | Redirecionamento da Landing |

---

## 5. Comandos Utilitários no Terminal do Host

Ao conectar via SSH (`ssh root@200.141.17.99`), os seguintes comandos globais estão prontos para uso:

```bash
# 1. Diagnóstico completo em tempo real
vps-status

# 2. Backup manual instantâneo criptografado
vps-backup

# 3. Reiniciar graciosamente o Chat Sales V3
chat-sales-restart

# 4. Reiniciar o n8n
plx-restart

# 5. Recarregar o Caddy sem downtime
caddy-reload
```

---

## 6. Procedimento de Recuperação de Desastre (Disaster Recovery)

Se o servidor for recriado do zero:
1. Conectar via SSH.
2. Executar no Mac: `./scripts/provision-new-vps.sh 200.141.17.99 root ~/.ssh/id_rsa_mct_deploy`.
3. O script cria o swapfile, instala o Docker, cria as redes de ilhas, sobe os bancos, descriptografa o backup com a `APP_MASTER_KEY` e inicializa todos os 9 containers automaticamente.
