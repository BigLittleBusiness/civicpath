# CivicPath — Developer commissioning checklist

**Prepared:** 3 November 2026. **Scope:** `BigLittleBusiness/civicpath`, branch `app`; marketing is independent and `main` stays untouched. This does not assert automatic CI deployment, live provider verification, a service SLA, council clients or approval status.

**Authority:** application completion/testing is approved. External production configuration/testing, deletion and live payments are **not** authorised here. Complete isolated application tests now; obtain separate explicit authorisation for external commissioning. Script pointers are not permission to execute them. Do not inspect credentials or `.env` for this exercise. Never paste secrets, recovery codes, tokens, signed URLs or raw provider payloads into this checklist, tickets, history or evidence.

**Release record:** deployment SHA ______; candidate environment/origin ______; deployment date/time/timezone ______; developer ______; operator ______; security/privacy reviewer ______; commercial owner ______; legal/records owner ______; release approver ______; private evidence index ______; external authorisation reference/scope ______.

Check boxes only against actual environment-specific evidence. Record failures, responsible owner and resolution privately. Missing approval means **STOP**, not an assumed pending approval.

## 1. Release backup and rollback

**Owners:** developer, operator, release approver.

- [ ] Confirm reviewed `app` SHA, matching API/frontend artifacts and migration manifest. Keep marketing roots/server blocks separate; do not promote `main` or assume CI deploys the app.
- [ ] Preserve previous release/configuration and a recoverable database/object recovery point before authorised deployment. Confirm capacity, disk space, key custody and off-host evidence.
- [ ] Document rollback owner, trigger, traffic switch and schema compatibility; rehearse the previous compatible application. Additive migrations do not prove safe down-migrations. Preserve original data and incident evidence.

**Evidence:** SHA/hashes, change approval, recovery references, rehearsal. **STOP:** unreviewed release, missing recovery point or destructive/untested rollback.

## 2. Additive migrations and application tests

**Owners:** developer, database operator.

- [ ] Inventory **18 filename-sorted migrations spanning `001`–`020`**: `001`–`014`, then `015_record_maintenance.mjs`, `017_notification_reliability.mjs`, `019_funding_lifecycle.mjs`, `020_tenant_lifecycle.mjs`. Gaps `016` and `018` are intentional.
- [ ] In isolated MySQL 8, run `npm run db:migrate` from `api`, then rerun; retain order/output and verify existing rows, cutover-marker behaviour and idempotency. Migrations precede the matching authorised deployment build.
- [ ] Complete integrated API/frontend and representative-volume tests with isolated fixtures: transactional audit rollback, stale-write conflicts, archive/restore, accurate totals, reporting snapshots and bounded exports. No production demo seed or `sync({ alter: true })`.

**Evidence:** manifest, rerun/schema/data checks, integrated test/build reports. **STOP:** migration failure, destructive DDL, data loss, unmounted remediation routes or incomplete tests labelled passed.

## 3. Binary Lane runtime and HTTPS

**Owners:** operator, developer, security reviewer; production actions separately authorised.

- [ ] Verify Ubuntu/MySQL 8, Node 22 via NVM, PM2, Nginx, Certbot, least-privilege database access, firewall and off-host log rotation. Require production mode, demo disabled, restrictive HTTPS origins, approved secret custody and server-side platform encryption; no browser secrets.
- [ ] Locked installs: API `npm ci --omit=dev`; frontend `npm ci --legacy-peer-deps`, retaining build dependencies. Run `npm audit --omit=dev` in **both** projects: zero production vulnerabilities. Serve compiled frontend only, never CRA's development server.
- [ ] Review `infra/deploy-binarylane.sh` (migrates/builds/reloads; does not provision providers) and `./infra/verify-binarylane-portability.sh`. Approved TLS pointer: `sudo ./infra/configure-binarylane-nginx-ssl.sh --expected-ip <BINARY_LANE_IPV4>`; static Nginx config is reference only.
- [ ] Verify certificate/renewal, HTTP redirect, deep links, API proxy, headers, Secure/HttpOnly/appropriate SameSite cookies, CSRF/origin enforcement and endpoint/perimeter rate limits. Check `/v1/health/live` and `/v1/health/ready` without tenant metadata/secrets.

