# Binary Lane deployment runbook

## Required before deployment

Create a Binary Lane Ubuntu instance with MySQL 8, Nginx, Node 22 through NVM, PM2 and Certbot. Create DNS A records for `app.civicpath.com.au` and `www.civicpath.com.au` to the relevant instances. The application and marketing site may initially share an instance, but they must use distinct Nginx server blocks and application roots. Binary Lane hosts CivicPath; Amazon SES sends outbound transactional email, Amazon S3 stores application files, and Zoho Mail receives inbound `biglittlebusiness.com` correspondence.

Use `docs/PRODUCTION_PLATFORM_AND_COMMUNICATIONS_STANDARD.md` as the authoritative service-boundary and mailbox-role reference for every production configuration step.

## Production configuration

1. Clone the private `BigLittleBusiness/civicpath` repository to `/var/www/civicpath` and deploy the `app` branch.
2. Create a new MySQL database and a least-privilege database user for CivicPath; do not reuse GrantMaestro credentials or tables.
3. Copy `api/.env.binarylane.example` to `/var/www/civicpath/api/.env`, then replace every `REPLACE_` value with a unique production value. Confirm `NODE_ENV=production`, `FRONTEND_URL=https://app.civicpath.com.au`, `CORS_ORIGINS=https://app.civicpath.com.au,https://www.civicpath.com.au`, `COOKIE_DOMAIN=app.civicpath.com.au`, and `DEMO_MODE=false`. `FRONTEND_URL` must be the public HTTPS app origin because all transactional email templates load the approved Quartermark from `/civicpath-quartermark.png`. `ALTCHA_HMAC_SECRET` signs short-lived, single-use, self-hosted anti-spam challenges and must never be exposed to a browser.
4. From `/var/www/civicpath/api`, run `node db/migrations/002_system_admin_foundation.mjs`, `node db/migrations/003_customer_360_and_mfa.mjs`, `node db/migrations/004_structured_selectors.mjs`, `node db/migrations/005_public_pulse_leads.mjs`, `node db/migrations/006_public_contact_and_altcha.mjs`, `node db/migrations/007_enquiry_follow_up_and_support_attachments.mjs`, `node db/migrations/008_council_proof_confirmation_delivery.mjs`, `node db/migrations/009_strategy_delivery_workspace.mjs` and `node db/migrations/010_stripe_account_billing_lifecycle.mjs`. These migrations are idempotent; retain them in the deployment record.
5. Run `infra/deploy-binarylane.sh`.
6. After the `app.civicpath.com.au` A record resolves to the Binary Lane server and the API health endpoint responds locally, run `sudo ./infra/configure-binarylane-nginx-ssl.sh --expected-ip <BINARY_LANE_IPV4>`. The script writes an ACME-only HTTP listener, requests a Let’s Encrypt certificate, then installs the HTTPS Nginx server block with a permanent HTTP-to-HTTPS redirect, TLS settings, security headers and API proxy controls.
7. Review the script’s local health checks, external HTTPS response, `sudo certbot renew --dry-run`, cookies, login, API proxying, deep links and security headers before publishing the working sign-in. The older `infra/nginx-civicpath.conf` remains a manual reference only; the reviewed configuration script is the production installation path.
8. Run `./infra/verify-binarylane-portability.sh` before promoting a release. It fails if the deployable standalone application contains a managed-hosting runtime reference or if the reviewed Binary Lane files are absent.

## Security gates

Do not publish a working sign-in until HTTPS, production secrets, database backups, off-host log rotation, least-privilege MySQL access, firewall rules and a privacy/security review have been completed. `PLATFORM_ENCRYPTION_KEY` is required before any Stripe secret key, webhook signing secret or System Administrator TOTP secret can be saved; CivicPath encrypts these values with AES-256-GCM and never sends them back to the browser after saving. AWS SES and S3 require their own production configuration and tests; they are intentionally not activated by this initial build. Configure SES for outbound mail only and retain Zoho Mail as the inbound provider for `hello@biglittlebusiness.com`, `admin@biglittlebusiness.com`, `tech@biglittlebusiness.com` and `kristian@biglittlebusiness.com`.

## Public contact forms

