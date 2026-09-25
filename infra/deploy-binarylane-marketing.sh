#!/usr/bin/env bash
# Build and install the CivicPath public marketing site on Binary Lane.
# Run from a reviewed checkout of the marketing branch using sudo.
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-/var/www/civicpath-marketing-source}"
WEB_ROOT="${WEB_ROOT:-/var/www/civicpath-marketing}"

[ "$(id -u)" -eq 0 ] || { echo "Run through sudo or as root." >&2; exit 1; }
[ -f "${SOURCE_DIR}/package.json" ] || { echo "Missing ${SOURCE_DIR}/package.json." >&2; exit 1; }

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
elif [ -f "/home/ubuntu/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "/home/ubuntu/.nvm/nvm.sh"
fi

command -v node >/dev/null 2>&1 || { echo "Node.js 22 is required." >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required." >&2; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "rsync is required." >&2; exit 1; }

cd "$SOURCE_DIR"
pnpm install --frozen-lockfile
pnpm run check
pnpm run build

install -d -m 0755 "$WEB_ROOT"
rsync -a --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r dist/ "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

printf 'CivicPath marketing site installed at %s. Run the reviewed Nginx/TLS configuration before public exposure.\n' "$WEB_ROOT"
