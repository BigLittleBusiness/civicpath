#!/usr/bin/env bash
set -euo pipefail

# Run on the Binary Lane Ubuntu server after cloning this repository to
# /var/www/civicpath and creating api/.env from api/.env.example.
# This script deliberately does not create DNS records, request certificates,
# seed a production demo user or configure paid third-party services.

APP_DIR=/var/www/civicpath
source "$HOME/.nvm/nvm.sh"

cd "$APP_DIR/api"
npm ci --omit=dev
npm run db:migrate

cd "$APP_DIR/frontend"
npm ci --legacy-peer-deps
npm run build

cd "$APP_DIR"
pm2 startOrReload infra/ecosystem.config.cjs --env production
pm2 save

echo "CivicPath application build complete. Install the reviewed Nginx configuration and configure TLS before exposing app.civicpath.com.au."

