# Area 8 — controlled tenant ownership, export, retention and exit

Implemented in branch `remediation/lifecycle` from published `a7651d1`. All changes are standalone files. Central route registries, settings/admin pages, model registries, application entry points and package manifests/locks are deliberately untouched. No production data, database, daemon or external provider was used.

## Integration required in parent-owned files

### API

Import the standalone routers into `api/src/routes/v1/index.js` (or the parent-owned application router):

```js
import { tenantLifecycleRouter, tenantLifecycleAdminRouter } from './tenantLifecycleRouter.js';
```

**Mount the recovery router before `requireActiveEntitlement`, not after it.** It includes its own `requireAuth`, current-user/role/session/tenant revalidation and suspension checks. Keep it under the normal HTTPS/session/CSRF/CORS/JSON/security middleware. It must not become an unauthenticated route.

```js
router.use('/tenant-lifecycle', tenantLifecycleRouter);
router.use('/admin/tenant-lifecycle', tenantLifecycleAdminRouter);
// Existing tenant workspace entitlement middleware follows; do not bypass it for unrelated routes.
```

If the platform router is instead mounted inside parent-owned `admin.js`, use `adminRouter.use('/tenant-lifecycle', tenantLifecycleAdminRouter)` and omit the duplicate `/admin` prefix. Parent must place its CSRF guard and privileged-system MFA guard ahead of these mounts. This router additionally requires `requireStepUp` on every platform review POST. `createTenantLifecycleRouters({ auth, controller })` supports isolated router testing/injection; production must use its defaults or a fully equivalent authentication implementation.

Run the additive migration **only in the isolated non-production harness first**:

```sh
node db/migrations/020_tenant_lifecycle.mjs
node db/migrations/020_tenant_lifecycle.mjs
```

`db/migrate.mjs` will discover this numbered file automatically. There is no `sync`, `alter`, drop, purge or uncontrolled data transformation. Tables/columns/indexes are created only when absent. It references existing `Organization` and `User` tables with `RESTRICT` deletes. Do not register these models centrally: `api/src/models/tenantLifecycleModels.js` already defines them on the existing Sequelize connection with no central-file edit.

Exports require the **existing** server-side platform encryption configuration. `encryptConfiguration`/`decryptConfiguration` provide AES-256-GCM. If it is unavailable, export generation fails safely, status is recorded as failed, and no plaintext artifact is stored or returned. No new environment/template/dependency changes are required or included.

### Frontend

Parent-owned settings/integration pages can import:

```js
import { TenantDataPanel } from '../components/TenantDataPanel';
import { TenantLifecycleAdminPanel } from '../components/TenantLifecycleAdminPanel';
```

Render `<TenantDataPanel role={user.role}/>` for organisation administrators; executives can see the read-only view. **Also expose this same panel on the authenticated ended-entitlement recovery screen** outside any active-subscription UI redirect/guard. Do not expose it to anonymous users, invited/disabled users or suspended tenants. The API remains authoritative.

In the System Administrator Council customer drawer or detail view, render:

```jsx
<TenantLifecycleAdminPanel organizationId={customer.id} role={user.role}/>
```

The platform panel uses the existing `PrivilegedActionModal` for fresh password/authenticator confirmation before review/approval/rejection. It lists tenant-scoped lifecycle and private attachment requests, records review rationale and requires human approval reference, backup and object-version verification for approval. Parent owns central settings/App/admin insertions; none are edited here.

### Closure-access coordination with the platform/access remediation owner

`closeTenantWorkspaceAccess({ organization, state, now, transaction })` in `api/src/services/tenantLifecycleAccess.js` is the narrow atomic helper, called only after independently verified platform approval and a locked legal-hold check. It:

1. Sets the organisation to the existing `suspended` status.
2. Disables every user in that tenant and increments `sessionVersion` atomically, invalidating existing tokens and blocking new active-user sessions.
3. Consumes outstanding tenant invitations.
4. Sets lifecycle `closedAt` and writes a `TenantStateEvent` in the same transaction as approval and audit.

It **does not cancel billing/provider subscriptions** or call external services. Parent's access helper may replace/complement this implementation if it preserves these exact effects and the transaction boundary. Merely reactivating the organisation is not enough to undo closure; users remain disabled and require a separately authorised recovery/reopening process, which is not implemented here.

## Exported server interfaces

