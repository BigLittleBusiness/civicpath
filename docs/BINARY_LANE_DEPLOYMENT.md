# Binary Lane deployment runbook

## Required before deployment

Create a Binary Lane Ubuntu instance with MySQL 8, Nginx, Node 22 through NVM, PM2 and Certbot. Create DNS A records for `app.civicpath.com.au` and `www.civicpath.com.au` to the relevant instances. The application and marketing site may initially share an instance, but they must use distinct Nginx server blocks and application roots. Binary Lane hosts CivicPath; Amazon SES sends outbound transactional email, Amazon S3 stores application files, and Zoho Mail receives inbound `biglittlebusiness.com` correspondence.

Use `docs/PRODUCTION_PLATFORM_AND_COMMUNICATIONS_STANDARD.md` as the authoritative service-boundary and mailbox-role reference for every production configuration step.

## Production configuration

1. Clone the private `BigLittleBusiness/civicpath` repository to `/var/www/civicpath` and deploy the `app` branch.
2. Create a new MySQL database and a least-privilege database user for CivicPath; do not reuse GrantMaestro credentials or tables.
3. Copy `api/.env.binarylane.example` to `/var/www/civicpath/api/.env`, then replace every `REPLACE_` value with a unique production value. Confirm `NODE_ENV=production`, `FRONTEND_URL=https://app.civicpath.com.au`, `CORS_ORIGINS=https://app.civicpath.com.au,https://www.civicpath.com.au`, `COOKIE_DOMAIN=app.civicpath.com.au`, and `DEMO_MODE=false`. `ALTCHA_HMAC_SECRET` signs short-lived, single-use, self-hosted anti-spam challenges and must never be exposed to a browser.
4. From `/var/www/civicpath/api`, run `node db/migrations/002_system_admin_foundation.mjs`, `node db/migrations/003_customer_360_and_mfa.mjs`, `node db/migrations/004_structured_selectors.mjs`, `node db/migrations/005_public_pulse_leads.mjs`, `node db/migrations/006_public_contact_and_altcha.mjs` and `node db/migrations/007_enquiry_follow_up_and_support_attachments.mjs`. These migrations are idempotent; retain them in the deployment record.
5. Run `infra/deploy-binarylane.sh`.
6. After the `app.civicpath.com.au` A record resolves to the Binary Lane server and the API health endpoint responds locally, run `sudo ./infra/configure-binarylane-nginx-ssl.sh --expected-ip <BINARY_LANE_IPV4>`. The script writes an ACME-only HTTP listener, requests a Let’s Encrypt certificate, then installs the HTTPS Nginx server block with a permanent HTTP-to-HTTPS redirect, TLS settings, security headers and API proxy controls.
7. Review the script’s local health checks, external HTTPS response, `sudo certbot renew --dry-run`, cookies, login, API proxying, deep links and security headers before publishing the working sign-in. The older `infra/nginx-civicpath.conf` remains a manual reference only; the reviewed configuration script is the production installation path.
8. Run `./infra/verify-binarylane-portability.sh` before promoting a release. It fails if the deployable standalone application contains a managed-hosting runtime reference or if the reviewed Binary Lane files are absent.

## Security gates

Do not publish a working sign-in until HTTPS, production secrets, database backups, off-host log rotation, least-privilege MySQL access, firewall rules and a privacy/security review have been completed. `PLATFORM_ENCRYPTION_KEY` is required before any Stripe secret key, webhook signing secret or System Administrator TOTP secret can be saved; CivicPath encrypts these values with AES-256-GCM and never sends them back to the browser after saving. AWS SES and S3 require their own production configuration and tests; they are intentionally not activated by this initial build. Configure SES for outbound mail only and retain Zoho Mail as the inbound provider for `hello@biglittlebusiness.com`, `admin@biglittlebusiness.com`, `tech@biglittlebusiness.com` and `kristian@biglittlebusiness.com`.

## Public contact forms

The public marketing contact page, Portfolio Readiness Pulse capture, and authenticated portal support form use self-hosted **ALTCHA** verification, a honeypot field and endpoint rate limits. The CAPTCHA requires HTTPS because the browser uses the Web Crypto API. All public form records are stored in the CivicPath database before outbound delivery is attempted. The platform-only Public enquiries view retains category, follow-up status, due date, ownership and audit history for public contact follow-up. Marketing must be built with `VITE_CIVICPATH_API_BASE_URL=https://app.civicpath.com.au/v1`, and the API CORS allow-list must continue to include `https://www.civicpath.com.au`. Configure and test SES before activating transactional delivery; until then, submissions remain recorded with delivery disabled rather than being discarded.

Portal support users may attach up to three screenshots or documents. Before production use, create a dedicated private S3 bucket with Block Public Access enabled, default server-side encryption enabled, no public ACL policy and a least-privilege IAM policy permitting only `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` against the CivicPath support prefix. Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `SUPPORT_ATTACHMENT_S3_BUCKET` in the production API environment. Do not set a local attachment path in production: the API deliberately rejects support uploads without the configured private bucket.

## System Administrator MFA enrolment

System Administrators must enrol an authenticator application before they can complete sign-in. During first sign-in, the administrator scans the displayed QR code (or enters the displayed manual key) in an authenticator application, verifies a current six-digit code, and receives recovery codes exactly once. Recovery codes must be stored in an approved password manager or other secure offline record; the application stores only one-way hashes, and a code is consumed after use. A high-risk System Administrator action requires the administrator's password plus a current authenticator or unused recovery code and grants a short-lived elevated session only for the configured `PRIVILEGED_ACTION_MINUTES` period.

Before production use, define a controlled MFA reset and account-recovery procedure with dual approval and auditable records. Do not reset or bypass a System Administrator's MFA solely through an informal support request.

## Demonstration data

The `db:seed-demo` command is for a dedicated development or demonstration tenant only. Do not run it in production unless a separately protected demonstration organisation is intentionally created. Customer imports must run in their own tenant.