The public marketing contact page, Portfolio Readiness Pulse capture, and authenticated portal support form use self-hosted **ALTCHA** verification, a honeypot field and endpoint rate limits. The CAPTCHA requires HTTPS because the browser uses the Web Crypto API. All public form records are stored in the CivicPath database before outbound delivery is attempted. A Council Proof enquiry also triggers a prospect receipt that explains the full $495 Proof-fee conversion credit, including the requirement to proceed within 30 days of the final Proof review. The platform-only Public enquiries view retains category, follow-up status, due date, ownership and audit history for public contact follow-up. Marketing must be built with `VITE_CIVICPATH_API_BASE_URL=https://app.civicpath.com.au/v1`, and the API CORS allow-list must continue to include `https://www.civicpath.com.au`. Configure and test SES before activating transactional delivery; until then, submissions remain recorded with delivery disabled rather than being discarded.

Portal support users may attach up to three screenshots or documents. Before production use, create a dedicated private S3 bucket with Block Public Access enabled, default server-side encryption enabled, no public ACL policy and a least-privilege IAM policy permitting only `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` against the CivicPath support prefix. Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `SUPPORT_ATTACHMENT_S3_BUCKET` in the production API environment. Do not set a local attachment path in production: the API deliberately rejects support uploads without the configured private bucket.

## System Administrator MFA enrolment

System Administrators must enrol an authenticator application before they can complete sign-in. During first sign-in, the administrator scans the displayed QR code (or enters the displayed manual key) in an authenticator application, verifies a current six-digit code, and receives recovery codes exactly once. Recovery codes must be stored in an approved password manager or other secure offline record; the application stores only one-way hashes, and a code is consumed after use. A high-risk System Administrator action requires the administrator's password plus a current authenticator or unused recovery code and grants a short-lived elevated session only for the configured `PRIVILEGED_ACTION_MINUTES` period.

Before production use, define a controlled MFA reset and account-recovery procedure with dual approval and auditable records. Do not reset or bypass a System Administrator's MFA solely through an informal support request.

## Registration, Stripe and account lifecycle

The application exposes public registration at `https://app.civicpath.com.au/register`, password recovery at `/forgot-password` and a Stripe webhook at `POST /v1/billing/stripe/webhook`. Registration and reset forms use the self-hosted ALTCHA control, honeypot checks and rate limits. No workspace access is granted until a verified Stripe payment event activates the tenant.

Before enabling public Checkout:

1. In **Stripe test mode**, create a one-off AUD Council Proof Price for $495 and annual recurring AUD Prices for CivicPath Essentials and CivicPath Core. Set the appropriate tax behaviour in Stripe, noting that public CivicPath pricing is displayed excluding GST.
2. Configure Stripe’s **Customer Portal** to allow payment-method updates, invoice downloads, cancellation and only the subscription switches that match the approved commercial policy.
3. Add `https://app.civicpath.com.au/v1/billing/stripe/webhook` as a Stripe webhook endpoint. Subscribe at minimum to `checkout.session.completed`, `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `refund.created`, `refund.updated` and `refund.failed`.
4. In CivicPath **System Admin → Billing & Stripe**, save the matching test publishable key, secret key, webhook signing secret, three Price IDs, optional Portal Configuration ID and automatic-tax setting. The system encrypts the secret key and webhook secret and never returns them to the browser.
5. Complete test-mode registration, checkout, `invoice.paid` activation, Customer Portal, plan-change, cancellation and refund scenarios. Confirm the signed webhook is received and the tenant, invoice, refund and audit records are updated exactly once.
6. Obtain explicit launch approval, then repeat the configuration and verification in live mode. Do not mix test credentials with live Price IDs or webhook signing secrets.

The System Admin Customer 360° view is the operational control surface for each council’s billing profile, verified invoices, refunds, webhook history, plan changes and cancellations. Plan changes, cancellations and refunds deliberately require a fresh System Administrator password and MFA step-up; a refund does not automatically cancel a subscription, so make both decisions explicitly and retain the reason in the audit trail.

## Demonstration data

The `db:seed-demo` command is for a dedicated development or demonstration tenant only. Do not run it in production unless a separately protected demonstration organisation is intentionally created. Customer imports must run in their own tenant.

## Strategy delivery workspace

Migration `009_strategy_delivery_workspace.mjs` adds the tenant-scoped action register, focus areas, statuses, action/project links, milestones, dependencies, quarterly reporting periods and updates, measures, decisions, partners, risks, funding positions, evidence links, report snapshots and in-app alerts. The scheduled strategy-alert evaluation creates in-app accountability items only; it does **not** email council users. Configure any future escalation channel only after the council approves its notification policy. See `docs/STRATEGY_DELIVERY_WORKSPACE.md` for the operating model and CSV import contract.
