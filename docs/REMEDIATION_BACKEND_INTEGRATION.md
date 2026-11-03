# Backend integration remediation

Shared root: `/home/ubuntu/civicpath-app-rolehelp-publish`, starting HEAD `e8165af`. Changes are left unstaged and uncommitted for the parent. No frontend, dependency, migration, daemon, credential, provider or production operation was performed by this integration task. Other agents' simultaneous work is not included in the owned-file list below.

## Mounted boundaries and permission matrix

Public `/v1/health`, `/live`, `/ready` use the existing SELECT-1 readiness probe and 120/minute health limiter before authentication. `/live` never depends on database/jobs. Raw `/v1/provider-feedback/notifications` is mounted before global JSON; empty trust pins keep it disabled (503). No callback certificates or URLs are fetched.

`/admin` remains authoritative platform-only authentication before generic council authentication. Its lifecycle subrouter uses the already-verified platform identity: authenticating again under nested `/v1/admin/tenant-lifecycle` would incorrectly default to council audience. Lifecycle controllers independently revalidate their actors. Tenant `/tenant-lifecycle` is after authentication/tenant scope but before entitlement, allowing unsuspended org-admin recovery without an active subscription. Suspended/closed/unknown tenants remain denied.

After entitlement: maintenance and its established project/action/milestone PATCH aliases; reporting at its own relative paths and own persisted-role restrictions; funding at the `/v1` level (not `/funding-lifecycle`); authenticated `/notifications`; review-workflow extensions. Legacy project/action/milestone PATCH registrations and raw snapshot/funding writers are removed. Direct imports of old PATCH exports delegate to maintenance as well. The raw legacy snapshot writer is removed, not just shadowed.

| Capability | org_admin | portfolio_manager | contributor | executive/platform |
| --- | --- | --- | --- | --- |
| Project/readiness create | yes | yes | no | no |
| Work/evidence create | yes | yes | own/unassigned context or assigned project participation only; no reassignment/verification | no |
| Profile edit | yes | no | no | no |
| Maintenance | standalone permissions and expected timestamp/version contracts | same | assigned delivery subset only | executive reads only/platform denied |
| Reports | read/save draft | read/save draft | denied | executive reads only/platform denied |
| Funding | standalone explicit manual lifecycle roles/contracts | same | standalone approved writes | executive reads only/platform denied |
| Notifications | own prefs/inbox plus tenant policy | own prefs/inbox | own prefs/inbox | executive reads only/platform denied |

## Runtime exports and archive behavior

New `api/src/backendRuntime.js` exports `jobHeartbeats`, `healthService`, `activeRecordWhere`, `withActiveRecords`, `activeRecordsMiddleware`, `installActiveReadHooks`, `ACTIVE_REGISTER_LIMIT`, `completeActiveRegister`, `integrationError`, `handleIntegrationError`, `assertCreateActor`, `assertTenantReference`, `validateCreateReferences`, `SAFE_JOB_POLICY`, `createSafeJobCycle`, `selectSafeNotificationTenants`, and `runSafeNotificationCycle`.

One AsyncLocalStorage-scoped read policy applies tenant-correlated `NOT EXISTS` archive predicates **before SQL LIMIT**, not frontend filtering or loaded-page filtering. Frozen model/sidecar maps supply every identifier; no request-supplied SQL identifiers are accepted. Active legacy portfolio/dashboard/work/evidence/strategy/support views exclude maintenance archives; grant/pathway sidecars and archived project/grant/action parents are checked. Included associations use their actual Sequelize aliases and retain optional JOIN semantics. Retained maintenance/lifecycle reads are outside this context and remain available for authorized recovery. The report repository explicitly uses the same predicates for every bounded source section; snapshots remain immutable.

Projects/work/evidence retain `{data: array}` complete-register contracts. More than 5,000 matching active records returns an explicit 413, never partial totals. Dashboard portfolio totals now use the complete active register while returning its first eight display cards; latest readiness is deduplicated by project, genuine zero survives, absent assessments are null. Complete dashboard pathways/readiness use the same oversize guard. Parent owns realistic volume/performance verification.

Strategy reportPackage measures recorded ActionEvidenceLink coverage, not readiness; it sums all matching status categories and counts distinct included active-action updates. Archived evidence/support and inactive parents are excluded server-side. Funding aggregates are separated by currency; a single aggregate is null for mixed currencies. Workspace GET no longer creates status definitions as a side effect. Strategy/milestone/project PATCH callers must use `changes`, `expectedUpdatedAt`, `expectedVersion`. Quarterly narrative creates require `expectedVersion:0`, edits/workflow use their current version and existing independent-review rules.

## Transactional integrity and notification gates

Project/readiness/work/evidence/priority creates and profile edits put the primary/dependent writes and required audit in one managed transaction. Actor guards lock organization then persisted actor, require the current role/session version and allowed tenant state, revalidate same-tenant active owner/reference rows, reject incompatible grant/project links and contributor reassignment/verification. Selector and constraint references are retained through their existing validation service, not duplicated maintenance logic. CSV project imports put all rows and required audit in the transaction; legacy grant CSV commit is explicitly denied in favor of the provenance/lifecycle-controlled manual funding register.

