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
                       └───┬───────────┬───────────┬───┘
                           │           │           │
        ┌──────────────────┴──┐     ┌──┴──────┐ ┌──┴──────────────────┐
        │  sos-sales-network  │     │ plx-net │ │    luma-network     │
        ▼                     ▼     ▼         ▼ ▼                     ▼
   ┌─────────────────┐  ┌─────────┐ ┌─────────┐ ┌─────────────────┐  ┌─────────┐
   │ Chat Sales V3   │  │Postgres │ │ n8n     │ │ LUMA OS App     │  │Postgres │
   │ (API, Web, Work)│  │+ Redis  │ │ Engine  │ │ (Agendamento &  │  │(luma-db)│
   │ + WAHA Engine   │  │(v3_data)│ │(plx-db) │ │  Gestão Salão)  │  │         │
   └─────────────────┘  └─────────┘ └─────────┘ └─────────────────┘  └─────────┘
      [ ILHA 1: Chat Sales V3 ]      [ ILHA 2: PLX ]       [ ILHA 3: LUMA OS ]
```

---

## 2. As 7 Regras de Ouro Invioláveis (P0)

1. **PROIBIDO EXPOR PORTAS DE BANCOS OU REDIS NO HOST:**
   - O firewall UFW está ativo com `default deny incoming`. Apenas portas **22** (SSH), **80** (HTTP) e **443** (HTTPS) podem escutar no `0.0.0.0`.
   - NUNCA suba um container usando `-p 5432:5432` ou `-p 6379:6379`. Os containers comunicam-se exclusivamente pelo nome do serviço na rede interna.
2. **ZERO PERDA DE DADOS (PRESERVAÇÃO ESTRITA DE VOLUMES):**
   - NUNCA execute `docker compose down -v` nem `docker volume prune -f`.
   - NUNCA apague arquivos em `/opt/sos-sales/backups/daily/`.
3. **ISOLAMENTO DE NOVAS FERRAMENTAS (ARQUITETURA DE ILHAS):**
   - Para rodar uma nova aplicação, crie SEMPRE um diretório próprio em `/opt/<nome-da-ferramenta>/` com um `docker-compose.yml` dedicado e uma rede Docker isolada (ex: `luma-network`).
4. **ROTEAMENTO PÚBLICO EXCLUSIVO VIA CADDY:**
   - Para expor um serviço publicamente, conecte o container `sos-sales-caddy` à rede da nova ferramenta:
     `docker network connect <sua-rede> sos-sales-caddy`
   - Adicione o bloco correspondente em `/opt/sos-sales/Caddyfile` e execute `caddy-reload`.
5. **ORÇAMENTO DE MEMÓRIA (TETO POR ILHA):**
   - Capacidade total: 16 GB RAM + 4 GB Swap.
   - Teto Ilha Chat Sales: 7.5 GB (WAHA 2.5 GB, Worker 1.5 GB, Postgres 1.5 GB, API 1.0 GB, Web/Redis 1.0 GB).
   - Teto Ilha PLX / n8n: 4.0 GB (n8n 3.0 GB, Postgres 1.0 GB).
   - Teto Ilha LUMA OS: 2.0 GB (Luma App 1.0 GB, Postgres 1.0 GB).
   - Borda Caddy e Sistema Operacional: 2.5 GB.
   - **Garantia:** Se qualquer processo apresentar memory leak, o Docker encerra apenas o container infrator, mantendo as outras duas ilhas e a VPS 100% íntegras.
6. **TRUTH IN DATA (SEM DADOS FICTÍCIOS OU MOCKS):**
   - Não crie bancos de testes que colidam com as bases de produção (`sos_sales_v3`, `plx_n8n`, `luma_os`).
7. **BACKUP OBRIGATÓRIO ANTES DE MANUTENÇÃO:**
   - Antes de aplicar migrações manuais ou updates grandes, execute o comando `vps-backup`.

---

## 3. Mapa de Serviços Ativos na VPS (11 Containers)

| Container | Imagem | Finalidade | Rede Docker | Porta Interna | Limite RAM |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sos-sales-caddy` | `caddy:2-alpine` | Borda TLS automático / Ingress | `sos-sales-network`, `plx-network`, `luma-network` | `80`, `443` (host) | 512 MB |
| `chat-sales-web` | `chat-sales-v3-web:latest` | Frontend React/Vite Cockpit Nginx | `sos-sales-network` | `80` (interno) | 512 MB |
| `chat-sales-api` | `chat-sales-v3-api:latest` | Fastify 5 API e Webhooks | `sos-sales-network` | `4400` (interno) | 1024 MB |
| `chat-sales-worker` | `chat-sales-v3-worker:latest` | Outbox to Dispatcher Worker | `sos-sales-network` | — | 1536 MB |
| `sos-sales-postgres` | `postgres:16-alpine` | PostgreSQL 16 Soberano | `sos-sales-network` | `5432` (interno) | 1536 MB |
| `sos-sales-redis` | `redis:7-alpine` | Redis 7 Caching, Filas e Pub/Sub | `sos-sales-network` | `6379` (interno) | 512 MB |
| `sos-sales-waha` | `devlikeapro/waha:latest-2026.8.2` | WhatsApp Engine com sessões | `sos-sales-network` | `3000` (interno) | 2560 MB |
| `n8n` | `docker.n8n.io/n8nio/n8n:latest` | Motor de Automações PLX v2.43.8 | `plx-network` | `5678` (interno) | 3072 MB |
| `plx-n8n-db` | `postgres:16-alpine` | Banco de dados do n8n (148 tabelas) | `plx-network` | `5432` (interno) | 1024 MB |
| `luma-app` | `luma-os-luma-app:latest` | Cockpit e API do LUMA OS | `luma-network` | `3000` (interno) | 1024 MB |
| `luma-db` | `postgres:16-alpine` | PostgreSQL 16 dedicado LUMA OS | `luma-network` | `5432` (interno) | 1024 MB |

