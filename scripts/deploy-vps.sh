#!/usr/bin/env bash

# Deploy the current local bot code and .env to the OVH VPS, then restart it.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="$PROJECT_DIR/.secrets/ovh_geth_events_ed25519"
VPS_USER="ubuntu"
VPS_HOST="51.195.20.204"
REMOTE_DIR="/home/$VPS_USER/geth-events-bot"
IMAGE="geth-events-bot_bot:latest"
CONTAINER="geth-events-bot"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

rsync -az \
  --exclude '.git' \
  --exclude '.secrets' \
  --exclude 'node_modules' \
  -e "ssh -i $SSH_KEY" \
  "$PROJECT_DIR/" \
  "$VPS_USER@$VPS_HOST:$REMOTE_DIR/"

ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "bash -s" <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/geth-events-bot
sudo docker rm -f geth-events-bot >/dev/null 2>&1 || true
sudo docker build -t geth-events-bot_bot:latest .
sudo docker run -d \
  --name geth-events-bot \
  --restart unless-stopped \
  --init \
  --env-file .env \
  -e NODE_ENV=production \
  -e TZ=Europe/Minsk \
  geth-events-bot_bot:latest
sleep 2
sudo docker ps --filter name=geth-events-bot
sudo docker logs --tail=50 geth-events-bot
REMOTE
