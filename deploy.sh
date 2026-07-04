#!/bin/bash
set -e

# MicroCRM Deploy Script
# Deployt die App auf microcrm (172.20.20.26)
# Container werden via Podman Quadlets (systemd) verwaltet

DEPLOY_LIB="$(cd "$(dirname "$0")/.." && pwd)/deploy-lib.sh"
source "$DEPLOY_LIB"

# ── Konfiguration ───────────────────────────────────────────────────────────
REMOTE="microcrm"
REMOTE_USER="microcrm"
APP_DIR="/home/microcrm/app"
IMAGE="microcrm-app"
LOCAL_APP="$(dirname "$0")/app"
LOCAL_CALLMONITOR="$(dirname "$0")/callmonitor"
LOCAL_SIP_GATEWAY="$(dirname "$0")/sip-gateway"
SSH_CMD="ssh $REMOTE"
RSYNC_SSH="ssh"
CALLMONITOR_HASH_FILE="$(dirname "$0")/.callmonitor-hash"
SIP_GATEWAY_HASH_FILE="$(dirname "$0")/.sip-gateway-hash"

deploy_timer_start "$(dirname "$0")/.deploy-stats"

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
deploy_timer "checks"

# ── Sync App (direkt nach $APP_DIR, kein /tmp/ Umweg) ──────────────────────
echo "==> Syncing app files..."
rsync -az --checksum --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='db-data' \
  --rsync-path="sudo -u $REMOTE_USER rsync" \
  -e "$RSYNC_SSH" \
  "$LOCAL_APP/" "$REMOTE:$APP_DIR/"
deploy_timer "sync app"

# ── Sync Nginx Config (nur wenn geändert) ──────────────────────────────────
PROXY_CHANGED=false
scp "$(dirname "$0")/nginx.conf" "$REMOTE:/tmp/nginx.conf"
if ! ssh "$REMOTE" "diff -q /tmp/nginx.conf /srv/microcrm/nginx.conf >/dev/null 2>&1"; then
  PROXY_CHANGED=true
  echo "==> Syncing nginx config (geändert)..."
  ssh "$REMOTE" "sudo cp /tmp/nginx.conf /srv/microcrm/nginx.conf && rm /tmp/nginx.conf"
else
  echo "==> Nginx config unverändert, skip."
  ssh "$REMOTE" "rm /tmp/nginx.conf"
fi

