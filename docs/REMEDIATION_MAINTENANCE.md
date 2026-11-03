# Area 2 — Record maintenance remediation

This branch adds standalone maintenance tooling for existing CivicPath records. It does not modify shared pages, the central model registry, central routers, package manifests, configuration templates, or the strategy controller. No database, daemon, external storage, paid service, production change, or publication was started.

## Files and exports

- `api/src/controllers/recordMaintenanceController.js`: named handlers `getMaintenanceRecord`, `listMaintenanceRecords`, `listMaintenanceOptions`, `editMaintenanceRecord`, `archiveMaintenanceRecord`, `restoreMaintenanceRecord`, `updateMaintainedStrategyAction`, `updateMaintainedMilestone`, `updateMaintainedProject`; injectable factory `createRecordMaintenanceController`.
- `api/src/routes/v1/recordMaintenance.js`: `recordMaintenanceRouter`, `recordMaintenanceCompatibilityRouter`, `recordMaintenanceProjectCompatibilityRouter`.
- `api/src/services/recordMaintenance.js`: dependency-free `createMaintenanceService`, `MAINTENANCE_KINDS`, `MaintenanceError`, `validateChanges`, `safeEvidenceUrl`, `assertPreconditions`, `validId`, `CONFIG_ROLES`.
- `api/src/models/recordMaintenance.js`: standalone `RecordMaintenanceState`, importing existing `sequelize` only. No central registry insertion is necessary.
- `api/db/migrations/015_record_maintenance.mjs`: additive standalone table/index migration; injectable `migrateRecordMaintenance` for DB-free rerun tests. It is essential because projects, work items, measures, evidence and most action-support records have no truthful archive lifecycle value.
- `frontend/src/components/ProjectMaintenancePanel.js`: named and default `ProjectMaintenancePanel({ project, team, onChanged, canManage, enabled = false })`.
- `frontend/src/components/StrategyMaintenancePanel.js`: named and default `StrategyMaintenancePanel({ action, team, onChanged, canManage, enabled = false, compatibilityEndpoints = true })`.
- `frontend/src/components/RecordMaintenanceWorkspace.js`: reusable workspace/editor and `maintenancePayload`, `isLiveMaintenanceId`. CSS is imported automatically from `recordMaintenance.css`.

`team` and `canManage` are accepted integration props, not authorization sources. The panels fetch active eligible owner choices and per-record field permissions from the API. Executive access is read-only even if a parent erroneously passes `canManage={true}`. Panels default to disabled and reject sample/non-UUID IDs without sending requests. Parent must explicitly set `enabled` after integration gates pass.

## Exact backend integration (parent-owned central file)

Add to `api/src/routes/v1/index.js`:

```js
import {
  recordMaintenanceRouter,
  recordMaintenanceCompatibilityRouter,
  recordMaintenanceProjectCompatibilityRouter,
} from './recordMaintenance.js';
```

After existing `v1Router.use(requireActiveEntitlement)` and **before any existing project, action, or milestone PATCH route**:

```js
v1Router.use('/maintenance', recordMaintenanceRouter);
v1Router.use(recordMaintenanceCompatibilityRouter);
// Recommended: closes the old project-edit validation/transaction bypass too.
v1Router.use(recordMaintenanceProjectCompatibilityRouter);
```

Each exported router also requires authentication, tenant scope and entitlement itself, so standalone mounting cannot accidentally omit these protections. The service independently reloads the active user using the tenant and checks current database role and sessionVersion; it does not trust a stale JWT role.

Compatibility router order is mandatory. It shadows the established `PATCH /strategy-actions/:actionId` and `PATCH /strategy-milestones/:milestoneId` with secure transactional handlers. The UI uses these **existing URLs** for action/milestone edits and completion; the `/maintenance` API is used for other record types and archive/restore. The separate project router shadows `PATCH /projects/:projectId` when mounted. Do not mount any of these before entitlement or on a public route.

### Existing PATCH callers must adopt the guarded contract

