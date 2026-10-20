#!/usr/bin/env bash
# ==============================================================================
# MCT OS v2.0 — Sovereign New VPS Provisioning & Disaster Recovery Engine
# Turnkey Zero-Downtime Deployment for Hostinger KVM 4 (Ubuntu 24.04 / 22.04)
# ==============================================================================

set -euo pipefail

NEW_IP="${1:-200.141.17.99}"
SSH_USER="${2:-root}"
SSH_KEY="${3:-${HOME}/.ssh/id_rsa_mct_deploy}"
ROOT_PASS="${4:-}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/emergency_backups"
BACKUP_FILE="${BACKUP_DIR}/sos_sales_v3_20261012_030002.sql.gz.enc"
ENV_FILE="${BACKUP_DIR}/production.env"
CADDY_FILE="${BACKUP_DIR}/Caddyfile"
WAHA_FILE="${BACKUP_DIR}/waha_sessions.tar.gz"
N8N_FILE="${BACKUP_DIR}/plx_documentos_n8n_db.sql.gz"

log() {
  echo -e "\033[1;32m[$(date -u +"%Y-%m-%dT%H:%M:%SZ")]\033[0m $*"
}

warn() {
  echo -e "\033[1;33m[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] WARN:\033[0m $*"
}

err() {
  echo -e "\033[1;31m[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ERROR:\033[0m $*"
  exit 1
}

# 1. Validação de Backups Locais
log "1. Verificando integridade dos backups locais no Mac..."
[[ -f "${BACKUP_FILE}" ]] || err "Arquivo de banco não encontrado: ${BACKUP_FILE}"
[[ -f "${ENV_FILE}" ]] || err "Arquivo .env não encontrado: ${ENV_FILE}"
[[ -f "${CADDY_FILE}" ]] || err "Arquivo Caddyfile não encontrado: ${CADDY_FILE}"

log "Backups locais validados com sucesso!"

# Determinar opção de SSH
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

if [[ -f "${SSH_KEY}" ]]; then
  SSH_CMD="ssh ${SSH_OPTS} -i ${SSH_KEY} ${SSH_USER}@${NEW_IP}"
  SCP_CMD="scp ${SSH_OPTS} -i ${SSH_KEY}"
else
  SSH_CMD="ssh ${SSH_OPTS} ${SSH_USER}@${NEW_IP}"
  SCP_CMD="scp ${SSH_OPTS}"
fi

log "2. Testando conectividade SSH com a nova VPS (${NEW_IP})..."
${SSH_CMD} "uname -a" || err "Falha ao conectar via SSH em ${SSH_USER}@${NEW_IP}"

# 3. Blindagem de Segurança do Servidor (UFW & Swap & Docker)
log "3. Configurando Swap (4GB), UFW Firewall e instalando Docker Engine..."
${SSH_CMD} bash -s << 'EOF'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# 3.1 Configuração de Swap de 4GB se não existir
if ! swapon --show | grep -q '/swapfile'; then
  echo "Criando swapfile de 4 GB para proteção contra OOM..."
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  sysctl vm.swappiness=20
  echo 'vm.swappiness=20' >> /etc/sysctl.conf || true
fi

# 3.2 Atualização do sistema e ferramentas essenciais
apt-get update -qq
apt-get install -y -qq ufw curl git jq gzip openssl ca-certificates gnupg lsb-release rsync

# 3.3 Blindagem UFW: Apenas 22, 80 e 443 expostas publicamente
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Caddy'
ufw allow 443/tcp comment 'HTTPS Caddy'
echo "y" | ufw enable || true

# 3.4 Instalação do Docker Engine e Compose
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

# 3.5 Estrutura de diretórios de produção
mkdir -p /opt/chat-sales-v3 /opt/sos-sales/backups/daily /opt/sos-sales/caddy_data /opt/sos-sales/caddy_config
chmod 700 /opt/sos-sales/backups

# 3.6 Arquitetura de Ilhas: Redes isoladas
docker network create sos-sales-network 2>/dev/null || true
docker network create plx-network 2>/dev/null || true
EOF

