#!/bin/bash
set -e

# MicroCRM Deploy Script
# Deployt die App auf microcrm (192.168.178.162)
# Container werden via Podman Quadlets (systemd) verwaltet

DEPLOY_LIB="$(cd "$(dirname "$0")/.." && pwd)/deploy-lib.sh"
source "$DEPLOY_LIB"

# ── Konfiguration ───────────────────────────────────────────────────────────
REMOTE="microcrm"
REMOTE_USER="microcrm"
APP_DIR="/home/microcrm/app"
IMAGE="microcrm-app"
LOCAL_APP="$(dirname "$0")/app"
SSH_CMD="ssh $REMOTE"
RSYNC_SSH="ssh"

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

# ── SSH prüfen ──────────────────────────────────────────────────────────────
ensure_ssh "$SSH_CMD"

# ── Sync App ────────────────────────────────────────────────────────────────
echo "==> Syncing files..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='db-data' \
  -e "$RSYNC_SSH" \
  "$LOCAL_APP/" "$REMOTE:/tmp/crm-deploy/"

ssh "$REMOTE" "sudo -u $REMOTE_USER rsync -a --delete /tmp/crm-deploy/ $APP_DIR/ && rm -rf /tmp/crm-deploy"

# ── Sync Nginx Config ───────────────────────────────────────────────────────
echo "==> Syncing nginx config..."
scp "$(dirname "$0")/nginx.conf" "$REMOTE:/tmp/nginx.conf"
ssh "$REMOTE" "sudo cp /tmp/nginx.conf /srv/microcrm/nginx.conf && rm /tmp/nginx.conf"

# ── Sync Certs ──────────────────────────────────────────────────────────────
echo "==> Syncing certs (if present)..."
if [ -d "$(dirname "$0")/certs" ]; then
  scp "$(dirname "$0")"/certs/*.pem "$REMOTE:/tmp/"
  ssh "$REMOTE" "sudo mkdir -p /home/$REMOTE_USER/certs && sudo cp /tmp/cert.pem /tmp/key.pem /home/$REMOTE_USER/certs/ && sudo chown $REMOTE_USER:users /home/$REMOTE_USER/certs/cert.pem /home/$REMOTE_USER/certs/key.pem && sudo rm -f /tmp/cert.pem /tmp/key.pem"
fi

# ── Sync Callmonitor ────────────────────────────────────────────────────────
echo "==> Syncing callmonitor..."
rsync -az --delete \
  -e "$RSYNC_SSH" \
  "$(dirname "$0")/callmonitor/" "$REMOTE:/tmp/crm-callmonitor/"
ssh "$REMOTE" "sudo -u $REMOTE_USER mkdir -p /home/$REMOTE_USER/callmonitor && sudo -u $REMOTE_USER rsync -a --delete /tmp/crm-callmonitor/ /home/$REMOTE_USER/callmonitor/ && rm -rf /tmp/crm-callmonitor"

run_remote "mkdir -p /home/$REMOTE_USER/uploads"

# ── Build ────────────────────────────────────────────────────────────────────
echo "==> Building app image..."
run_remote "podman build --security-opt label=disable -t $IMAGE $APP_DIR/"

echo "==> Building callmonitor image..."
run_remote "podman build --security-opt label=disable -t microcrm-callmonitor /home/$REMOTE_USER/callmonitor/"

# ── Restart Services ─────────────────────────────────────────────────────────
remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-app.service"
wait_for_service "microcrm-app.service" 30

remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-callmonitor.service"
wait_for_service "microcrm-callmonitor.service" 20

remote_restart_sudo "$SSH_CMD" "$REMOTE_USER" "microcrm-proxy.service"
wait_for_service "microcrm-proxy.service" 15

# ── Health Check ─────────────────────────────────────────────────────────────
echo "==> Health-Check..."
if ssh "$REMOTE" "curl -sf --max-time 10 http://localhost/ > /dev/null 2>&1"; then
  echo "  ✓ App erreichbar"
else
  echo "  ✗ App nicht erreichbar!" >&2
  ssh "$REMOTE" "sudo -u $REMOTE_USER -i bash -c 'XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user status microcrm-app.service microcrm-proxy.service --no-pager -l'" 2>&1 | tail -30
  exit 1
fi

echo "==> Deploy complete!"
