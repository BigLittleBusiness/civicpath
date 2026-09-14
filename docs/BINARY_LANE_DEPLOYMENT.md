# Binary Lane deployment runbook

## Required before deployment

Create a Binary Lane Ubuntu instance with MySQL 8, Nginx, Node 22 through NVM, PM2 and Certbot. Create DNS A records for `app.civicpath.com.au` and `www.civicpath.com.au` to the relevant instances. The application and marketing site may initially share an instance, but they must use distinct Nginx server blocks and application roots.

## Production configuration

1. Clone the private `civicpath-app` repository to `/var/www/civicpath`.
2. Create a new MySQL database and a least-privilege database user for CivicPath; do not reuse GrantMaestro credentials or tables.
3. Create `/var/www/civicpath/api/.env` with `NODE_ENV=production`, a unique high-entropy `JWT_SECRET`, the production database settings, `FRONTEND_URL=https://app.civicpath.com.au`, and `COOKIE_DOMAIN=app.civicpath.com.au`.
4. Run `infra/deploy-binarylane.sh`.
5. Copy and review `infra/nginx-civicpath.conf`, then enable it in Nginx.
6. Issue a TLS certificate after DNS resolves. Redirect port 80 to HTTPS and verify cookies, login, API proxying, deep links and security headers over HTTPS.

## Security gates

Do not publish a working sign-in until HTTPS, production secrets, database backups, off-host log rotation, least-privilege MySQL access, firewall rules and a privacy/security review have been completed. AWS SES, S3, Stripe and AI services each need their own production configuration and tests; they are intentionally not activated by this initial build.

## Demonstration data

The `db:seed-demo` command is for a dedicated development or demonstration tenant only. Do not run it in production unless a separately protected demonstration organisation is intentionally created. Customer imports must run in their own tenant.