All guarded PATCH requests require a `changes` object, current `expectedUpdatedAt`, and current `expectedVersion`. Raw legacy bodies fail with 422/428 rather than being silently accepted. Update any existing action/milestone/project edit form in the parent-owned scope:

```js
const current = (await api.get(`/maintenance/actions/${action.id}`)).data.data;
// Fetch current values when opening the form, NOT just before saving a stale form.
// Keep this snapshot for the form's lifetime.
await api.patch(`/strategy-actions/${action.id}`, {
  changes: changedFieldsOnly,
  expectedUpdatedAt: current.updatedAt,
  expectedVersion: current.maintenance.version,
});
```

For a milestone, use `/maintenance/milestones/:id` for the snapshot and `/strategy-milestones/:id` for saving. For projects use `projects`. The successful compatibility response is `{ data: maintainedRecord }`, not the complete action detail associations; reload `GET /strategy-actions/:id` or the workspace afterward. Existing creates remain at their current endpoints and retain their current body contracts.

If the parent cannot update existing PATCH callers immediately, leave the panels `enabled={false}`. Do not set `compatibilityEndpoints={false}` merely to make missing route integration seem successful: that prop allows direct maintenance editing but does not remediate the legacy endpoints' authorization/archive/conflict bypass.

## Exact frontend insertion points (parent-owned pages)

### PortfolioPage selected project detail

Import:

```js
import { ProjectMaintenancePanel } from '../components/ProjectMaintenancePanel';
```

Inside the selected project's `<aside className="project-detail">`, after the current `<section className="detail-work">` and before `</aside>`, insert:

```jsx
<ProjectMaintenancePanel
  key={selectedProject.id}
  project={selectedProject}
  team={[]}
  canManage={['org_admin', 'portfolio_manager'].includes(user?.role)}
  enabled={maintenanceIntegrated && !usingSample}
  onChanged={async () => {
    const response = await api.get('/projects');
    const next = (response.data.data || []).map(toProject);
    setProjects(next);
    setSelected((previous) => next.find((item) => item.id === previous?.id) || next[0] || null);
  }}
/>
```

Use the page's actual authenticated user/context if present; `canManage` may be omitted entirely because authoritative permissions come from the API. `maintenanceIntegrated` is a parent-controlled readiness flag, not a new environment variable. `selectedProject` is display-transformed; only `id` is consumed. The panel always obtains fresh raw records from the maintenance API. Never enable the panel for protected sample/fallback data. Parent must integrate archive-aware portfolio queries (see archive semantics below), rather than assuming the unchanged legacy `/projects` list hides archived records.

### StrategyDeliveryPage selected action detail

Import:

```js
import { StrategyMaintenancePanel } from '../components/StrategyMaintenancePanel';
```

The current selected-detail renderer ends with:

```jsx
<CollaborationPanel action={action} team={team} refreshAction={onRefresh}/>
```

Insert immediately after that panel, inside the same action `<aside>`:

```jsx
<StrategyMaintenancePanel
  key={action.id}
  action={action}
  team={team}
  canManage={canManage}
  enabled={maintenanceIntegrated}
  onChanged={async () => { await onRefresh(); }}
/>
```

If that detail renderer has no `canManage` or readiness prop, pass the readiness flag down from `StrategyDeliveryPage` and omit `canManage`. `onChanged(record, kind)` is invoked only after a successful commit. Archiving a strategy action sets its existing `isActive=false`, so a parent workspace refresh will normally remove the action from the active selection. Provide a separate archive-recovery view/query if the parent wants restored actions reachable after selection disappears. The panel root always renders archived state if supplied a known live archived ID; an archived-child toggle reveals supporting records in each loaded page.

## API contract