log "4. Transferindo arquivos de configuração e backups para a VPS..."
${SCP_CMD} "${CADDY_FILE}" "${SSH_USER}@${NEW_IP}:/opt/sos-sales/Caddyfile"
${SCP_CMD} "${BACKUP_FILE}" "${SSH_USER}@${NEW_IP}:/opt/sos-sales/backups/daily/backup_to_restore.sql.gz.enc"
if [[ -f "${WAHA_FILE}" ]]; then
  ${SCP_CMD} "${WAHA_FILE}" "${SSH_USER}@${NEW_IP}:/tmp/waha_sessions.tar.gz"
fi
if [[ -f "${N8N_FILE}" ]]; then
  ${SCP_CMD} "${N8N_FILE}" "${SSH_USER}@${NEW_IP}:/opt/sos-sales/backups/daily/plx_n8n_backup.sql.gz"
fi

# 5. Sincronizar codebase do repositório
log "5. Sincronizando monorepo do Chat Sales V3 na VPS..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.turbo' \
  --exclude 'dist' \
  --exclude 'dist-lab' \
  --exclude 'coverage' \
  --exclude 'evidencias' \
  --exclude '.env' \
  -e "ssh ${SSH_OPTS} ${SSH_KEY:+-i $SSH_KEY}" \
  "${PROJECT_ROOT}/" "${SSH_USER}@${NEW_IP}:/opt/chat-sales-v3/"

# Transferir o .env de produção oficial após o rsync para garantir integridade
log "Injetando .env de produção oficial..."
${SCP_CMD} "${ENV_FILE}" "${SSH_USER}@${NEW_IP}:/opt/chat-sales-v3/.env"

# 6. Inicializar Banco de Dados e Restaurar Dados
log "6. Inicializando PostgreSQL e restaurando banco de dados soberano (23 MB)..."
${SSH_CMD} bash -s << 'EOF'
set -euo pipefail
cd /opt/chat-sales-v3

# Iniciar container do postgres de produção na rede isolada
if ! docker ps -a --format '{{.Names}}' | grep -q '^sos-sales-postgres$'; then
  docker run -d \
    --name sos-sales-postgres \
    --restart unless-stopped \
    --network sos-sales-network \
    -e POSTGRES_USER=sos_user \
    -e POSTGRES_PASSWORD=sos_secret_lab_2026 \
    -e POSTGRES_DB=sos_sales_v3 \
    -v sos_sales_v3_pgdata:/var/lib/postgresql/data \
    postgres:16-alpine
else
  docker start sos-sales-postgres || true
fi

echo "Aguardando PostgreSQL ficar pronto para conexões..."
until docker exec sos-sales-postgres pg_isready -U sos_user -d sos_sales_v3 >/dev/null 2>&1; do
  sleep 2
done

# Criar roles fundamentais antes do restore para garantir RLS e grants
echo "Provisionando roles de segurança de dados..."
docker exec -i sos-sales-postgres psql -U sos_user -d sos_sales_v3 << 'SQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sos_migration_owner') THEN
        CREATE ROLE sos_migration_owner WITH LOGIN PASSWORD 'sos_migration_secret_2026' CREATEROLE;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sos_app_user') THEN
        CREATE ROLE sos_app_user WITH LOGIN PASSWORD 'sos_app_secret_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sos_ingress_user') THEN
        CREATE ROLE sos_ingress_user WITH LOGIN PASSWORD 'sos_ingress_secret_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sos_worker_user') THEN
        CREATE ROLE sos_worker_user WITH LOGIN PASSWORD 'sos_worker_secret_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END $$;
GRANT ALL PRIVILEGES ON DATABASE sos_sales_v3 TO sos_migration_owner;
GRANT sos_ingress_user, sos_worker_user TO sos_migration_owner;
SQL

