#!/usr/bin/env bash
# Verify that the deployable marketing source has no managed-hosting runtime dependency.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for required in \
  client/public/assets/civicpath-gate.webp \
  client/public/assets/civicpath-hero-regional-strategy.webp \
  client/public/assets/civicpath-project-readiness.webp \
  client/public/assets/civicpath-partnership-workshop.webp; do
  [ -f "$required" ] || { printf 'Missing local asset: %s\n' "$required" >&2; exit 1; }
done

if grep -RInE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.manus-logs --exclude-dir=dist --exclude='*.map' \
  'vite-plugin-manus-runtime|vitePluginManusRuntime|manus-storage|manus-analytics|VITE_FRONTEND_FORGE|VITE_OAUTH_PORTAL' \
  client package.json vite.config.ts README.md 2>/dev/null; then
  printf 'Managed-hosting runtime references remain in deployable source.\n' >&2
  exit 1
fi

pnpm run check
pnpm run build
printf 'CivicPath marketing portability verification passed.\n'