- `api/src/routes/v1/tenantLifecycleRouter.js`: named `tenantLifecycleRouter`, `tenantLifecycleAdminRouter`, `createTenantLifecycleRouters`; default tenant router.
- `api/src/controllers/tenantLifecycleController.js`: `tenantLifecycleService`, `tenantLifecycleController`, `createTenantLifecycleController`.
- `api/src/models/tenantLifecycleModels.js`: `lifecycleDefinitions`, `lifecycleModels`, `TenantLifecycleState`, `TenantLifecycleRequest`, `TenantWorkspaceExport`, `TenantAttachmentRequest`.
- `api/src/services/tenantLifecycleService.mjs`: `createTenantLifecycleService({ repository, encrypt, decrypt, limits, now })`, dependency-injected and DB-free testable.
- `api/src/services/tenantLifecycleRepository.js`: `tenantLifecycleRepository`, `exportSummary`; uses current Sequelize models with explicit export attributes and tenant scoping, repeatable-read export snapshot and locked mutation transactions.
- `api/src/services/tenantLifecyclePolicy.mjs`: `EXPORT_SCHEMA`, `EXPORT_LIMITS`, `LIFECYCLE_POLICY`, `LifecycleError`, `authorizeActor`, `collectTenantGraph`, `projectExportRow`, `scrubJson`, `redactForeignReferences`, `attachmentManifest`, `reviewTransition`, `assertExecutionAllowed`, validation helpers.
- `api/src/services/tenantLifecycleAccess.js`: `closeTenantWorkspaceAccess`.
- `api/db/migrations/020_tenant_lifecycle.mjs`: `applyTenantLifecycleMigration` with injected DDL interface for rerun tests; direct-run guarded migration entry point.

## Permission matrix and endpoints

| Operation | Org admin, active user | Executive, active user | Contributor / manager | Platform admin |
| --- | --- | --- | --- | --- |
| `GET /tenant-lifecycle` | Own unsuspended tenant only, audited | Own unsuspended tenant, read-only, audited | Denied | Denied on tenant router |
| `POST /tenant-lifecycle/exports` | Own unsuspended tenant, even without entitlement | Denied | Denied | Denied |
| `GET /tenant-lifecycle/exports/:id` and `/download` | Own tenant artifact only; status/download audited | Denied | Denied | Denied |
| `POST /tenant-lifecycle/requests` | Own tenant only; closure/retention/hold/release request | Denied | Denied | Denied |
| `POST /tenant-lifecycle/attachment-requests` | Own current attachment/parent only | Denied | Denied | Denied |
| `GET /admin/tenant-lifecycle/:organizationId` | Denied | Denied | Denied | Current role revalidated; bounded request queue, audited |
| `POST /admin/tenant-lifecycle/:organizationId/requests/:requestId/review` | Denied | Denied | Denied | Fresh step-up, independent reviewer, tenant scoped, verified approval |

Every business mutation + required audit commits or rolls back together. Organization-row locking serializes export reservations, holds, requests and sensitive reviews. A role/session change since JWT issue fails authentication. The legacy tenant schema does not distinguish security suspension from other suspension; **all `suspended` tenants are denied recovery access**, deliberately fail-closed. No endpoint lets the caller choose another tenant ID on the council router.

## What a workspace export contains

A downloadable JSON document contains `manifest`, `data`, and `attachmentManifest`. The manifest states schema version, snapshot time, current-row scope, selected fields, relationship references, table counts, explicit exclusions and whether the graph is complete. An export is either complete within bounds or failed; a truncated graph is never returned as complete.

The reviewed positive model/attribute allowlist includes current organization/user directory, safe billing/subscription metadata, safe integration status, authorised contacts/handover notes, support requester metadata, tenant selectors/overrides and safe shared platform selector catalog (only null-tenant catalog rows, never another tenant), priorities, projects and joins/selectors/constraints/readiness/funding, grants/work items/evidence, the full current strategy/action/milestone/dependency/reporting/measure/decision/stakeholder/risk/funding/evidence/alert/report-snapshot graph, every current collaboration participant/thread/comment/request/activity/commitment/funding-room/checkpoint/engagement/decision-pack/review-pack/question/outcome/watch/notification model, safe audit event fields and tenant lifecycle/private-attachment request metadata.

Excluded: password hashes; MFA secrets/recovery codes/verification fields; all auth/reset/invitation/session/token material; platform settings; provider configurations/secrets/references; internal customer notes; internal/admin financial notes; unrestricted audit metadata/IPs; private storage keys; URL credentials/query/fragment (including signed URLs); other tenants; public prospect/enquiry records; soft-deleted history; raw attachment binaries. Safe support `summary` is the requester-supplied summary only. Nested JSON scrubs sensitive keys/foreign tenant objects; foreign/unresolvable user/resource references are nulled and counted rather than dereferenced into another tenant or platform staff data. Future models/columns are **not auto-exported**: maintain and security-review the allowlist as the parent integrates new models.

`SupportAttachment` metadata and document `EvidenceItem` records produce a safe request descriptor, e.g. `POST /v1/tenant-lifecycle/attachment-requests` with `{kind, attachmentId}` and an active org-admin session. No storage key, public URL or signed download link is exposed. Request creation verifies current tenant and support-case ownership and records an audited private-delivery request; the platform panel displays its queue. **Actual binary delivery is intentionally human supervised and not automated** because no safe tenant recovery storage/downloader contract was supplied. Never route these requests to the unscoped legacy admin attachment downloader.

## Resource controls and artifact privacy

