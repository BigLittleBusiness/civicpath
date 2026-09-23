#!/usr/bin/env bash
# Configure the Binary Lane Nginx edge for the CivicPath production application.
# Run only on the intended Binary Lane production server, as root or through sudo.
# This script does not create DNS records, provision AWS services or start the app.
set -euo pipefail

APP_DOMAIN="app.civicpath.com.au"
APP_DIR="/var/www/civicpath"
APP_ROOT="${APP_DIR}/frontend/build"
API_UPSTREAM="127.0.0.1:3015"
ACME_WEBROOT="/var/www/certbot"
LE_EMAIL="tech@biglittlebusiness.com"
EXPECTED_IP=""
CERTBOT_STAGING=false
SKIP_CERTBOT=false
CONFIGURE_UFW=false

SITE_AVAILABLE="/etc/nginx/sites-available/civicpath"
SITE_ENABLED="/etc/nginx/sites-enabled/civicpath"
HARDENING_CONFIG="/etc/nginx/conf.d/civicpath-rate-limits.conf"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SITE_BACKUP=""
HARDENING_BACKUP=""
SITE_WAS_PRESENT=false
HARDENING_WAS_PRESENT=false
SITE_ENABLED_WAS_PRESENT=false

usage() {
  cat <<'USAGE'
Usage:
  sudo ./infra/configure-binarylane-nginx-ssl.sh [options]

Options:
  --email EMAIL          Let's Encrypt operational contact (default: tech@biglittlebusiness.com)
  --expected-ip IPV4     Refuse certificate issuance unless DNS resolves to this IPv4 address
  --staging              Use the Let's Encrypt staging environment for a safe certificate test
  --skip-certbot         Install only the HTTP ACME/redirect configuration; do not request a certificate
  --configure-ufw        Add the existing "Nginx Full" UFW profile. Does not enable UFW.
  --help                 Show this help text

Preconditions:
  - app.civicpath.com.au has an A record that resolves to this Binary Lane server.
  - /var/www/civicpath/frontend/build/index.html exists after a successful application build.
  - the CivicPath API is healthy on 127.0.0.1:3015/v1/health.
  - inbound TCP 80 and 443 are allowed by Binary Lane networking and, where used, UFW.
USAGE
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

restore_on_error() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    printf 'Configuration did not complete; restoring the prior Nginx files where possible.\n' >&2
    if [ -n "$SITE_BACKUP" ]; then
      cp -a "$SITE_BACKUP" "$SITE_AVAILABLE"
    elif [ "$SITE_WAS_PRESENT" = false ]; then
      rm -f "$SITE_AVAILABLE"
    fi
    if [ -n "$HARDENING_BACKUP" ]; then
      cp -a "$HARDENING_BACKUP" "$HARDENING_CONFIG"
    elif [ "$HARDENING_WAS_PRESENT" = false ]; then
      rm -f "$HARDENING_CONFIG"
    fi
    if [ "$SITE_ENABLED_WAS_PRESENT" = false ]; then
      rm -f "$SITE_ENABLED"
    fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  fi
  exit "$status"
}

backup_if_present() {
  local source=$1
  local variable_name=$2
  local existed_name=$3
  if [ -e "$source" ]; then
    local backup="${source}.backup.${TIMESTAMP}"
    cp -a "$source" "$backup"
    printf -v "$variable_name" '%s' "$backup"
    printf -v "$existed_name" '%s' true
  fi
}

install_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    return
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y certbot
}

validate_dns() {
  local resolved
  resolved="$(getent ahostsv4 "$APP_DOMAIN" | awk '{print $1}' | sort -u || true)"
  [ -n "$resolved" ] || fail "${APP_DOMAIN} does not resolve to an IPv4 address from this server. Create and propagate the A record before requesting a certificate."
  if [ -n "$EXPECTED_IP" ] && ! grep -qx "$EXPECTED_IP" <<<"$resolved"; then
    fail "${APP_DOMAIN} resolves to [$resolved], not the required --expected-ip ${EXPECTED_IP}."
  fi
  printf 'DNS resolution for %s: %s\n' "$APP_DOMAIN" "$(tr '\n' ' ' <<<"$resolved")"
}

write_rate_limit_config() {
  cat >"$HARDENING_CONFIG" <<'NGINX'
# Managed by CivicPath configure-binarylane-nginx-ssl.sh.
# These directives are in Nginx's http context because files in conf.d are included there.
server_tokens off;
limit_req_zone $binary_remote_addr zone=civicpath_api:10m rate=120r/m;
limit_conn_zone $binary_remote_addr zone=civicpath_connection:10m;
NGINX
}

write_http_site() {
  cat >"$SITE_AVAILABLE" <<NGINX
# Managed by CivicPath configure-binarylane-nginx-ssl.sh.
# HTTP is retained only for ACME validation and the permanent HTTPS redirect.
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
NGINX
}