**Evidence:** redacted runtime/audit/TLS/security results. **STOP:** exposure, invalid TLS, insecure cookies, vulnerabilities or origin/auth bypass.

## 4. Five roles, suspension, MFA, reset and approvals

**Owners:** developer, security reviewer.

- [ ] Test Organisation Administrator setup/people/policy/export authority; Portfolio Manager governed maintenance/report inclusion; Contributor assigned permitted fields only; Executive read-only; System Administrator platform operations only, not council workspace access.
- [ ] Test owner/same-tenant scope, cross-user/tenant denial, disabled users, stale sessions/role changes and suspended/closed/unknown tenant denial through real APIs. Authenticated ended-subscription recovery must not bypass suspension; payment cannot reopen security-suspended/closed tenants.
- [ ] Test mandatory admin TOTP enrolment, one-use recovery codes, fresh password/MFA step-up and expiry. Require dual-approved auditable MFA recovery, never informal bypass.
- [ ] Test registration/reset anti-spam, rate limits, non-disclosing responses, token expiry/single use and session invalidation. Regenerate secure flows after failed/uncertain delivery; never replay stored security messages.
- [ ] Verify independent quarterly reviewers, restricted report inclusion and independent lifecycle approval with legal reference/rationale; audit failure rolls back sensitive changes.

**Evidence:** five-role browser/API matrix and negative tests. **STOP:** privilege leakage, reset/MFA bypass or self-approval.

## 5. Stripe — TEST MODE first

**Owners:** developer, commercial owner, security reviewer; approved test environment only.

- [ ] Confirm matching test keys, Price IDs, signing secret and Portal configuration; no test/live mixing. Prices: one-off **AUD $495 Council Proof**, annual Essentials/Core subscriptions, displayed **excluding GST**, with approved tax behaviour.
- [ ] Test registration/checkout and verified payment/invoice activation; failed/cancelled checkout grants no access. At `POST /v1/billing/stripe/webhook`, verify signature against untouched raw body, duplicates/out-of-order events and exactly-once database/audit effects.
- [ ] Test portal payment-method/invoice access, approved plan switches, cancellation and refund success/failure/update events. Require fresh admin step-up/reason; refund does not automatically cancel subscriptions.
- [ ] Verify **full $495 Proof-fee conversion credit** communications/calculation: proceed within **30 days of final Proof review**. Record approved implementation; invent no eligibility or automatic-credit promise.

**Evidence:** redacted test events, state/audit reconciliation, commercial sign-off. **STOP:** live charge, duplicate effects, unsigned webhook or incorrect tax/credit. Live mode needs separate approval.

## 6. AWS SES — accepted versus delivered

**Owners:** mail operator, developer, security reviewer.

- [ ] Before separately authorised production sending, verify approved domain/identity, DNS authentication, region, SES sandbox/production authorisation, least privilege and approved-recipient scope. Keep delivery disabled until commissioned.
- [ ] Use fixed raw-body feedback routing before JSON parsing; independently pin exact trusted SNS topic, certificate URL, RSA key and validity. Require signature v2/RSA-SHA256, restricted publishers, independently confirmed subscription and certificate rotation. Never trust/fetch callback-supplied certificate or subscription URLs.
- [ ] Rehearse forged/stale/wrong-topic rejection, event-before-receipt handling and deduplication. Only with approval, send to approved recipients and reconcile receipts, signed delivery/bounce/complaint feedback and observed reception.
- [ ] Label MessageId/legacy `sent` **provider accepted**, not delivered. Signed `delivered` means recipient-server delivery, not read/inbox placement. Verify opt-in, policy, quiet hours, suppressions and disabled/stale recipient gates. Ambiguous timeout/crash becomes terminal `uncertain`, never automatic replay.

**Evidence:** private authorisation/DNS/trust references, redacted outcomes. **STOP:** missing authorisation/pins, unapproved recipients, false delivery claims or uncertain-send replay.

## 7. PRIVATE AWS S3 and Zoho inward mail

**Owners:** storage/mail operator, developer, security reviewer.