---

## 4. Domínios Oficiais Ativos

| Subdomínio | Destino Caddy | Aplicação |
| :--- | :--- | :--- |
| `chat.automatizaprocessos.tech` | `chat-sales-web:80` + `chat-sales-api:4400` + `sos-sales-waha:3000` | Ilha 1: Cockpit Comercial Chat Sales V3 |
| `automacao.automatizaprocessos.tech` | `n8n:5678` | Ilha 2: Painel n8n PLX Automações B2B |
| `luma.automatizaprocessos.tech` | `luma-app:3000` | Ilha 3: LUMA OS (Salões, Clínicas e Spas) |
| `automatizaprocessos.tech` | `/var/www/landing` | Landing Page Oficial institucional |
| `www.automatizaprocessos.tech` | `/var/www/landing` | Redirecionamento da Landing |

---

## 5. Comandos Utilitários no Terminal do Host (`/usr/local/bin`)

Ao conectar via SSH (`ssh root@200.141.17.99`), os seguintes comandos globais estão prontos para uso:

```bash
# 1. Diagnóstico completo em tempo real de todas as 3 ilhas
vps-status

# 2. Backup manual instantâneo dos 3 bancos (AES-256)
vps-backup

# 3. Reiniciar graciosamente o Chat Sales V3 (Ilha 1)
chat-sales-restart

# 4. Reiniciar o n8n e o banco PLX (Ilha 2)
plx-restart

# 5. Reiniciar o LUMA OS (Ilha 3)
luma-restart

# 6. Recarregar o Caddy sem downtime
caddy-reload

# 7. Exportar qualquer ilha para migração 1-click para nova VPS
export-island <chat-sales | plx | luma>
```

---

## 6. Protocolo de Migração para VPS Própria (1-Click Decoupling)

Quando qualquer um dos três produtos atingir tração financeira e justificar uma VPS exclusiva:

1. **Na VPS Atual (`200.141.17.99`):**
   ```bash
   export-island luma  # (ou plx, ou chat-sales)
   ```
   O comando gera um pacote autocontido em `/opt/sos-sales/backups/migrations/<ilha>_migration_<timestamp>.tar.gz` contendo o dump atômico do PostgreSQL, todos os arquivos de configuração `.env`, `docker-compose.yml`, código e o instalador automático `setup-new-vps.sh`.

2. **Transferir para a Nova VPS:**
   ```bash
   rsync -avzP /opt/sos-sales/backups/migrations/<ilha>_migration_<timestamp>.tar.gz root@<NOVO_IP>:/root/
   ```

3. **Na Nova VPS:**
   ```bash
   cd /root && tar -xzf <ilha>_migration_<timestamp>.tar.gz
   cd bundle-<ilha>-* && bash setup-new-vps.sh
   ```
   O script instala o Docker, configura o firewall UFW, restaura o banco de dados e inicializa os containers em menos de 60 segundos.

4. **Virar o Apontamento DNS na Hostinger:**
   No hPanel ou via Hostinger API, altere o registro `A` do subdomínio para o `<NOVO_IP>`.

5. **Descomissionar na VPS Antiga:**
   ```bash
   cd /opt/<ilha> && docker compose down -v
   # Remover o bloco do subdomínio no /opt/sos-sales/Caddyfile e rodar caddy-reload
   ```
   **Zero atrito, zero interferência nas outras ilhas remanescentes.**
