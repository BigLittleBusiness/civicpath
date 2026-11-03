# Area 7 — Reliable notifications and opt-in policy

## Scope and integration contract

This is standalone source for branch `remediation/notifications`. No central route, controller, cron, App, Settings, model registry, package or environment template is changed. Migration **017_notification_reliability.mjs** is additive, forward-only, rerunnable and explicitly creates missing tables/columns/indexes; it never calls schema sync/alter/drop or changes existing delivery enums. It is automatically picked up by the existing numbered migration runner. Run it after the parent’s 015/016 migrations and rehearse it twice on isolated MySQL8 before deployment.

### Routes

`api/src/routes/v1/notifications.js` exports:

```js
createNotificationRouter({ authenticate = requireAuth, repository = createNotificationRepository() } = {})
createNotificationFeedbackRouter({ verifier = createPinnedSnsVerifier(), applyFeedback = applyVerifiedNotificationFeedback } = {})
```

Parent mounts the authenticated router at `/v1/notifications` (or `router.use('/notifications', createNotificationRouter())` within v1). Preserve existing session, active entitlement, CSRF/origin, request size and error-handling middleware. The router itself authenticates and rate-limits; controllers re-read current user role, session version, organisation and tenant identity, including on mutation within locked transactions. **Do not mount these under an unauthenticated public router.** `req.auth` must contain `{sub, organizationId, role, sessionVersion}` from verified session auth. Do not derive a tenant/user from request body or query.

Endpoints:

| Method/path below `/v1/notifications` | Response/action |
|---|---|
| GET `/preferences` | `{data:{preferences,policy,canEdit,providerConfigured}}`; safe default email off |
| PUT `/preferences` | Own preferences only; exact fields `emailEnabled:boolean`, `frequency:'daily'|'weekly'`, `quietStart:'HH:MM'`, `quietEnd:'HH:MM'`, `timezone:IANA string`; unknown fields rejected |
| GET/PUT `/policy` | Organisation administrator only; exact fields `emailEnabled`, `digestsEnabled`, `remindersEnabled` (booleans) |
| GET `/inbox?limit=20&cursor=...&unread=true` | `{data:{items,nextCursor}}`; max 50; stable createdAt/id keyset pagination |
| PATCH `/inbox/:id/read` body `{}` | Own same-tenant current in-app record only; audited, idempotent read marker |
| GET `/delivery?limit=25` | Organisation administrator outcomes; max 50; no recipient hashes, addresses, provider IDs, bodies or security links returned |

The exported `createNotificationController({repository})` in `controllers/notificationController.js` is dependency-injected for DB-free authorization tests. The default repository is `createNotificationRepository()` in `services/notificationRepository.js`.

### Permission matrix

| Actor | Own inbox/prefs read | Own prefs/read-marker write | Tenant policy/outcome read | Tenant policy write |
|---|---:|---:|---:|---:|
| org_admin | yes | yes | yes | yes |
| portfolio_manager/contributor | yes | yes | no | no |
| executive | yes | **no** | no | no |
| platform_admin/unknown role | no | no | no | no |
| unauthenticated/disabled/stale-session/suspended tenant | no | no | no | no |

There is no cross-user preference mutation, no cross-tenant administrative override, no replay endpoint and no callback-based suppression override. Global hashed-recipient bounce/complaint suppression intentionally applies across tenant memberships of the same address. There is no self-service unsuppression path.

### Frontend exports

```js
import { NotificationPreferencesPanel } from './components/NotificationPreferencesPanel';
import { NotificationInboxPanel } from './components/NotificationInboxPanel';
import { ReliableNotificationDeliveryPanel } from './components/ReliableNotificationDeliveryPanel';

<NotificationPreferencesPanel role={user.role} />
<NotificationInboxPanel role={user.role} />
// Only render within organisation administrator UI:
<ReliableNotificationDeliveryPanel />
```

