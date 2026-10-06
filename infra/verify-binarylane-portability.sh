#!/usr/bin/env bash
# Verify that the standalone CivicPath SaaS application is ready for Binary Lane deployment.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for required in \
  infra/deploy-binarylane.sh \
  infra/configure-binarylane-nginx-ssl.sh \
  api/.env.binarylane.example \
  api/db/migrate.mjs \
  api/db/migrations/006_public_contact_and_altcha.mjs \
  api/db/migrations/008_council_proof_confirmation_delivery.mjs \
  api/db/migrations/009_strategy_delivery_workspace.mjs \
  api/db/migrations/010_stripe_account_billing_lifecycle.mjs \
  api/db/migrations/011_billing_invoice_tax_amounts.mjs \
  api/db/migrations/012_council_people_access.mjs \
  api/db/migrations/013_self_service_operations.mjs; do
  [ -f "$required" ] || { printf 'Missing Binary Lane deployment file: %s\n' "$required" >&2; exit 1; }
done

if grep -RInE --exclude-dir=node_modules --exclude-dir=build --exclude-dir=.git --exclude='*.map' \
  'manus-storage|manus-runtime|manus\.space|VITE_FRONTEND_FORGE|VITE_OAUTH_PORTAL' \
  api frontend 2>/dev/null; then
  printf 'Managed-hosting runtime reference found in standalone application source.\n' >&2
  exit 1
fi

bash -n infra/deploy-binarylane.sh
bash -n infra/configure-binarylane-nginx-ssl.sh
node --check api/src/index.js
node --check api/src/config/env.js
printf 'CivicPath application Binary Lane portability verification passed.\n'
