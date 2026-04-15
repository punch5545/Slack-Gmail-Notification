#!/bin/bash
# DSM 초기 셋업 스크립트
# Synology DSM에 SSH 접속 후 실행

set -euo pipefail

APP_DIR="/volume1/docker/gmail-slack-bot"
GITHUB_REPO="${1:?Usage: $0 <github-username/repo-name>}"

echo "=== Gmail Slack Bot - DSM Setup ==="

# 1. 디렉토리 생성
echo "[1/4] Creating app directory..."
sudo mkdir -p "$APP_DIR"
cd "$APP_DIR"

# 2. docker-compose.yml 생성
echo "[2/4] Writing docker-compose.yml..."
cat > docker-compose.yml << 'COMPOSE'
services:
  gmail-slack-bot:
    image: ghcr.io/REPO_PLACEHOLDER:latest
    container_name: gmail-slack-bot
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - TOKEN_PATH=/app/data/google-token.json
    volumes:
      - gmail-bot-data:/app/data
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  gmail-bot-data:
COMPOSE

# Replace placeholder with actual repo
sed -i "s|REPO_PLACEHOLDER|${GITHUB_REPO}|g" docker-compose.yml

# 3. .env 파일 생성
if [ ! -f .env ]; then
  echo "[3/4] Creating .env template..."
  cat > .env << 'ENV'
# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_USER_ID=U0123456789

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://YOUR_DSM_IP:3000/auth/google/callback

# Polling interval in milliseconds
POLL_INTERVAL=30000
ENV
  echo "  -> .env created. Edit it with your credentials before starting!"
else
  echo "[3/4] .env already exists, skipping."
fi

# 4. 완료
echo "[4/4] Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env:  nano $APP_DIR/.env"
echo "  2. Login to ghcr.io:  docker login ghcr.io"
echo "  3. Start:  cd $APP_DIR && docker compose up -d"
echo "  4. Authenticate Gmail:  http://YOUR_DSM_IP:3000/auth/google"