Panels also accept `client=api` injection for tests. Parent inserts preferences in Settings and inbox within authenticated collaboration/strategy UI or a dedicated authenticated tab. Executive is read-only. The outcome panel is **tenant organisation-admin**, not the existing platform monitor, and the API enforces this. Scoped `notificationReliability.css` is imported by the panels. No arbitrary HTML or payload URL is rendered. UI includes loading, empty, retry/error, saving, status announcements, accessible fieldsets/labels, keyboard focus and responsive layouts. No arbitrary notification links are followed; users open the normal collaboration workspace to inspect fresh content.

### Transactional enqueue hooks

`services/notificationReliabilityService.js` exports:

```js
enqueueCollaborationNotification({ notification, transaction, now = new Date() })
// notification is an existing persisted CollaborationNotification instance.
// It is looked up again with tenant + user scope; the business transaction is required.

enqueueCollaborationReminders({ organizationId, limit = 25, afterId = null, now = new Date() })
// Returns { scanned, created, nextCursor }. Max 25; caller passes approved tenant ID.
// Scans open/changes_requested assigned requests due within 3 days / overdue <=7 days.
// Caller paginates by nextCursor; each enqueue+audit commits atomically.

dispatchReliableNotifications({ organizationIds = [], limit = 25, now = () => new Date(), store, sender = sendGenericSesNotification } = {})
// Returns claimed/accepted/inApp/suppressed/retried/failed/uncertain/lostLease/errors counters.
// Default empty tenant allowlist is a SAFE NO-OP. At most 100 approved UUID tenant IDs.
// Max batch 25; 120-second lease; 15-second SES timeout; sequential bounded sending.

createNotificationStore({ organizationIds = [], getConfiguration = () => getPulseRoutingSettings({includeSecrets:true}) } = {})
sendGenericSesNotification({to,config,message,outboxId}) // {providerReference}; existing AWS SES SDK
currentNotificationContext(organizationId,userId,transaction)
notificationSourceIsCurrent(row,now = new Date(),transaction)
```

Parent should modify its private collaboration `notify()` helper, after creating CollaborationNotification rows **inside the same business transaction**, to call `enqueueCollaborationNotification({notification:row,transaction})` for each returned persisted row and await all required writes. If bulkCreate does not return IDs on the installed MySQL dialect, explicitly create rows or query generated IDs inside the transaction; never call enqueue after commit or use a content-derived key. Required audit/outbox failure rolls back the business operation. Do not store or pass title/detail/body/reset/invitation links into the outbox.

Parent owns scheduler wiring. **No live schedule is activated here.** For a controlled finite cycle, select approved current tenant IDs with the parent’s entitlement/suspension controls; invoke bounded reminders with cursor pagination, then dispatch with that allowlist. Do not enable a global unbounded tenant/user scan. Production scheduler frequency/overlap monitoring is a deployment responsibility; test mode must not activate it. The DB transaction locks claims before assigning a random lease token; all state updates are fenced by row+tenant+user+lease token. A duplicate scheduler invocation cannot claim the same lease.

## State, opt-in and reliability behavior

Two approved kinds only: `collaboration_digest` and `collaboration_reminder`. In-app cards and email use fixed generic text. No outbox field stores a title, body, raw email, URL, invitation or reset token. Existing source references are tenant-scoped and revalidated against current user, organisation, resource, unread notification/open request and freshness; completed/deleted/archived content is suppressed, not replayed. In-app defaults on. Optional email requires explicit own-user opt-in **and** enabled tenant policy **and** configured existing SES **and** no hashed-recipient suppression at send time. User is active; tenant is trial/active and not deleted/suspended; unsupported roles are excluded. Parent entitlement gating still applies.

Daily/weekly means **at most one email per category per local-day/local-week bucket**, not an exact wall-clock delivery SLA. Source hooks coalesce events into one generic email, rather than sending private summaries. Quiet hours are interpreted in a validated IANA timezone, including DST and overnight windows; equal boundaries mean no quiet window. Defaults are email off, daily frequency, 20:00–08:00 UTC. Frequency/timezone changes suppress previously queued schedule metadata rather than send at the wrong cadence. Opt-out and tenant policy disabling atomically cancel pending/leased email with audit; dispatch rechecks preference and status immediately before SES. An already in-flight provider call cannot be recalled.

