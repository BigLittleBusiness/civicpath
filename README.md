# CivicPath Application

CivicPath is a standalone SaaS application for regional councils in Australia and New Zealand. It helps teams connect Council priorities to delivery-ready projects, funding pathways, decisions, risks, actions and grant-lifecycle work.

## Product boundary

CivicPath is a separate product from GrantMaestro. It has its own application, API, database and deployment configuration. It is deliberately compatible with GrantMaestro’s technology choices and will later support optional interoperability through documented API contracts, not shared database tables.

## Technology baseline

The application follows the established GrantMaestro stack: a Create React App single-page application with React, Redux Toolkit, React Router, Formik/Yup, Axios, Recharts and React Helmet; a Node.js/Express ES-module API under `/v1`; MySQL 8 through Sequelize; Nginx static hosting and reverse proxying; PM2 process management; JWT authentication in HttpOnly cookies; AWS SES/S3-ready adapters; Stripe billing with Stripe Checkout, Stripe Tax, the Stripe Customer Portal and signed webhooks; and scheduled notifications through node-cron.

## MVP modules

The initial build includes organisation tenancy, role-based access, audit entries, strategic priorities, projects, project-readiness assessments, funding pathways, actions, risks, decisions, grants, grant tasks, evidence items, portfolio reports, CSV imports, self-service council registration with Stripe billing, password reset and a clearly marked demonstration workspace. It contains no shared GrantMaestro database dependency.

## Billing and Stripe

Councils register at `/register`, pay through Stripe Checkout and are activated only after a signature-verified Stripe webhook confirms payment. Stripe is the billing source of truth; CivicPath keeps a tenant-scoped mirror of subscriptions, invoices, refunds and webhook events and never stores card data.

| Plan | Price (AUD, excl. GST) | Billing |
|---|---|---|
| Council Proof | $495 | One-off, 60 days of access; the full $495 is credited if the council takes an annual plan within 30 days of the Proof ending |
| CivicPath Essentials | $2,500 | Annual subscription |
| CivicPath Core | $5,000 | Annual subscription |

**GST.** Prices exclude GST. Every checkout uses Stripe Tax, which adds 10% GST for Australian billing addresses (New Zealand customers are not charged Australian GST) and issues tax invoices, including for Council Proof. Checkout is refused while Stripe Tax is switched off, so an Australian sale can never proceed without GST. The CivicPath Stripe Prices must have tax behaviour `exclusive`.

**Configuration.** Stripe keys, the webhook signing secret, Price IDs, the CivicPath Customer Portal configuration and the Stripe Tax switch are entered in **System Admin → Billing & Stripe**, not in `.env`. Secrets are encrypted with `PLATFORM_ENCRYPTION_KEY` and saving requires the platform administrator's password and a fresh MFA code. The Stripe account is shared with other Big Little Business products; only CivicPath objects should be changed.

**Where billing appears.**
- **System Admin → Command centre:** recurring revenue, money collected, active plans, failed payments and Proofs ending soon.
- **System Admin → Councils:** each council's plan, access period, annual value with GST, users and last payment. Opening a council shows invoices with GST, refunds, plan changes and cancellation; each of these needs a written reason and an MFA step-up.
- **Workspace settings → Subscription:** council users see their plan and access period; the organisation administrator also sees invoices, opens the Stripe billing portal (card, billing details, ABN, tax invoices) and can upgrade from Council Proof with the $495 credit. Plan changes and cancellations are handled by the platform administrator.

**Local webhooks.** Stripe cannot reach `localhost`, so forward events with the [Stripe CLI](https://docs.stripe.com/stripe-cli) and save the printed `whsec_…` signing secret in System Admin. Run only one listener at a time.

```
stripe listen --api-key sk_test_… --print-secret
stripe listen --api-key sk_test_… --forward-to localhost:3015/v1/billing/stripe/webhook --events checkout.session.completed,invoice.created,invoice.finalized,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,refund.created,refund.updated,refund.failed
```

Test payments use card `4242 4242 4242 4242` with any future expiry and any CVC. Transactional emails (registration, activation, password reset) need AWS SES and are not sent until it is configured.

The full runbook (webhook events, API version notes, test-mode release checklist) is in [docs/ACCOUNT_AND_STRIPE_BILLING_LIFECYCLE.md](docs/ACCOUNT_AND_STRIPE_BILLING_LIFECYCLE.md).

## Deployment target

Production will be deployed to Binary Lane with `app.civicpath.com.au` serving the application and `www.civicpath.com.au` serving the marketing website. Binary Lane access, DNS records, SSL certificates and production credentials have not yet been supplied, so this repository includes deployment-ready configuration but does not alter live hosting.

## Development commands

Copy each `.env.example` file to `.env` and configure only development values. Do not commit credentials.

1. **Database:** create an empty database matching `DB_NAME` in `api/.env`.
2. **API:** from `api`, run `npm ci`, then `npm run db:migrate` (runs every migration in order; safe to repeat) and optionally `npm run db:seed-demo`, then `npm run dev` (port 3015).
3. **Frontend:** from `frontend`, run `npm ci --legacy-peer-deps` (react-table 7 declares a React 18 peer), then `npm start` (port 3000). If the dev server fails with `allowedHosts[0] should be a non-empty string`, add `DANGEROUSLY_DISABLE_HOST_CHECK=true` to `frontend/.env` (local development only).
4. **Billing (optional):** sign in as the platform administrator, enter Stripe test-mode settings in System Admin → Billing & Stripe, and start the Stripe CLI listener described above.

The demonstration seed creates `demo@civicpath.com.au` (council administrator) and `admin@civicpath.com.au` (platform administrator, MFA required on first sign-in). Their development passwords are defined in `api/db/seeds/001_demo_workspace.mjs`.

