# CivicPath Binary Lane Nginx and TLS Configuration

## Purpose

`infra/configure-binarylane-nginx-ssl.sh` installs the production Nginx edge configuration for **`app.civicpath.com.au`** on the intended Binary Lane Ubuntu server. It is deliberately a deployment script, not a development-server script. It does not start CivicPath, create DNS records, configure Amazon SES or S3, create a database, or activate any third-party service.

The script assumes that the CivicPath React build is at `/var/www/civicpath/frontend/build`, the Express API is already healthy at `127.0.0.1:3015/v1/health`, and the production API environment is at `/var/www/civicpath/api/.env`.

## Preconditions

Before running the script, deploy the reviewed `app` branch, build the application and start the PM2 process through `infra/deploy-binarylane.sh`. Then create the `app.civicpath.com.au` A record at the authoritative DNS provider, pointing to the intended Binary Lane IPv4 address. Ensure inbound TCP ports 80 and 443 are permitted by Binary Lane networking. If UFW is enabled, the script can add its existing `Nginx Full` profile without enabling UFW itself.

The application domain must resolve before a public certificate can be issued. The script verifies DNS locally and can be given `--expected-ip <BINARY_LANE_IPV4>` to prevent accidental certificate issuance against the wrong server.

## First production run

Run this only on the production Binary Lane host after DNS propagation and after confirming the local health endpoint:

```bash
cd /var/www/civicpath
sudo ./infra/configure-binarylane-nginx-ssl.sh --expected-ip <BINARY_LANE_IPV4>
```

The default Let’s Encrypt operational contact is `tech@biglittlebusiness.com`. To use another monitored technical mailbox, add `--email address@example.com`. The script uses Certbot’s webroot method rather than allowing Certbot to rewrite the CivicPath Nginx configuration. This preserves the reviewed configuration while still using the standard ACME HTTP challenge flow.[1]

For a first rehearsal against Let’s Encrypt’s staging environment, use:

```bash
sudo ./infra/configure-binarylane-nginx-ssl.sh --expected-ip <BINARY_LANE_IPV4> --staging
```

A staging certificate is not trusted by browsers. Run the standard command without `--staging` after the rehearsal passes. To install only the HTTP ACME listener and redirect configuration while waiting for public DNS or firewall changes, use `--skip-certbot`; rerun without that option to request the certificate.

## What the script configures

The script writes an Nginx `conf.d` hardening file with rate and connection zones. It writes the `civicpath` server configuration under `/etc/nginx/sites-available`, enables it through `/etc/nginx/sites-enabled`, tests Nginx before each reload, and preserves timestamped backups of any earlier managed files.

The public HTTP listener serves only `/.well-known/acme-challenge/` and permanently redirects all other paths to HTTPS. The HTTPS listener proxies `/v1/` to the local API, applies request and connection controls to that route, serves the React single-page application with deep-link fallback, sets security headers, blocks dot files, caches fingerprinted static assets and sets a 10 MB request-body limit. It does not expose the API port or MySQL directly.

After certificate issuance, the script verifies the local HTTPS health endpoint, the public application response and Certbot renewal using `certbot renew --dry-run`. Certbot documents this renewal test as the way to check that automated renewal will succeed.[1]

## Post-run checks

Confirm the following before making the sign-in publicly available:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
pm2 status
curl -I https://app.civicpath.com.au/
curl -fsS https://app.civicpath.com.au/v1/health
sudo certbot renew --dry-run
```

Then complete browser-based checks for HTTPS-only cookies, System Administrator sign-in and MFA, a React deep link, the public Portfolio Readiness Pulse, privacy links and an expected API error response. Do not configure or enable Amazon SES, Amazon S3, Stripe or CRM routing solely because the Nginx edge is live; each remains subject to its separate production controls.

## Rollback

If Nginx validation fails during the script, its error handler restores the preceding managed configuration where possible and attempts a safe reload. If a later operational rollback is required, restore the timestamped backup beside `/etc/nginx/sites-available/civicpath` and `/etc/nginx/conf.d/civicpath-rate-limits.conf`, run `sudo nginx -t`, then reload Nginx. Do not roll back production configuration by copying development-server files or exposing port 3015 publicly.

## References

[1]: https://certbot.eff.org/instructions?ws=nginx&os=ubuntufocal "Certbot Instructions for Nginx on Ubuntu"
