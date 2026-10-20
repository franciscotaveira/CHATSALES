#!/usr/bin/env bash
# ==============================================================================
# MCT OS v2.0 — Sovereign System Watchdog & Self-Healing Sentinel
# Checks API readiness (DB + Redis) and host disk capacity every 5 minutes.
# Automatically self-heals by restarting unresponsive containers.
# ==============================================================================

set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/chat-sales-watchdog.log}"
API_URL="${API_URL:-https://chat.automatizaprocessos.tech/ready}"
DISK_THRESHOLD="${DISK_THRESHOLD:-85}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "${LOG_FILE}"
}

# 1. Check Host Disk Usage
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if (( DISK_USAGE >= DISK_THRESHOLD )); then
  log "WARNING: Disk usage is critically high at ${DISK_USAGE}% (Threshold: ${DISK_THRESHOLD}%)!"
fi

# 2. Check API Health with 3 Retries
MAX_RETRIES=3
HEALTHY=false

for (( i=1; i<=MAX_RETRIES; i++ )); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}" || echo "000")
  if [[ "${HTTP_CODE}" == "200" ]]; then
    HEALTHY=true
    break
  fi
  sleep 3
done

if [[ "${HEALTHY}" == "true" ]]; then
  # Silent on healthy state to avoid log clutter
  exit 0
fi

# 3. Self-Healing Trigger
log "CRITICAL: Fastify API failed ${MAX_RETRIES} consecutive health probes (Last code: ${HTTP_CODE}). Initiating self-healing restart..."

if docker restart chat-sales-api; then
  log "Container chat-sales-api restarted. Waiting 10s for convergence..."
  sleep 10
  RECOVERED_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}" || echo "000")
  if [[ "${RECOVERED_CODE}" == "200" ]]; then
    log "RECOVERY SUCCESSFUL: Fastify API restored to healthy operational state."
  else
    log "ALERT: API still unhealthy after container restart (Code: ${RECOVERED_CODE}). Manual inspection required!"
  fi
else
  log "ERROR: Failed to restart chat-sales-api container."
fi