Collaboration notify creates each persisted notification row explicitly and awaits its outbox/audit enqueue inside the business transaction (no MySQL bulkCreate-ID assumption). Existing account/security transactional callers already return canonical `accepted|disabled|failed|uncertain`; legacy compatibility `sent` receipts mean provider accepted only, not inbox delivery. No new replay of reset/invitation messages is introduced.

Optional notifications now recheck an active, unexpired subscription alongside current user/organization, own-user opt-in, tenant email policy and provider configuration. Source resources and their project/action parents check maintenance archive sidecars before send. The isolated notification flow now creates its own active plan/subscriptions rather than bypassing entitlement. Stripe verified purchase locks the tenant and records subscription truth + audit atomically but only activates tenant/users when the authoritative status is trial/active; payment cannot restore manual/security suspension or a closed/unknown tenant.

## Real scheduler, catch-up and health semantics

`registerScheduledJobs` is async and idempotent, test-disabled, with injectable scheduler/registry/cycle for tests. It registers only `reliable_notifications`, wraps actual finite work through the one shared registry, prevents process-local overlaps and runs genuine startup catch-up. Failure leaves heartbeat unready; it is not marked successful by registration. Each cycle selects at most ten configured-policy tenants with a rotating bounded cursor, rechecks active tenant/subscription, reads tenant remindersEnabled, visits at most two 25-request reminder pages per tenant and dispatches at most 25 outcomes using an explicit approved allowlist. Email still requires both organization and user opt-in at enqueue and immediately before send. Empty selection is a genuine completed policy sweep, **not delivery evidence**.

The prior log-only due-date placeholder is gone. Legacy Pulse/contact retry transports lack the new tenant/user opt-in/uncertain-send contract and the legacy strategy alert generator scans unbounded sources: they are deliberately **not registered or scheduled**, not fabricated healthy jobs. Their interactive/public code remains outside this scheduler integration. Commissioning them requires separate bounded safe transport work. Test health may be database-ready with `backgroundJobs:not_configured`; production requires genuinely healthy registered jobs. Heartbeats are process-local, not durable or cross-worker health. External/split workers require a separately commissioned durable readiness adapter.

## Validation and parent acceptance

Executed without DB/provider access:

```sh
node --test api/tests/backendIntegration.test.mjs
# 7/7 passing: mount order/removal, SQL aliases/tenant/archive-before-LIMIT,
# test-disabled readiness, bounded policy cycles, real fake-scheduler catch-up,
# required-audit rollback across five legacy handlers, explicit service gates.

node --test api/tests/backendIntegration.test.mjs api/tests/recordMaintenance.test.mjs \
  api/tests/reportSnapshots.test.mjs api/tests/notificationReliability.test.mjs \
  api/tests/tenantLifecycle.test.mjs api/tests/suspensionEnforcement.test.mjs \
  api/tests/fundingLifecycle.test.mjs api/tests/resilienceHealthRouter.test.mjs \
  api/tests/reviewIntegrity.test.mjs
# 113/113 passed.

node --test api/tests/backendIntegration.test.mjs api/tests/notificationReliability.test.mjs \
  api/tests/reportSnapshots.test.mjs
# Latest focused rerun: 30/30 passed.
```

All owned JS/MJS pass `node --check`; `git diff --check` passes. App import with dotenv explicitly suppressed succeeds without connection/listen. Existing Sequelize SQL generator validated project/readiness, action/linked-project and action-evidence/parent-action queries without DB access. Fake transaction tests prove application control flow only, not MySQL isolation.

Parent supplies/runs its **actual HTTP + isolated MySQL** `api/tests/maintenanceReportingFlow.mjs` (not edited here), including archive-filtered projects/evidence, trigger-forced rollback and concurrent immutable snapshot versions. Also rerun historical `strategyDeliveryFlow.mjs`, `collaborationTransactionRollback.mjs` (auth/version fields updated), and `notificationReliabilityFlow.mjs` using the parent's test harness. No actual HTTP/DB acceptance is claimed by this task. Parent owns full suite, migrated DB integration, notification signed fixture rehearsal, benchmark, dependency audit, browser/build, backup/restore and deployment gates.

## Owned changed files

- `api/src/backendRuntime.js`, `api/src/index.js`, `api/src/scheduledJobs.js`
- `api/src/routes/v1/index.js`, `api/src/routes/v1/admin.js`
- `api/src/controllers/projectController.js`, `portfolioController.js`, `workspaceController.js`, `dashboardController.js`, `importController.js`, `strategyController.js`, `collaborationController.js`, `stripeBillingController.js`
- Parent-expanded service scope: `api/src/services/reportRepository.js`, `api/src/services/notificationReliabilityService.js`
- `api/tests/backendIntegration.test.mjs`, `notificationReliabilityFlow.mjs`, `strategyDeliveryFlow.mjs`, `collaborationTransactionRollback.mjs`
- This document.

No edit to parent `errors.js`, lifecycle export policy/repository, performance/maintenance-reporting acceptance files, frontend, schemas or dependency files. No staging, commit or push.