- [ ] Verify dedicated private S3, Block Public Access, encryption, no public ACL/policy, least-privilege prefix access and denied anonymous reads. No production local-storage fallback.
- [ ] Test owner/tenant permissions and cross-tenant denial; MIME/signature, size and three-attachment limits; safe filenames/authenticated downloads. Lifecycle attachment recovery remains human-supervised: no unscoped legacy downloader/public link.
- [ ] Verify versioning/retention and exact-version retrieval into private isolated quarantine; reconcile size/SHA256/ownership and decrypt authority where applicable. Rehearse coordinated DB/object restore; ETag/database backup alone is insufficient.
- [ ] Retain Zoho inward mail; verify approved reply/inward routing using authorised tests. SES is outbound only. No public email/`mailto:` or public Reply-To disclosure; assistance uses CivicPath forms.

**Evidence:** private access/version/hash/restore and routing records. **STOP:** public objects, ownership bypass, unsupported uploads, unrecoverable versions or wrong routing.

## 8. Exactly one scheduler owner

**Owners:** operator, developer.

- [ ] Record one owner/cadence/tenant allowlist ______. Current PM2 is one forked API instance; verify deployed ownership. Do not silently schedule legacy unbounded alerts/contact/Pulse transports.
- [ ] Test bounded reminder/outbox catch-up, overlap/lease fencing, restart failure/recovery and fresh heartbeat from actual work. Empty success is not delivery. Multiple replicas/separate workers require durable shared health or worker readiness, not misleading process-local heartbeat.

**Evidence:** ownership/configuration and restart/overlap/catch-up timeline. **STOP:** duplicate owners, stale/fake-green heartbeat or unbounded scan.

## 9. Encrypted off-host backups, restore and retention

**Owners:** operator, security reviewer, legal/records owner.

- [ ] Approve cadence/retention, independent off-host destination/access and separately escrowed high-entropy key. Reviewed `infra/resilience/backup_restore.py` subcommands: `backup`, `verify`, `upload`, `restore-rehearsal`; use documented explicit acknowledgements in `docs/REMEDIATION_RESILIENCE.md`. No production restore command exists.
- [ ] Verify encrypted integrity, immutable uploaded version IDs and **exact-version readback**, then isolated decryption/import plus schema/row/content/application/tenant/auth reconciliation. `verify` alone or throwaway-key drills are not operational recovery.
- [ ] Record approved RPO ______ / RTO ______ and **measured** effective RPO ______ / RTO ______ with timestamps/scale, objects and key availability. Reapply hold/closure/access state before exposure; prevent billing/email replay. Never overwrite/drop production.
- [ ] Obtain legal/leadership policy and hold treatment for DB, exports, backups, object versions/replicas and provider records. Closure preserves data. **Destructive deletion stays OFF**; retention approval remains blocked without policy. Export TTL is not workspace retention.

**Evidence:** private off-host/restore reports, measured recovery and policy references. **STOP:** missing key/version, unreconciled restore, unverified RPO/RTO, hold conflict or deletion enabled.

## 10. Smoke, monitoring and release approval

**Owners:** developer, operator, release approver.

- [ ] Run candidate HTTPS five-role/mobile/keyboard smoke, health/readiness, workflows, attachment/export and security-negative checks. No customer/production seeding.
- [ ] Commission independent off-host monitoring, alert ownership/delivery and approved thresholds including backup age/jobs. `node infra/resilience/service_checks.mjs --config=/PRIVATE/checks.json` needs genuine environment-matched evidence; `node infra/resilience/monitor.mjs --config=/PRIVATE/checks.json --state=/PRIVATE/monitor-state.json` is one finite poll, not an installed schedule. `--allow-unconfigured` is diagnostic, never acceptance.
- [ ] Review evidence, unresolved gates and rollback. Decision ______; approver/signature ______; approval date/time ______; authorised scope ______. Disabled features need express approval; otherwise stop release.

**Evidence:** smoke/alerts and signed decision. **STOP:** failed mandatory gate, fabricated evidence, absent approval or unauthorised production activity.

## Supporting references

Repository docs: `NINE_AREA_REMEDIATION_2026-11.md`, `BINARY_LANE_DEPLOYMENT.md`, `REMEDIATION_RESILIENCE.md`, `REMEDIATION_NOTIFICATIONS.md`, `REMEDIATION_LIFECYCLE.md` under `docs/`. Current infra scripts were read, not executed.

Provider guidance supplied/verified separately: [Stripe webhooks](https://docs.stripe.com/webhooks) and [AWS SNS signature verification](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html). These explain verification requirements; they are **not evidence of commissioned external services**.