- Keyset pages of 200, 20,000 total rows, 8 MiB final JSON, cooperative 12-second graph deadline, 60-second crashed-build lease.
- At most two in-process builders; organization lock enforces one active build per tenant across processes; three builds/hour/tenant; at most two unexpired ready artifacts/tenant.
- One-hour encrypted artifact validity, maximum ten audited downloads/artifact, no-store response headers and attachment content disposition.
- Derived encrypted payload is cleared on tenant lifecycle/status/next-export access after expiry. Rows/audit remain. This artifact TTL is a **temporary export security/resource limit**, not an approved workspace retention period.
- No scheduler is installed. Expired payloads in an entirely inactive tenant can remain encrypted in the DB until the next lifecycle access; retrieval is still denied. Leadership/operations must approve any future cleanup process. Backups can retain encrypted expired artifacts according to separately approved backup policy.
- HTTP parser 6 KiB limit, runtime allowlisted fields and request validation, 60 requests/minute/IP, bounded status queues (50 lifecycle requests, 10 export summaries, 20 attachment requests), request/delivery creation quotas.
- Cooperative deadline does not kill an already-running DB query; the existing pool acquisition timeout and parent deployment/database statement-timeout configuration remain important. No unbounded fetch, arbitrary SQL, local file path or external provider call is introduced.

## Closure, preservation and leadership policy

Legal-hold request immediately enables precautionary tenant preservation, before review. Hold approval preserves it. Rejection never silently releases it. Hold release requires an independent platform reviewer, human/legal authority reference and verified backup/object-version treatment; pending hold requests block release. Active hold blocks closure request, closure approval and the atomic access helper. `assertExecutionAllowed` blocks every future erasure/closure-data executor even without a hold; there is no executor endpoint, destructive service or scheduler.

Closure approval status is `access_closed_data_preserved`: access suspension/session revocation is operational; destruction/retention schedules remain off. Retention requests can be recorded/reviewed/rejected but **cannot be approved** until leadership supplies an approved retention policy. No browser/API field accepts arbitrary `retentionDays` or a purge date. `LIFECYCLE_POLICY` is deliberately immutable/unconfigured rather than inventing policy or editing central settings.

Human verification must identify the authorised council representative, legal/contract authority, any statutory/public-record obligations, active holds, backup inventories and retention/restore behaviour, every attachment version/delete marker/replica/archive and provider legal-hold flag. Preserve all until separately approved treatment exists. A DB-only closure does not erase backups or objects. Restores must reapply hold/closure/access state before exposing restored data. Any future erasure needs explicit leadership configuration, human approval, approved backup/object-version handling, legal-hold veto and a separately rehearsed audited implementation. None is claimed here.

## Tests and recorded validation

Executed locally without DB/services:

```sh
node --test api/tests/tenantLifecycle.test.mjs
# 14 passing tests: role/current-user/tenant boundaries, recovery independent of entitlement,
# positive secret exclusions/nested scrubbing, complete keyset export/resource failure,
# legal hold/review/independence/verification, disabled retention/execution,
# audit rollback for hold/closure/download, attachment isolation,
# encrypted artifact + checksum/status/download/expiry, migration rerun DDL.

cd frontend
CI=true node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false --runInBand --runTestsByPath src/components/TenantDataPanel.test.js
# 6 passing UI tests: export action, hold request, readonly roles, retry, hold block, step-up gate.
CI=true node node_modules/react-scripts/bin/react-scripts.js build
# Compiled successfully; the standalone panels are compiled by component tests, not centrally mounted yet.
```

Owned server files and integration flow pass `node --check`; reviewed base-model allowlisted fields match current definitions; `git diff --check` passes. Local node_modules symlinks are not committed.

**Provided but not executed** (`3017` was unavailable and this task must not start a DB/daemon):

```sh
cd api
# Parent supplies explicit isolated test DB/API configuration via its harness, not a production .env.
NODE_ENV=test LIFECYCLE_ISOLATED_TEST=true LIFECYCLE_TEST_BASE_URL=http://127.0.0.1:3017/v1 \
  node tests/tenantLifecycleFlow.mjs
```

The flow refuses production, non-loopback URLs, database names without `test`, or absence of explicit opt-in; the dotenv loader is disabled during test configuration import (explicit harness environment only). It creates/cleans **only its own UUID-scoped isolated fixtures**, calls mounted APIs, verifies recovery export with no subscription, contributor/executive/cross-tenant denies, excluded secret-marker absence, schema/attachment manifests, audit, step-up requirement, legal hold approval/release, retention refusal and closure suspension/session revocation while data remains. Parent must mount routers, migrate and supply existing encryption config before running it.

This is not a production-release certification. Parent must still complete isolated DB migration rehearsal/real API flow, full shared suite, dependency install/audit, central integration, end-to-end authenticated recovery routing, CSRF/MFA guards, realistic large-tenant limits/statement timeouts, browser/mobile/keyboard verification, approved backup/restore rehearsal and deployment gates. No push/deploy/production mutation has occurred.

Additional regression results: all five frontend suites pass (18 tests total). Broader API `*.test.mjs` run: 30 pass at the earlier 13-lifecycle-test run, one pre-existing ALTCHA database-dependent test fails with loopback DB connection refused (no DB was started). This is a missing harness prerequisite, not a passing full API gate.
