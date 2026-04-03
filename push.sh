#!/bin/bash
# MicroCRM – Push (CI only)
# Pushes to GitHub. No CI checks configured yet.
# Usage: ./push.sh

set -e

DEPLOY_LIB="$(cd "$(dirname "$0")/.." && pwd)/deploy-lib.sh"
source "$DEPLOY_LIB"

deploy_push

echo ""
deploy_wait_ci "justintoenjes/t-njescrm"