# ── Sync Certs ──────────────────────────────────────────────────────────────
echo "==> Syncing certs (if present)..."
if [ -d "$(dirname "$0")/certs" ]; then
  scp "$(dirname "$0")"/certs/*.pem "$REMOTE:/tmp/"
  ssh "$REMOTE" "sudo mkdir -p /home/$REMOTE_USER/certs && sudo cp /tmp/cert.pem /tmp/key.pem /home/$REMOTE_USER/certs/ && sudo chown $REMOTE_USER:users /home/$REMOTE_USER/certs/cert.pem /home/$REMOTE_USER/certs/key.pem && sudo rm -f /tmp/cert.pem /tmp/key.pem"
fi

# ── Sync + Build Callmonitor (nur wenn geändert) ────────────────────────────
CALLMONITOR_HASH=$(find "$LOCAL_CALLMONITOR" -type f -exec md5 -q {} \; 2>/dev/null | sort | md5 -q)
OLD_HASH=$(cat "$CALLMONITOR_HASH_FILE" 2>/dev/null || echo "")
CALLMONITOR_CHANGED=false

if [ "$CALLMONITOR_HASH" != "$OLD_HASH" ]; then
  CALLMONITOR_CHANGED=true
  echo "==> Syncing callmonitor (geändert)..."
  rsync -az --checksum --delete \
    --rsync-path="sudo -u $REMOTE_USER rsync" \
    -e "$RSYNC_SSH" \
    "$LOCAL_CALLMONITOR/" "$REMOTE:/home/$REMOTE_USER/callmonitor/"
  echo "$CALLMONITOR_HASH" > "$CALLMONITOR_HASH_FILE"
else
  echo "==> Callmonitor unverändert, skip."
fi
# ── Sync + Deploy SIP Gateway (nur wenn geändert) ──────────────────────────
SIP_GW_HASH=$(find "$LOCAL_SIP_GATEWAY" -type f -exec md5 -q {} \; 2>/dev/null | sort | md5 -q)
OLD_SIP_GW_HASH=$(cat "$SIP_GATEWAY_HASH_FILE" 2>/dev/null || echo "")
SIP_GW_CHANGED=false

if [ "$SIP_GW_HASH" != "$OLD_SIP_GW_HASH" ]; then
  SIP_GW_CHANGED=true
  echo "==> Syncing SIP gateway (geändert)..."
  rsync -az --checksum --delete \
    --exclude='kamailio-config' \
    --rsync-path="sudo -u $REMOTE_USER rsync" \
    -e "$RSYNC_SSH" \
    "$LOCAL_SIP_GATEWAY/" "$REMOTE:/home/$REMOTE_USER/sip-gateway/"
  echo "$SIP_GW_HASH" > "$SIP_GATEWAY_HASH_FILE"
else
  echo "==> SIP gateway unverändert, skip."
fi

deploy_timer "sync nginx+certs+callmonitor+sip-gw"

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
# ── Fritzbox-IP aktuell halten (Büro-Netz umnummeriert auf 172.20.20.x) ────
FRITZBOX_IP="172.20.20.1"
ENV_FIXED=false
if ssh "$REMOTE" "sudo -u $REMOTE_USER grep -q '^FRITZBOX_HOST=' $ENV_FILE 2>/dev/null" \
   && ! ssh "$REMOTE" "sudo -u $REMOTE_USER grep -qx 'FRITZBOX_HOST=$FRITZBOX_IP' $ENV_FILE 2>/dev/null"; then
  echo "  Fixing FRITZBOX_HOST -> $FRITZBOX_IP"
  ssh "$REMOTE" "sudo -u $REMOTE_USER sed -i 's|^FRITZBOX_HOST=.*|FRITZBOX_HOST=$FRITZBOX_IP|' $ENV_FILE"
  ENV_FIXED=true
fi
deploy_timer "env check"

# ── Build ────────────────────────────────────────────────────────────────────
run_remote "podman image prune -f" >/dev/null 2>&1 || true
echo "==> Building app image..."
run_remote "podman build --security-opt label=disable -t $IMAGE $APP_DIR/"
deploy_timer "build app"

if [ "$CALLMONITOR_CHANGED" = true ]; then
  echo "==> Building callmonitor image..."
  run_remote "podman build --security-opt label=disable -t microcrm-callmonitor /home/$REMOTE_USER/callmonitor/"
  deploy_timer "build callmonitor"
else
  echo "==> Callmonitor build: skip (unverändert)"
fi

# ── Restart Services ─────────────────────────────────────────────────────────
echo "==> Restarting services..."
remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-app.service"
wait_for_service "microcrm-app.service" 30
deploy_timer "restart app"

if [ "$CALLMONITOR_CHANGED" = true ] || [ "$ENV_FIXED" = true ]; then
  remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-callmonitor.service"
  wait_for_service "microcrm-callmonitor.service" 20
  deploy_timer "restart callmonitor"
fi

if [ "$SIP_GW_CHANGED" = true ]; then
  echo "==> Restarting SIP gateway..."
  # Prepare kamailio-config dir (copy kamailio.cfg + extract missing files from image)
  run_remote "mkdir -p /home/$REMOTE_USER/sip-gateway/kamailio-config && cp /home/$REMOTE_USER/sip-gateway/kamailio.cfg /home/$REMOTE_USER/sip-gateway/kamailio-config/kamailio.cfg"
  if ! ssh "$REMOTE" "sudo -u $REMOTE_USER test -f /home/$REMOTE_USER/sip-gateway/kamailio-config/kamctlrc" 2>/dev/null; then
    echo "  Extracting kamctlrc + tls.cfg from image..."
    run_remote "podman create --name sip-tmp ghcr.io/florian-h05/webrtc-sip-gw && podman cp sip-tmp:/etc/kamailio/kamctlrc /home/$REMOTE_USER/sip-gateway/kamailio-config/kamctlrc && podman cp sip-tmp:/etc/kamailio/tls.cfg /home/$REMOTE_USER/sip-gateway/kamailio-config/tls.cfg && podman rm sip-tmp"
  fi
  remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-sip-gw.service"
  wait_for_service "microcrm-sip-gw.service" 20
  deploy_timer "restart sip-gw"
fi

if [ "$PROXY_CHANGED" = true ]; then
  remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-proxy.service"
  wait_for_service "microcrm-proxy.service" 15
  deploy_timer "restart proxy"
else
  echo "==> Proxy restart: skip (unverändert)"
fi

# ── Health Check ─────────────────────────────────────────────────────────────
echo "==> Health-Check..."
if ssh "$REMOTE" "curl -sf --max-time 10 http://localhost/ > /dev/null 2>&1"; then
  echo "  ✓ App erreichbar"
else
  echo "  ✗ App nicht erreichbar!" >&2
  ssh "$REMOTE" "sudo -u $REMOTE_USER -i bash -c 'XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user status microcrm-app.service microcrm-proxy.service --no-pager -l'" 2>&1 | tail -30
  exit 1
fi
deploy_timer "health check"

deploy_timer_summary
