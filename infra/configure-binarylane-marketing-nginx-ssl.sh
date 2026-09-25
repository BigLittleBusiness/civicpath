#!/usr/bin/env bash
# Configure Nginx and Let's Encrypt for www.civicpath.com.au on Binary Lane.
set -euo pipefail

SITE_DOMAIN="${SITE_DOMAIN:-www.civicpath.com.au}"
APEX_DOMAIN="${APEX_DOMAIN:-civicpath.com.au}"
WEB_ROOT="${WEB_ROOT:-/var/www/civicpath-marketing}"
ACME_WEBROOT="${ACME_WEBROOT:-/var/www/acme-challenge}"
SITE_AVAILABLE="/etc/nginx/sites-available/civicpath-marketing"
SITE_ENABLED="/etc/nginx/sites-enabled/civicpath-marketing"
EMAIL=""
STAGING=false
SKIP_CERTBOT=false

usage() {
  cat <<'USAGE'
Usage: sudo ./infra/configure-binarylane-marketing-nginx-ssl.sh --email <admin-email> [--staging] [--skip-certbot]

Requires both civicpath.com.au and www.civicpath.com.au DNS A records to point to this Binary Lane server.
USAGE
}

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --email) [ "$#" -ge 2 ] || fail "--email requires a value"; EMAIL="$2"; shift 2 ;;
    --staging) STAGING=true; shift ;;
    --skip-certbot) SKIP_CERTBOT=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || fail "Run through sudo or as root."
[ -f "${WEB_ROOT}/index.html" ] || fail "Missing ${WEB_ROOT}/index.html. Run deploy-binarylane-marketing.sh first."
[ "$SKIP_CERTBOT" = true ] || [ -n "$EMAIL" ] || fail "--email is required unless --skip-certbot is used."

export DEBIAN_FRONTEND=noninteractive
command -v nginx >/dev/null 2>&1 || { apt-get update; apt-get install -y nginx; }
command -v certbot >/dev/null 2>&1 || { apt-get update; apt-get install -y certbot; }
install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled "$ACME_WEBROOT"

write_http_site() {
  cat >"$SITE_AVAILABLE" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${SITE_DOMAIN} ${APEX_DOMAIN};
    root ${WEB_ROOT};
    index index.html;
    location ^~ /.well-known/acme-challenge/ { root ${ACME_WEBROOT}; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
}

write_https_site() {
  cat >"$SITE_AVAILABLE" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${SITE_DOMAIN} ${APEX_DOMAIN};
    location ^~ /.well-known/acme-challenge/ { root ${ACME_WEBROOT}; }
    location / { return 301 https://${SITE_DOMAIN}\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SITE_DOMAIN};
    root ${WEB_ROOT};
    index index.html;
    ssl_certificate /etc/letsencrypt/live/${SITE_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SITE_DOMAIN}/privkey.pem;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    location = /index.html { add_header Cache-Control "no-cache" always; }
    location ~* \.(?:css|js|woff2?|png|jpe?g|webp|svg|ico)\$ { expires 30d; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
}

write_http_site
ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if [ "$SKIP_CERTBOT" = true ]; then
  printf 'HTTP site installed. Run again without --skip-certbot after DNS resolves.\n'
  exit 0
fi

CERTBOT_ARGS=(certonly --webroot -w "$ACME_WEBROOT" -d "$SITE_DOMAIN" -d "$APEX_DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --keep-until-expiring)
[ "$STAGING" = true ] && CERTBOT_ARGS+=(--staging)
certbot "${CERTBOT_ARGS[@]}"
write_https_site
nginx -t
systemctl reload nginx
certbot renew --dry-run
printf 'CivicPath marketing TLS is configured for https://%s.\n' "$SITE_DOMAIN"
