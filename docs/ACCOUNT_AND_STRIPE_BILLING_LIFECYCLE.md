# CivicPath account and Stripe billing lifecycle

## Purpose

This implementation enables a council to create a CivicPath workspace, choose a plan, pay through Stripe, receive access after a **verified** payment event, recover a password, and manage billing through Stripe’s hosted Customer Portal. It also gives the System Administrator one accountable operating view of customer billing, invoices, refunds, subscription changes, cancellation requests and signed webhook events.

> **Billing source of truth:** Stripe. CivicPath retains a tenant-scoped operational mirror so customer support, access decisions and audit history remain clear without storing card data.

## Commercial settings implemented

| Policy | Implemented behaviour |
|---|---|
| Billing cadence | Essentials and Core use annual recurring Stripe Prices. |
| Currency and tax | Public prices are AUD **excluding GST**. Every Checkout uses Stripe Tax: customers with an Australian billing address are charged **10% GST** on top of the price (e.g. Core $5,000 + $500 GST); New Zealand customers are not charged Australian GST. Checkout is refused while Stripe Tax is disabled, so an Australian sale can never proceed without GST. Council Proof one-off payments also produce a Stripe tax invoice. |
| Council Proof | A $495 one-off Stripe payment activates a 60-day Council Proof workspace. An organisation administrator can select CivicPath Essentials or Core in secure conversion Checkout within 30 days of the Proof end; CivicPath creates a one-time AUD $495 Stripe coupon and applies it before the annual payment is confirmed. |
| Access | The workspace is activated only after CivicPath verifies the Stripe payment event. Failed payment and subscription cancellation revoke normal tenant sessions. |
| Plan changes | A System Administrator may change a subscription immediately; Stripe calculates the applicable adjustment/invoice. A fresh password + MFA step-up is mandatory. |
| Cancellations | System Administrator chooses **period end** or **immediate** cancellation, supplies a written reason, then completes a fresh password + MFA step-up. |
| Refunds | System Administrator chooses a paid invoice, supplies a written internal reason and completes a fresh password + MFA step-up. Stripe returns funds to the original method. A refund does not silently cancel a subscription. |

## Council account journey

1. A visitor selects **Create an account** from CivicPath or the marketing pricing page.
2. The registration form captures the administrator’s name, work email, password, council/business details, billing context, plan choice and acknowledgements. ALTCHA, honeypot and rate limiting protect the form.
3. CivicPath creates a pending tenant, an invited organisation administrator, a billing profile and a `pending_checkout` subscription record. The workspace remains inaccessible.
4. CivicPath creates a Stripe Customer and a hosted Checkout Session. No card data reaches CivicPath.
5. Stripe sends a signature-verified event. `checkout.session.completed` links the session to CivicPath; `invoice.paid` activates annual subscriptions. A verified Council Proof one-off payment activates a 60-day access period. Within the following 30 days, the organisation administrator can use the $495 credit button in Settings to choose an Essentials or Core annual Checkout with a one-time Stripe coupon.
6. CivicPath records the event idempotently, updates its subscription/invoice mirror, activates the administrator and sends a transactional activation receipt through AWS SES.
7. The organisation administrator can use **Workspace settings → Open secure billing portal** for Stripe-managed payment details, invoices and permitted subscription actions.

## Password reset journey

- `/forgot-password` uses ALTCHA and always returns the same neutral confirmation message.
- Only an active account receives the one-hour signed reset email via AWS SES.
- Reset tokens are SHA-256 hashes, single-use and expire after one hour.
- Password reset increments the user’s session version, invalidating sessions on other devices.

## System Administrator operating controls

**System Admin → Billing & Stripe** stores encrypted Stripe test/live settings, plan Price IDs, optional Customer Portal Configuration ID and automatic-tax configuration. A masked key is retained safely when an administrator changes other settings.

**Customer 360° → Stripe billing & invoices** provides:

- Billing profile and Stripe customer identifier;
- Current plan/subscription context;
- Verified invoice and refund history;
- Recent signed webhook event history;
- Plan change control;
- Period-end or immediate cancellation control;
- Invoice-specific refund control.

Every privileged action records its actor, reason, target, source IP and Stripe reference in the CivicPath audit trail.

## Stripe configuration map

| CivicPath setting | Stripe value | Required for Checkout |
|---|---|---|
| Publishable key | `pk_test_…` / `pk_live_…` | Yes |
| Secret key | `sk_test_…` / `sk_live_…` | Yes, encrypted |
| Webhook signing secret | `whsec_…` | Yes, encrypted |
| Council Proof Price ID | One-off AUD $495 Price | Yes for Council Proof |
| Essentials Price ID | Annual recurring AUD Price | Yes for Essentials |
| Core Price ID | Annual recurring AUD Price | Yes for Core |
| Customer Portal configuration | `bpc_…` | Optional; Stripe default otherwise |
| Automatic tax | Stripe Tax enabled, with an active AU registration | **Yes**: checkout is refused without it |