Outbox states include `pending`, `leased`, `sending`, `in_app`, `accepted`, `delivered`, `bounced`, `complained`, `failed`, `suppressed`, `uncertain`. `accepted` means SES returned MessageId, **not delivered to inbox**. `delivered` only comes from authenticated signed provider feedback and still does not mean read or guarantee inbox placement. Adverse feedback cannot be overwritten by delayed delivery events. Retry attempts are capped at five with bounded exponential backoff+jitter, **only for explicit safe provider throttling rejection**. AWS SDK automatic retries are disabled (`maxAttempts:1`). Network timeouts, ambiguous failures and expired `sending` leases are terminal `uncertain`, never automatically resent. Expired pre-send `leased` work is safely reclaimable. This is durable at-most-once-after-uncertain acceptance, not exactly-once SES delivery (SES SendEmail has no idempotency token). If required state writes fail, workers emit only counters/error codes and rely on bounded lease recovery, never log raw SDK responses.

### Account/reset/invitation delivery

The existing `sendTransactionalEmail({to,message,organizationId=null,userId=null,category='transactional'})` signature remains, but returns canonical `{status:'accepted'|'disabled'|'failed'|'uncertain',providerReference?,errorCode?}`. The raw freshly generated message exists only in memory. It records a `ReliableNotificationDelivery` metadata receipt **before** the provider call; receipt unavailable means no send. Recipient status/tenant/email/suppression is rechecked. Security messages are never added to the replayable outbox, never automatically retried, and use existing secure reset/reinvite/account flows to regenerate links. It preserves a generic outcome in the old `NotificationDelivery` table for monitor compatibility; legacy `sent` explicitly means provider accepted, not delivered. The new reliable receipt is authoritative. AWS calls use 15-second abort and no internal retries; no public Reply-To address is exposed. Internal operations continue routing only to the existing protected contact mailbox, and assistance remains through CivicPath forms.

**Parent integration change required:** existing PeopleAccessPanel toast logic currently compares `delivery.status === 'sent'`. Change it to `=== 'accepted'` and say “Invitation accepted by the configured email provider; inbox delivery is not confirmed.” Handle disabled, failed and uncertain separately; never claim delivered. Other caller UI must similarly distinguish these states. Existing platform monitor may continue legacy `sent` only if labeled “provider accepted”.

## Signed provider feedback — disabled by default

`services/notificationFeedback.js` exports:

```js
createPinnedSnsVerifier({pins = {}, now = () => new Date()} = {})
// {enabled,verify(rawBody:Buffer)} -> normalized outcome-only event
snsSigningString(envelope) // test helper
```

The default empty trust map makes the endpoint return **503 disabled**. Nothing fetches `SigningCertURL`, `SubscribeURL` or `UnsubscribeURL`. SubscriptionConfirmation/UnsubscribeConfirmation and signature v1 are rejected. Do not substitute a session token, arbitrary callback secret or unsigned SNS payload.

To enable, independently provision **public** trust keys/certificates through the deployment operator’s authenticated AWS process, not from an incoming request. Map exact allowed SNS TopicArn to `{signingCertUrl,publicKeyPem,validFrom,validUntil}`. `signingCertUrl` must be the exact independently pinned URL on `https://sns.<same-region>.amazonaws.com/SimpleNotificationService-<alphanumeric>.pem`; RSA key must be >=2048 bits; validity interval must match the operator’s verified trust certificate lifecycle. Pin lookup uses exact allowed topic and URL. The verifier checks SNS signature v2 RSA-SHA256 over canonical fields, a maximum 64KiB raw body, notification type, freshness (<=24h and <=5min future), topic region/account/name format, certificate host/path, pin validity, supported SES outcome/MessageId and recipient validation. Topic IAM policy must permit only the intended SES account/service and deny other publishers. Operators must confirm SNS subscription independently and maintain pinned certificate rotation; this source never confirms callback URLs.

