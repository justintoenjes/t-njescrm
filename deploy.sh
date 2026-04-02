#!/bin/bash
set -e

# MicroCRM Deploy Script
# Deployt die App auf microcrm (192.168.178.162)
# Container werden via Podman Quadlets (systemd) verwaltet

DEPLOY_LIB="$(cd "$(dirname "$0")/.." && pwd)/deploy-lib.sh"
source "$DEPLOY_LIB"

# ── Timing ──────────────────────────────────────────────────────────────────
DEPLOY_START=$(date +%s)
deploy_timer_start "$(dirname "$0")/.deploy-timing.log"

step_timer() {
  local now=$(date +%s)
  local elapsed=$(( now - DEPLOY_START ))
  local msg="$1"
  deploy_timer "$msg"
  printf "  ⏱  %3ds  %s\n" "$elapsed" "$msg"
}

# ── Konfiguration ───────────────────────────────────────────────────────────
REMOTE="microcrm"
REMOTE_USER="microcrm"
APP_DIR="/home/microcrm/app"
IMAGE="microcrm-app"
LOCAL_APP="$(dirname "$0")/app"
LOCAL_CALLMONITOR="$(dirname "$0")/callmonitor"
SSH_CMD="ssh $REMOTE"
RSYNC_SSH="ssh"
CALLMONITOR_HASH_FILE="$(dirname "$0")/.callmonitor-hash"

# ── Hilfsfunktionen (CRM-spezifisch: sudo) ─────────────────────────────────
run_remote() {
  ssh "$REMOTE" "sudo -u $REMOTE_USER sh -c 'cd /home/$REMOTE_USER && $1'"
}

wait_for_service() {
  local service=$1
  local max=${2:-30}
  echo "  Warte auf $service..."
  for i in $(seq 1 $max); do
    if ssh "$REMOTE" "sudo -u $REMOTE_USER -i bash -c 'XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user is-active $service'" 2>/dev/null | grep -q "^active$"; then
      echo "  ✓ $service läuft"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ $service startet nicht nach ${max}s!" >&2
  ssh "$REMOTE" "sudo -u $REMOTE_USER -i bash -c 'XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user status $service --no-pager -l'" 2>&1 | tail -20
  exit 1
}

# ── Checks ──────────────────────────────────────────────────────────────────
ensure_committed
ensure_ssh "$SSH_CMD"
step_timer "checks"

# ── Sync App (direkt nach $APP_DIR, kein /tmp/ Umweg) ──────────────────────
echo "==> Syncing app files..."
rsync -az --checksum --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='db-data' \
  --rsync-path="sudo -u $REMOTE_USER rsync" \
  -e "$RSYNC_SSH" \
  "$LOCAL_APP/" "$REMOTE:$APP_DIR/"
step_timer "sync app"

# ── Sync Nginx + Certs + Callmonitor (parallel) ────────────────────────────
echo "==> Syncing nginx, certs, callmonitor (parallel)..."
SYNC_PIDS=()

# Nginx config
(
  scp "$(dirname "$0")/nginx.conf" "$REMOTE:/tmp/nginx.conf"
  ssh "$REMOTE" "sudo cp /tmp/nginx.conf /srv/microcrm/nginx.conf && rm /tmp/nginx.conf"
) &
SYNC_PIDS+=($!)