## Where subscriptions are shown

- **System Admin → Command centre:** annual recurring revenue (excl. GST), cash collected in the last 30 days (incl. GST), active annual plans and Council Proofs, failed payments, abandoned checkouts and open support. The operational queue flags failed payments, Proofs ending within 14 days, cancellations at period end and registrations awaiting checkout.
- **System Admin → Councils:** every council's current plan, status, access period (with renewal or end date), annual value with GST, active/invited users and last payment, with filters. The current subscription is the newest unexpired active one, otherwise the newest record that is not an abandoned checkout.
- **Customer 360° (open a council):** Billing tab with the subscription summary, Stripe dashboard links, plan change, cancellation, invoices (subtotal, GST, total, PDF) and per-invoice refunds; Users tab with every user's role, status and last sign-in.
- **Workspace settings → Subscription (council users):** plan, status, access period and price with GST for every role; invoices, the Stripe billing portal and the Council Proof upgrade (showing the price after the $495 credit) for the organisation administrator. Data comes from `GET /v1/billing/subscription`.
- Invoice GST is mirrored from Stripe (`amount_subtotal`, `amount_tax`, migration `011_billing_invoice_tax_amounts.mjs`, which also backfills existing invoices).

## GST configuration in Stripe

- Each CivicPath Price must have **tax behaviour `exclusive`**. The account default (`inferred_by_currency`) treats AUD prices as GST-*inclusive*, which would hide GST inside the list price.
- CivicPath products use tax code `txcd_10103001` (Software as a service, business use).
- Stripe Tax must be active with an **Australian registration** (Stripe → Tax → Registrations).
- Use the CivicPath Customer Portal configuration (metadata `platform=civicpath`): payment methods, invoices, billing details and tax ID only; plan changes and cancellations stay with the System Administrator. The account's default portal belongs to GrantMaestro, so the CivicPath configuration ID must be saved in System Admin.

## Stripe API versions

The API uses the stripe-node pinned version (`2025-08-27.basil`). Basil moved `current_period_end` onto subscription items and replaced `invoice.payment_intent` with `invoice.payments`; CivicPath reads both shapes and re-reads paid invoices from Stripe (expanding `payments`) so refunds remain possible. Pin the production webhook endpoint to the same API version.

## Local development webhooks

Stripe cannot reach `localhost`, so forward events with the Stripe CLI and save its signing secret in System Admin → Billing & Stripe:

```
stripe listen --api-key sk_test_… --print-secret
stripe listen --api-key sk_test_… --forward-to localhost:3015/v1/billing/stripe/webhook --events checkout.session.completed,invoice.created,invoice.finalized,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,refund.created,refund.updated,refund.failed
```

The Stripe account is shared with other Big Little Business products; events that do not match a CivicPath organisation are recorded as `ignored`.

## Required webhook events

Configure `https://app.civicpath.com.au/v1/billing/stripe/webhook` with signature verification. Subscribe to:

- `checkout.session.completed`
- `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.updated`, `customer.subscription.deleted`
- `refund.created`, `refund.updated`, `refund.failed`

The raw request body is preserved only for signature verification. CivicPath stores a minimised event mirror and a unique Stripe event ID, so retries do not apply the same activation or refund twice.

## Test-mode release checklist

1. Save **test** credentials and test Price IDs in System Admin.
2. Register one test council with each product type.
3. Complete Stripe test Checkout and verify that access is not granted before the signed webhook.
4. Confirm `invoice.paid` activates the annual tenant and sends the account email through SES test configuration.
5. Confirm Council Proof activates for 60 days.
6. Confirm Customer Portal opens only for the tenant billing administrator.
7. Change a plan, cancel at period end, immediately cancel a test subscription and create a test refund. Confirm each is in the billing mirror and audit history.
8. Confirm password reset works and invalidates other sessions.
9. Move to live mode only with a new approved change record and equivalent live test evidence.

## Transactional email branding

All HTML transactional messages use the shared Quartermark email shell: account registration, activation, password reset, refund confirmation, public enquiry notifications, Council Proof confirmation, and Portfolio Readiness Pulse messages. The shell is table-based for broad email-client support, retains a plain-text alternative, and loads the approved logo via the public absolute URL derived from `FRONTEND_URL` (`https://app.civicpath.com.au/civicpath-quartermark.png` in production). Confirm that URL resolves over HTTPS before enabling SES delivery.

## Deliberate boundaries

- Stripe Dashboard remains available for financial reconciliation, tax settings, tax registrations, disputes and full payment-provider reporting.
- CivicPath does not store card data.
- The conversion-credit checkout is restricted to the verified Council Proof tenant, creates a unique one-time Stripe coupon, and is available only until 30 days after the Proof end. Monitor test-mode receipts and webhook records before enabling this in live mode.
- Production launch still requires HTTPS, a verified SES identity, secure Binary Lane environment, backups, monitoring and a security review.