Mounted at `/v1/maintenance`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/options/:reference` | Safe tenant-scoped reference choices, 100 per page |
| GET | `/:kind` | Existing records, 25 by default; maximum 100 |
| GET | `/:kind/:recordId` | Current allowlisted fields, schema descriptions, permissions and conflict token |
| PATCH | `/:kind/:recordId` | Allowlisted edit or owner/reference assignment |
| POST | `/:kind/:recordId/archive` | Non-destructive archive; required reason |
| POST | `/:kind/:recordId/restore` | Non-destructive restore |

Supported kinds: `projects`, `work-items`, `evidence`, `actions`, `milestones`, `measures`, `action-evidence`, `funding`, `stakeholders`, `risks`, `decisions`.

Supported list filters:

- projects: `projectId` (identifies the root itself);
- actions: `actionId`, `strategyId`;
- work-items/evidence: `projectId`, `grantId`;
- milestones/measures/action-evidence/funding/stakeholders: `actionId`;
- risks: `actionId`, `strategyId`;
- decisions: `actionId`, `strategyId`, `projectId`.

All lists accept `offset`, `limit`, `archived=true|false|all`. `archived` filtering applies **to the bounded loaded page** (response explicitly says `archiveFilterAppliedToPage=true`). Follow `pagination.hasMore`/`nextOffset`, even when a filtered page is empty. UI loads unfiltered bounded pages, hides archived children locally by default and offers “Load more”. Options accept `offset` and, for actions/focusAreas/dependencies only, `strategyId`; never include email, credentials or storage keys. Unknown body fields, kinds, filters and unsafe references are rejected, not silently stripped.

Edit request:

```json
{
  "changes": { "ownerId": null, "dueDate": "2026-12-01" },
  "expectedUpdatedAt": "2026-11-03T00:00:00.000Z",
  "expectedVersion": 2
}
```

Archive/restore use the same preconditions without `changes`. Archive requires `reason` (1–1000 characters). 409 means stale snapshot, duplicate state or already archived/restored; 428 means missing/malformed preconditions. The UI retains a conflicted draft until the user explicitly discards it and loads latest values. No automatic stale-write retry occurs.

## Permission matrix and integrity

| Capability | org_admin / portfolio_manager | contributor | executive / platform_admin |
|---|---|---|---|
| Tenant record maintenance reads | Yes | Yes | Executive read-only; platform admin denied |
| Configure project/funding fields | Yes | No | No |
| Assign owner / relink references / change financial governance | Yes | No | No |
| Permitted delivery fields | Yes | Only when record/parent owned or assigned accountable/responsible/contributor on the project/action | No |
| Verify evidence / approve or implement decisions / accept risks | Yes | No | No |
| Archive / restore | Yes | No | No |

Contributor delivery fields are explicitly enumerated in `MAINTENANCE_KINDS`: action progress/rationale/next steps; milestone completion/evidence/variance; work delivery fields; measure current readings/evidence; evidence title/type/URL/source; stakeholder engagement; risk mitigation/resolution (not acceptance); decision recommendation/follow-up (not approval). Unassigned and unrelated contributors have no mutation access. Owners must be active Council org_admin/portfolio_manager/contributor users; disabled users and executives cannot be newly assigned as delivery owners.

Every reference is tenant-checked transactionally; action/focus/dependency references also match the existing strategy. Grant/project mismatch is rejected. Archived parents block edits and new links; archive does not cascade or delete children. Project `priorityId` is mirrored into existing `ProjectPriority` associations non-destructively: existing links are retained, their primary flag is updated, and a missing link is created transactionally. Category/stage and multi-selector editing intentionally stay with existing council-proof selector endpoints to avoid desynchronizing controlled selector values.

Each mutation locks the primary record and current user, compares timestamp plus maintenance version, writes the primary change/support records/metadata, increments version, and writes the required audit **inside the same transaction**. Audit records store changed field names/version and archive reason, not evidence URLs or the full record. Milestone completion sets/clears `completedAt`; risk resolution sets/clears `resolvedAt`. Changes to verified evidence URL/type/source invalidate verification unless a manager explicitly reverifies. `storageKey` is neither editable nor exposed. Evidence supports pre-existing absolute HTTP(S) URLs without embedded credentials; unsafe historical schemes or embedded credentials are omitted from read responses; there is no file-upload or document-storage claim.

## Archive semantics and required parent follow-up

`RecordMaintenanceState` stores archive metadata for kinds lacking legitimate archive statuses; it never rewrites a work item to “complete”, a project to “on_hold”, or a decision to “declined” to fake an archive. Strategy actions additionally use their existing `isActive` lifecycle flag, retaining the previous value for restore. Restoring an action previously inactive preserves that inactivity. Other lifecycle statuses remain exactly unchanged.

**Legacy list/report endpoints do not know about this standalone metadata.** Parent must apply an archive-aware filter in legacy active portfolio/work/evidence/measure/funding/risk/decision reporting views before claiming archive removes a record from all application surfaces. Tenant-scoped server integration should fetch metadata for the relevant bounded set of IDs/kinds and exclude `archivedAt != null`; avoid frontend-only reporting correctness. Active action workspace queries already honor `isActive`, but some milestone/support-report queries may not exclude inactive parent actions and still need explicit parent filters. Archive state is not a secrecy boundary: authorized Council readers may still inspect retained records. Existing write endpoints that bypass the maintenance service remain outside this branch's guarantees; parent must route or gate them consistently.

## Tests and verification

Run from worktree root:

```sh
node --test api/tests/recordMaintenance.test.mjs
```

15 passing DB-free tests cover every supported kind's manager edit, metadata/support creation, strict validation, unauthenticated/disabled-session/role boundaries, stale JWT role, contributor ownership/participation, cross-tenant IDs/references, wrong-strategy actions/focus, disabled/executive owner allowlists, archive/restore/status preservation, parent archive locks, archive filtering and linking rejection, malformed archive requests, monotonic concurrent conflict detection, priority mirror integrity, deliberate audit failure rollback (primary edit + metadata + links + action lifecycle), verification invalidation, safe suppression of historical unsafe URLs, pagination and migration rerun safety. These tests inject a serialized transaction/store and are **not a substitute for real MySQL row-lock/rollback/rehearsal verification**. Existing domain creation endpoints are unchanged; this suite tests new metadata/support creation but makes no claim to remediate existing project/action creation authorization.

Frontend (existing dependencies linked locally, not committed):

```sh
cd frontend
CI=true node node_modules/react-scripts/bin/react-scripts.js test --runInBand --watchAll=false
CI=true node node_modules/react-scripts/bin/react-scripts.js build
```

Verified: all 5 frontend suites / 19 tests pass, including 7 new maintenance component tests; the existing unintegrated frontend production build compiles (parent must rebuild after panel insertion); new API files and migration pass `node --check`; explicit ESLint checks on all new frontend sources pass; `git diff --check` passes. React tests compile and exercise the new panels and cover disabled/sample gates, server-authoritative executive read-only controls, changed-field payloads, established action/milestone completion paths, 409 draft retention/reload, explicit archive reason/confirmation and archive toggle. Semantic labels, live status/error announcements, keyboard focus styling and responsive CSS are implemented; no browser/manual responsive verification was performed under the no-browser constraint.

Broader API `node --test api/tests/*.test.mjs`: 29 pass, 1 existing ALTCHA test fails because it requires unavailable MySQL (`ECONNREFUSED`). No DB was started. Parent still must run: actual migration 015 twice on a disposable database with backup/restore rehearsal; HTTP auth/tenant/concurrency/rollback smoke tests; full API integration suite; full production dependency installation/audit; integrated frontend production build after inserting panels; manual keyboard/mobile/tablet/desktop checks. This is source remediation, not a production-ready or deployed release.

Performance: bounded lists/option queries and archive-state batching are implemented. Per-record parent/permission/status lookups remain bounded N+1 work; default UI pages are 25 records per group. Profile at realistic Council volumes before increasing page size or polling frequency. No polling daemon or background service is introduced.
