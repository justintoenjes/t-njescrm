#!/bin/bash
# MicroCRM – Push + Deploy
# Pushes to GitHub, then deploys to production.
# Usage: ./push+deploy.sh

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== PUSH ==="
if ! "$DIR/push.sh"; then
  echo "✗ Push fehlgeschlagen – Deploy abgebrochen"
  exit 1
fi

echo ""
echo "=== DEPLOY ==="
"$DIR/deploy.sh"
