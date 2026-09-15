# Binary Lane deployment runbook

## Required before deployment

Create a Binary Lane Ubuntu instance with MySQL 8, Nginx, Node 22 through NVM, PM2 and Certbot. Create DNS A records for `app.civicpath.com.au` and `www.civicpath.com.au` to the relevant instances. The application and marketing site may initially share an instance, but they must use distinct Nginx server blocks and application roots.

## Production configuration

1. Clone the private `BigLittleBusiness/civicpath` repository to `/var/www/civicpath` and deploy the `app` branch.
2. Create a new MySQL database and a least-privilege database user for CivicPath; do not reuse GrantMaestro credentials or tables.
3. Create `/var/www/civicpath/api/.env` with `NODE_ENV=production`, a unique high-entropy `JWT_SECRET`, a distinct high-entropy `PLATFORM_ENCRYPTION_KEY`, the production database settings, `FRONTEND_URL=https://app.civicpath.com.au`, `COOKIE_DOMAIN=app.civicpath.com.au`, `MFA_ISSUER=CivicPath`, and `PRIVILEGED_ACTION_MINUTES=10` (or another explicitly approved short duration).
4. From `/var/www/civicpath/api`, run `node db/migrations/002_system_admin_foundation.mjs`, `node db/migrations/003_customer_360_and_mfa.mjs` and `node db/migrations/004_structured_selectors.mjs`. These migrations are idempotent; retain them in the deployment record.
5. Run `infra/deploy-binarylane.sh`.
6. Copy and review `infra/nginx-civicpath.conf`, then enable it in Nginx.
7. Issue a TLS certificate after DNS resolves. Redirect port 80 to HTTPS and verify cookies, login, API proxying, deep links and security headers over HTTPS.

## Security gates

Do not publish a working sign-in until HTTPS, production secrets, database backups, off-host log rotation, least-privilege MySQL access, firewall rules and a privacy/security review have been completed. `PLATFORM_ENCRYPTION_KEY` is required before any Stripe secret key, webhook signing secret or System Administrator TOTP secret can be saved; CivicPath encrypts these values with AES-256-GCM and never sends them back to the browser after saving. AWS SES, S3, Stripe and AI services each need their own production configuration and tests; they are intentionally not activated by this initial build.

## System Administrator MFA enrolment

System Administrators must enrol an authenticator application before they can complete sign-in. During first sign-in, the administrator scans the displayed QR code (or enters the displayed manual key) in an authenticator application, verifies a current six-digit code, and receives recovery codes exactly once. Recovery codes must be stored in an approved password manager or other secure offline record; the application stores only one-way hashes, and a code is consumed after use. A high-risk System Administrator action requires the administrator's password plus a current authenticator or unused recovery code and grants a short-lived elevated session only for the configured `PRIVILEGED_ACTION_MINUTES` period.

Before production use, define a controlled MFA reset and account-recovery procedure with dual approval and auditable records. Do not reset or bypass a System Administrator's MFA solely through an informal support request.

## Demonstration data

The `db:seed-demo` command is for a dedicated development or demonstration tenant only. Do not run it in production unless a separately protected demonstration organisation is intentionally created. Customer imports must run in their own tenant.