Parent mounts `/v1/provider-feedback/notifications` (or another fixed path) **before global `express.json()`**, using the exported raw-body feedback router with configured verifier. If the existing middleware already consumed/parses bodies, keep integration disabled until ordering is corrected. Do not expose provider raw data in logs. `applyVerifiedNotificationFeedback(event)` is an **internal trusted sink**, not a public controller; call only after verifier success. It dedupes by event hash, matches provider MessageId + recipient hash, stores normalized outcome-only metadata, applies bounce/complaint suppression and audit transactionally. Unmatched receipts produce retryable 503 and roll back dedupe (handles event-before-receipt race). Unknown events must never suppress arbitrary recipients.

No SES credentials, external calls, subscribed topic, certificates, inbox delivery or production sending were inspected or tested in this task. Therefore this is safe gated integration, not an operational feedback service. Operator trust provisioning and an isolated signed fixture rehearsal are prerequisites.

## Tests and validation

```sh
# DB-free helpers/worker/roles/retries/signatures/migration rerun tests:
node --test api/tests/notificationReliability.test.mjs

# Parent’s isolated MySQL8 only, after existing schema migrations:
CIVICPATH_NOTIFICATION_TEST_ISOLATED=1 NODE_ENV=test node api/tests/notificationReliabilityFlow.mjs

# Frontend via existing permitted node_modules:
cd frontend
CI=true node node_modules/react-scripts/bin/react-scripts.js test --runInBand --watchAll=false
CI=true node node_modules/react-scripts/bin/react-scripts.js build
```

The isolated flow refuses production/missing explicit guard, creates two random test tenants, uses an injected fake SES sender/config only, scopes claims to those tenant IDs and cleans only its own fixtures. It covers migration rerun, safe defaults, user+tenant opt-in, concurrent claiming/idempotency, same-tenant wrong-user and cross-tenant inbox ownership, executive read-only preferences, read marking, opt-out, disabled user, suspended tenant, stale resource, audit rollback, signed-sink dedupe and complaint suppression. It does not start a DB/daemon.

Verified locally: 12 notification unit tests passed; 7 notification React tests passed; full existing frontend suite 19 tests in 5 suites passed; frontend production build compiled successfully. The API `.test.mjs`/readiness run had 31 passing tests and one existing ALTCHA DB-dependent failure (`ECONNREFUSED 127.0.0.1:3306`) because no local DB was started; parent must rerun against its isolated DB. The isolated notification DB flow is supplied for parent execution, not claimed locally executed. No dependency/package changes. Frontend standalone components are not imported into the central production bundle until parent integration; React tests exercise their compilation/rendering separately.

## Remaining release gates / limitations

Parent must run actual MySQL8 migration+rerun/integration flow, full API suite, clean production install/audit, authenticated UI integration smoke tests at mobile/tablet/desktop sizes, CSRF/origin checks and appropriate trusted SES feedback fixture tests before release. No staging/production deployment, external browser/provider requests, GitHub push or paid services occurred. Optional email is disabled by default and unconfigured providers suppress queued mail rather than automatically resurrect old content once configuration changes. No backlog backfill of existing collaboration notifications is performed; only parent-integrated source hooks generate new outbox records. Expired notifications remain operational metadata until parent-approved retention cleanup; no destructive purge jobs are introduced. Inbox freshness checks are capped at 50 source/resource lookups per page (bounded conservative N+1); a batched resource-loader is a possible measured-volume follow-up. The last-instant status race with a provider call cannot be eliminated without holding DB locks over external I/O; status is rechecked immediately before sends but messages already accepted cannot be recalled. Single-use transactional `sending` receipts after a process crash indicate unknown acceptance and must never be replayed; operator review/fresh secure regeneration is required.