# Certs (if present)
if [ -d "$(dirname "$0")/certs" ]; then
  (
    scp "$(dirname "$0")"/certs/*.pem "$REMOTE:/tmp/"
    ssh "$REMOTE" "sudo mkdir -p /home/$REMOTE_USER/certs && sudo cp /tmp/cert.pem /tmp/key.pem /home/$REMOTE_USER/certs/ && sudo chown $REMOTE_USER:users /home/$REMOTE_USER/certs/cert.pem /home/$REMOTE_USER/certs/key.pem && sudo rm -f /tmp/cert.pem /tmp/key.pem"
  ) &
  SYNC_PIDS+=($!)
fi

# Callmonitor (nur wenn geändert)
CALLMONITOR_HASH=$(find "$LOCAL_CALLMONITOR" -type f -exec md5 -q {} \; 2>/dev/null | sort | md5 -q)
OLD_HASH=$(cat "$CALLMONITOR_HASH_FILE" 2>/dev/null || echo "")
CALLMONITOR_CHANGED=false

if [ "$CALLMONITOR_HASH" != "$OLD_HASH" ]; then
  CALLMONITOR_CHANGED=true
  (
    rsync -az --checksum --delete \
      --rsync-path="sudo -u $REMOTE_USER rsync" \
      -e "$RSYNC_SSH" \
      "$LOCAL_CALLMONITOR/" "$REMOTE:/home/$REMOTE_USER/callmonitor/"
  ) &
  SYNC_PIDS+=($!)
  echo "$CALLMONITOR_HASH" > "$CALLMONITOR_HASH_FILE"
  echo "  callmonitor: geändert, syncing"
else
  echo "  callmonitor: unverändert, skip"
fi

# Warte auf alle parallelen Syncs
for pid in "${SYNC_PIDS[@]}"; do
  wait "$pid" || { echo "✗ Ein Sync-Job ist fehlgeschlagen!"; exit 1; }
done
step_timer "sync nginx+certs+callmonitor"

run_remote "mkdir -p /home/$REMOTE_USER/uploads"

# ── Ensure VAPID + Push env vars ───────────────────────────────────────────
echo "==> Checking push notification env vars..."
ENV_FILE="/home/$REMOTE_USER/.env"
if ! ssh "$REMOTE" "sudo -u $REMOTE_USER grep -q VAPID_PUBLIC_KEY $ENV_FILE 2>/dev/null"; then
  echo "  Adding VAPID keys + PUSH_CRON_SECRET..."
  ssh "$REMOTE" "sudo -u $REMOTE_USER bash -c 'cat >> $ENV_FILE'" <<'ENVEOF'

# Push Notifications (VAPID)
VAPID_PUBLIC_KEY=BIjEtIWYwEJ9bc9ErKmL0VYOCDqoKOyXE2QVzE20I0RtAsgYEbrTvIBFsZiznSqdMhCwxi9zBlKlcHXlOdEOPiw
VAPID_PRIVATE_KEY=p4rgnvztuqSn7dZNfMJO8cSJjd9S0IEA-Lmg3cXNyH8
VAPID_EMAIL=mailto:info@toenjes-consulting.de
PUSH_CRON_SECRET=e2c0a8f190faff66ed09b45e68d9b91bec1122c21d9806751594156becefdd3b
ENVEOF
  echo "  ✓ VAPID keys added"
else
  echo "  ✓ Already configured"
fi
step_timer "env check"

# ── Build ────────────────────────────────────────────────────────────────────
echo "==> Building app image..."
run_remote "podman build --security-opt label=disable -t $IMAGE $APP_DIR/"
step_timer "build app"

if [ "$CALLMONITOR_CHANGED" = true ]; then
  echo "==> Building callmonitor image..."
  run_remote "podman build --security-opt label=disable -t microcrm-callmonitor /home/$REMOTE_USER/callmonitor/"
  step_timer "build callmonitor"
else
  echo "==> Callmonitor build: skip (unverändert)"
fi

# ── Restart Services (parallel wo möglich) ───────────────────────────────────
echo "==> Restarting services..."
remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-app.service"

# Callmonitor + Proxy parallel starten (unabhängig von App)
if [ "$CALLMONITOR_CHANGED" = true ]; then
  remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-callmonitor.service" &
  CM_PID=$!
fi
remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-proxy.service" &
PROXY_PID=$!

wait_for_service "microcrm-app.service" 30
step_timer "restart app"

if [ "$CALLMONITOR_CHANGED" = true ]; then
  wait $CM_PID
  wait_for_service "microcrm-callmonitor.service" 20
  step_timer "restart callmonitor"
fi
wait $PROXY_PID
wait_for_service "microcrm-proxy.service" 15
step_timer "restart proxy"

# ── Health Check ─────────────────────────────────────────────────────────────
echo "==> Health-Check..."
if ssh "$REMOTE" "curl -sf --max-time 10 http://localhost/ > /dev/null 2>&1"; then
  echo "  ✓ App erreichbar"
else
  echo "  ✗ App nicht erreichbar!" >&2
  ssh "$REMOTE" "sudo -u $REMOTE_USER -i bash -c 'XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user status microcrm-app.service microcrm-proxy.service --no-pager -l'" 2>&1 | tail -30
  exit 1
fi
step_timer "health check"

TOTAL=$(( $(date +%s) - DEPLOY_START ))
echo ""
echo "==> Deploy complete! (${TOTAL}s total)"