# Extrair master key para descriptografia
MASTER_KEY=$(grep -E '^APP_MASTER_KEY=' /opt/chat-sales-v3/.env | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')

echo "Descriptografando e restaurando base de dados..."
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in /opt/sos-sales/backups/daily/backup_to_restore.sql.gz.enc \
  -pass "pass:${MASTER_KEY}" | gunzip | docker exec -i sos-sales-postgres psql -U sos_user -d sos_sales_v3 2>&1 | tail -n 15

echo "Validando contagem de registros restaurados:"
docker exec -i sos-sales-postgres psql -U sos_user -d sos_sales_v3 -c "
  SELECT 
    (SELECT COUNT(*) FROM workspaces) AS total_workspaces,
    (SELECT COUNT(*) FROM contacts) AS total_contacts,
    (SELECT COUNT(*) FROM commercial_threads) AS total_threads,
    (SELECT COUNT(*) FROM messages) AS total_messages;
"

# Iniciar Redis na rede isolada
if ! docker ps -a --format '{{.Names}}' | grep -q '^sos-sales-redis$'; then
  docker run -d \
    --name sos-sales-redis \
    --restart unless-stopped \
    --network sos-sales-network \
    -v sos_v3_redisdata:/data \
    redis:7-alpine
else
  docker start sos-sales-redis || true
fi

# Restaurar sessões WAHA e iniciar container WAHA
echo "Restaurando sessões e iniciando WAHA..."
docker volume create sos_sales_waha_sessions 2>/dev/null || true
if [[ -f /tmp/waha_sessions.tar.gz ]]; then
  docker run --rm \
    -v sos_sales_waha_sessions:/dest \
    -v /tmp/waha_sessions.tar.gz:/tmp/waha_sessions.tar.gz \
    alpine sh -c "tar -xzf /tmp/waha_sessions.tar.gz -C /dest && ls -la /dest" || true
fi

WAHA_KEY=$(grep -E '^WAHA_API_KEY=' /opt/chat-sales-v3/.env | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
WAHA_KEY=${WAHA_KEY:-mct_sos_waha_master_2026}

if ! docker ps -a --format '{{.Names}}' | grep -q '^sos-sales-waha$'; then
  docker run -d \
    --name sos-sales-waha \
    --restart unless-stopped \
    --network sos-sales-network \
    -e WHATSAPP_DEFAULT_ENGINE=WEBJS \
    -e WHATSAPP_API_KEY="${WAHA_KEY}" \
    -e WAHA_ZIP_LOGS=false \
    -e WAHA_LOG_LEVEL=info \
    -e WAHA_PRINT_QR=false \
    -e WAHA_BASE_URL=http://sos-sales-waha:3000 \
    -v sos_sales_waha_sessions:/app/.sessions \
    devlikeapro/waha:latest-2026.8.2@sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533 2>/dev/null || \
  docker run -d \
    --name sos-sales-waha \
    --restart unless-stopped \
    --network sos-sales-network \
    -e WHATSAPP_DEFAULT_ENGINE=WEBJS \
    -e WHATSAPP_API_KEY="${WAHA_KEY}" \
    -e WAHA_ZIP_LOGS=false \
    -e WAHA_LOG_LEVEL=info \
    -e WAHA_PRINT_QR=false \
    -e WAHA_BASE_URL=http://sos-sales-waha:3000 \
    -v sos_sales_waha_sessions:/app/.sessions \
    devlikeapro/waha:latest
else
  docker start sos-sales-waha || true
fi

# Iniciar Borda Caddy com TLS automático e landing montada
if ! docker ps -a --format '{{.Names}}' | grep -q '^sos-sales-caddy$'; then
  docker run -d \
    --name sos-sales-caddy \
    --restart unless-stopped \
    --network sos-sales-network \
    -p 80:80 \
    -p 443:443 \
    -v /opt/sos-sales/Caddyfile:/etc/caddy/Caddyfile:ro \
    -v /opt/chat-sales-v3/landing:/var/www/landing:ro \
    -v /opt/sos-sales/caddy_data:/data \
    -v /opt/sos-sales/caddy_config:/config \
    caddy:2-alpine
  # Conectar Caddy também à rede PLX para suportar n8n
  docker network connect plx-network sos-sales-caddy 2>/dev/null || true
else
  docker start sos-sales-caddy || true
fi

EOF

# 7. Subida Completa das Aplicações (API, Worker e Web)
log "7. Compilando e iniciando API Fastify 5, Worker Outbox e Web Cockpit..."
${SSH_CMD} bash -s << 'EOF'
set -euo pipefail
cd /opt/chat-sales-v3

docker compose -f docker-compose.prod.yml build api worker web
docker compose -f docker-compose.prod.yml up -d api worker web

sleep 8
echo "Validando status de todos os containers de produção:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

# 8. Inicialização da Ilha PLX / n8n
if [[ -f "${N8N_FILE}" ]]; then
  log "8. Inicializando Ilha de Automação PLX / n8n..."
  ${SSH_CMD} bash -s << 'EOF'
set -euo pipefail
mkdir -p /opt/plx-documentos
cd /opt/plx-documentos

cat << 'COMPOSE' > docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    container_name: plx-n8n-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: plx_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: plx_n8n
    volumes:
      - plx_n8n_pgdata:/var/lib/postgresql/data
    networks:
      - plx-network

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    environment:
      - N8N_HOST=${N8N_HOST}
      - N8N_PORT=5678
      - N8N_PROTOCOL=${N8N_PROTOCOL}
      - N8N_SECURE_COOKIE=${N8N_SECURE_COOKIE}
      - N8N_EDITOR_BASE_URL=${N8N_EDITOR_BASE_URL}
      - WEBHOOK_URL=${N8N_WEBHOOK_URL}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=plx-n8n-db
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=plx_n8n
      - DB_POSTGRESDB_USER=plx_user
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - GENERIC_TIMEZONE=${TZ}
    volumes:
      - plx_n8n_data:/home/node/.n8n
    networks:
      - plx-network
    depends_on:
      - db

networks:
  plx-network:
    external: true

volumes:
  plx_n8n_pgdata:
  plx_n8n_data:
COMPOSE

if [[ -f /opt/chat-sales-v3/emergency_backups/plx_documentos.env ]]; then
  cp /opt/chat-sales-v3/emergency_backups/plx_documentos.env /opt/plx-documentos/.env
fi

docker compose up -d db
until docker exec plx-n8n-db pg_isready -U plx_user -d plx_n8n >/dev/null 2>&1; do
  sleep 2
done

gunzip -c /opt/sos-sales/backups/daily/plx_n8n_backup.sql.gz | docker exec -i plx-n8n-db psql -U plx_user -d plx_n8n >/dev/null 2>&1 || true
docker compose up -d n8n
EOF
fi

# 9. Instalação das Ferramentas de Governança e Regras Soberanas
log "9. Instalando ferramentas de governança, crontab e manuais de operação..."
${SCP_CMD} "${PROJECT_ROOT}/docs/architecture/SOVEREIGN_VPS_OPERATING_MANUAL.md" "${SSH_USER}@${NEW_IP}:/root/SOVEREIGN_VPS_RULES.md"

${SSH_CMD} bash -s << 'EOF'
set -euo pipefail
ln -sf /root/SOVEREIGN_VPS_RULES.md /root/README_IA.md

# Configurar crontab
cat > /tmp/root_cron << "CRON"
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# 1. Backup Diário Criptografado (AES-256-CBC) às 03:00 AM
0 3 * * * /opt/chat-sales-v3/scripts/backup-database.sh >> /var/log/chat-sales-backup.log 2>&1

# 2. Watchdog de Auto-Cura & Probe de Saúde a cada 5 minutos
*/5 * * * * /opt/chat-sales-v3/scripts/healthcheck-watchdog.sh >> /var/log/chat-sales-watchdog.log 2>&1

# 3. Higiene Semanal de Cache Docker aos domingos às 04:00 AM
0 4 * * 0 docker builder prune -f --filter "until=168h" >> /var/log/docker-prune.log 2>&1
CRON
crontab /tmp/root_cron
rm /tmp/root_cron

chmod +x /opt/chat-sales-v3/scripts/backup-database.sh
chmod +x /opt/chat-sales-v3/scripts/healthcheck-watchdog.sh
EOF

log "=========================================================================="
log "🎉 MIGRAÇÃO E PROVISIONAMENTO CONCLUÍDOS COM SUCESSO!"
log "Servidor: Hostinger KVM 4 (Campinas, SP)"
log "IP: ${NEW_IP}"
log ""
log "Ações DNS para ativar a nova infraestrutura (no Cloudflare ou DNS Hostinger):"
log "  - chat.automatizaprocessos.tech      -> A -> ${NEW_IP}"
log "  - automacao.automatizaprocessos.tech -> A -> ${NEW_IP}"
log "  - automatizaprocessos.tech          -> A -> ${NEW_IP}"
log "  - www.automatizaprocessos.tech      -> A -> ${NEW_IP}"
log "=========================================================================="