write_https_site() {
  cat >"$SITE_AVAILABLE" <<NGINX
# Managed by CivicPath configure-binarylane-nginx-ssl.sh.
# Do not edit on the server; update this script and redeploy the reviewed change.
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${APP_DOMAIN};

    root ${APP_ROOT};
    index index.html;
    client_max_body_size 10m;

    ssl_certificate /etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${APP_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_prefer_server_ciphers off;

    # Enable HSTS only on the verified HTTPS host. `includeSubDomains` is intentionally
    # omitted because other CivicPath subdomains can be deployed separately.
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()" always;

    location = /v1/health {
        access_log off;
        proxy_pass http://${API_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Request-ID \$request_id;
    }

    location /v1/ {
        limit_req zone=civicpath_api burst=60 nodelay;
        limit_conn civicpath_connection 20;
        limit_req_status 429;

        proxy_pass http://${API_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Request-ID \$request_id;
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~* \.(?:css|js|mjs|map|ico|gif|jpe?g|png|svg|webp|woff2?)\$ {
        try_files \$uri =404;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~ /\.(?!well-known) {
        deny all;
        access_log off;
        log_not_found off;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --email)
      [ "$#" -ge 2 ] || fail "--email requires a value"
      LE_EMAIL=$2
      shift 2
      ;;
    --expected-ip)
      [ "$#" -ge 2 ] || fail "--expected-ip requires an IPv4 address"
      EXPECTED_IP=$2
      shift 2
      ;;
    --staging)
      CERTBOT_STAGING=true
      shift
      ;;
    --skip-certbot)
      SKIP_CERTBOT=true
      shift
      ;;
    --configure-ufw)
      CONFIGURE_UFW=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

[ "$(id -u)" -eq 0 ] || fail "Run through sudo or as root."
[ -f "${APP_ROOT}/index.html" ] || fail "Missing ${APP_ROOT}/index.html. Run the reviewed CivicPath build before configuring Nginx."
[ -f "${APP_DIR}/api/.env" ] || fail "Missing ${APP_DIR}/api/.env. Create the production environment file before exposing the application."
command -v curl >/dev/null 2>&1 || fail "curl is required for the API health check."

if ! curl --fail --silent --show-error --max-time 5 "http://${API_UPSTREAM}/v1/health" >/dev/null; then
  fail "The CivicPath API is not healthy at http://${API_UPSTREAM}/v1/health. Start and verify PM2 before exposing Nginx."
fi

if ! command -v nginx >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y nginx
fi

systemctl enable --now nginx
install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d "$ACME_WEBROOT"
backup_if_present "$SITE_AVAILABLE" SITE_BACKUP SITE_WAS_PRESENT
backup_if_present "$HARDENING_CONFIG" HARDENING_BACKUP HARDENING_WAS_PRESENT
[ -e "$SITE_ENABLED" ] && SITE_ENABLED_WAS_PRESENT=true
trap restore_on_error EXIT

write_rate_limit_config
write_http_site
ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
nginx -t
systemctl reload nginx

if [ "$CONFIGURE_UFW" = true ] && command -v ufw >/dev/null 2>&1; then
  ufw allow 'Nginx Full'
fi

if [ "$SKIP_CERTBOT" = true ]; then
  trap - EXIT
  printf 'HTTP ACME and HTTPS redirect configuration is installed. Run this script again without --skip-certbot after DNS and port 80 are externally reachable.\n'
  exit 0
fi

validate_dns
install_certbot
CERTBOT_ARGS=(certonly --webroot -w "$ACME_WEBROOT" -d "$APP_DOMAIN" --non-interactive --agree-tos --email "$LE_EMAIL" --keep-until-expiring)
if [ "$CERTBOT_STAGING" = true ]; then
  CERTBOT_ARGS+=(--staging)
fi
certbot "${CERTBOT_ARGS[@]}"

[ -f "/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem" ] || fail "Certbot completed without the expected certificate chain."
[ -f "/etc/letsencrypt/live/${APP_DOMAIN}/privkey.pem" ] || fail "Certbot completed without the expected private key."

write_https_site
nginx -t
systemctl reload nginx
systemctl enable certbot.timer >/dev/null 2>&1 || true

curl --fail --silent --show-error --max-time 15 "https://${APP_DOMAIN}/v1/health" >/dev/null
curl --fail --silent --show-error --max-time 15 --head "https://${APP_DOMAIN}/" >/dev/null
certbot renew --dry-run

trap - EXIT
printf 'CivicPath Nginx and TLS configuration is active for https://%s\n' "$APP_DOMAIN"
printf 'Backups, if needed, are stored beside the managed Nginx files with suffix .backup.%s\n' "$TIMESTAMP"
