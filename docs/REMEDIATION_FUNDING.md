# Area 6 — honest Council funding and manual grant lifecycle

## Scope and handoff

Worktree `/home/ubuntu/civicpath-remediation/funding`, branch `remediation/funding`, base `a7651d1`. This area owns FundingPage, GrantsPage and grantController; all additional implementation is in new standalone funding files. No edits to central routes, central models, portfolioController, App, package manifests/locks or environment templates. No API daemon, DB service, paid service, external browsing, production mutation or Git push was performed.

The funding/grant pages have no samples, discovery feed, connection badge or implied GrantMaestro integration. Manual records use `council_entered` provenance with the authenticated creator. Existing records with no recorded origin are explicitly `legacy_unverified`; editing them does not manufacture their provenance. Seed grants (`isSample`) and pathways attached to sample projects are excluded. No stage-based percentage or predicted funding total is generated.

## Parent integration (required)

1. Cherry-pick this area's final commit into the parent remediation branch. Install dependencies only centrally as planned; no new dependencies are required.
2. Import the standalone router in **parent-owned** `api/src/routes/v1/index.js`:

   ```js
   import { fundingLifecycleRouter } from './fundingLifecycle.js';
   ```

   Mount at the same `/v1` route level **before the existing `/funding-pathways` and `/grants` routes**:

   ```js
   v1Router.use(fundingLifecycleRouter);
   ```

   Prefer mounting after public routes and `/admin`, before the shared `v1Router.use(requireAuth, tenantScope)` gate, or after the shared entitlement gate (duplicate gates are safe but unnecessary). Router performs its own requireAuth, tenantScope and requireActiveEntitlement. It rechecks active DB role and tenant in controllers. Do not mount at `/funding-lifecycle`: exported routes already contain `/funding-pathways`, `/grants`, `/funding-lifecycle/options`.
3. Remove the **parent-owned** legacy `GET/POST /funding-pathways` and `GET/POST /grants` declarations and their now-unused imports if possible, or leave them only behind the standalone router. Never leave legacy portfolio `createPathway` reachable ahead of this router; that handler is outside this area and does not provide this area's validation/revision guarantees. Existing `listGrants/createGrant` imports from `grantController.js` now delegate to secure handlers, but detail/edit/archive/options require router mounting.
4. Central `models/index.js` needs **no change**. `api/src/models/fundingLifecycle.js` defines one sidecar using the existing sequelize connection; controller imports central references directly and sidecar separately. Do not add `sync({alter:true})` or destructive sync.
5. Rehearse `019_funding_lifecycle.mjs` on isolated/staging DB. It creates `funding_lifecycle_records`, with unique tenant/type/entity and archival indexes, and adds tenant indexes to frozen central table names `Grant`, `FundingPathway`, `EvidenceItem`, `WorkItem` when present. It does not rewrite/delete existing records or alter lifecycle enums. Both table/index operations are guarded for rerun. Runner already automatically loads numbered migrations. Back up production before any eventual production migration; this area has not applied a migration.
6. Frontend routes already use FundingPage/GrantsPage. No App edit is required. Each thin page imports `FundingLifecycleWorkspace`, which imports its own CSS. AuthContext and existing axios API are reused. Optional deep links: `/funding?pathwayId=<uuid>` and `/grants?grantId=<uuid>` (use the actual parent route name for FundingPage). If workspace profile cannot be loaded, the editor requires explicit AUD/NZD selection rather than guessing AUD.
7. Run the isolated integration runner **in the parent's isolated environment** after router/migration integration, with the existing DB environment supplied securely by the parent:

   ```sh
   FUNDING_INTEGRATION_ALLOW_WRITE=1 NODE_ENV=development \
     FUNDING_TEST_BASE_URL=http://127.0.0.1:3017/v1 \
     node api/tests/fundingLifecycleIntegration.mjs
   ```

   The runner refuses production mode and non-loopback APIs. It creates two uniquely named tenants, users for all approved roles and an isolated plan, tests API functionality and a real transactional audit failure with injected audit, then force-cleans only those fixture tenants. It does not start API/DB or patch a shared global audit method. Do not run this runner against a DB containing production data, even though cleanup is narrowly scoped. Full schema runner rerun should also be rehearsed by parent.

## Exports

- `api/src/routes/v1/fundingLifecycle.js`: `fundingLifecycleRouter`, `createFundingLifecycleRouter({middleware, controllers})`.
- `api/src/controllers/fundingLifecycleController.js`: `fundingLifecycleHandlers`, `listPathways`, `getPathway`, `createPathway`, `updatePathway`, `archivePathway`, `reactivatePathway`, `exportPathways`; equivalent grant functions; `fundingReferenceOptions`, `grantHistory`.
- `api/src/controllers/grantController.js`: backwards-compatible grant re-exports.
- `api/src/services/fundingLifecycle.js`: dependency-injected handler factory; pure validation, URL/decimal/date helpers, transition graphs, CSV and serialization.
- `api/src/models/fundingLifecycle.js`: `FundingLifecycleRecord` (standalone sidecar).
- `api/db/fundingLifecycleSchema.mjs`: injected `applyFundingLifecycleSchema(query, DataTypes)`.
- `frontend/src/components/FundingLifecycleWorkspace.js`: default shared workspace, named `FundingRecordEditor`, `FundingReferenceSelect`. These can be reused by parent without copying UI logic.

## Permission matrix

| Role | Read/list/detail/export/history/options | Create/edit/status/link/owner/date/amount | Archive/reactivate |
| --- | --- | --- | --- |
| Active org_admin | Yes | Yes | Yes |
| Active portfolio_manager | Yes | Yes | Yes |
| Active contributor | Yes | Yes | Yes |
| Active executive | Yes | No | No |
| platform_admin / unknown role / inactive user | No | No | No |
| Unauthenticated or tenant mismatch | No | No | No |

Contributors are an explicitly approved manual-record write role, not an implicit approval engine. Every handler reloads the active user in the authenticated tenant; inside writes it also locks the role read. The parent gate additionally checks entitlement. UI controls are hidden for viewers but server is authoritative. Platform-admin access is deliberately not silently escalated to Council funding writes.

## HTTP/API contract

All paths are relative to `/v1` and require active entitlement.

- `GET /funding-pathways`, `GET /grants`: tenant-paginated `{data, meta:{total,limit,offset}}`; default 50, max 100; `archive=active|archived|all`, optional allowlisted `status`, `offset<=1000000`.
- `POST /funding-pathways`, `POST /grants`: manual create. Pathway requires sourceName/projectId; grant requires title/funder. New status is always watching/identified respectively. Currency defaults to configured tenant defaultCurrency if omitted, never to a guessed unit. All references must be same tenant, active/not deleted, non-sample project. `reason` defaults to Council manual entry if absent on create; UI requires reason.
- `GET /funding-pathways/:id`, `GET /grants/:id`: scoped detail. Grant includes safe evidence summaries, work summaries and human-readable scoped project/owner/pathway names. No user emails, storageKey, audit IPs, raw file paths or secrets are exposed.
- `PATCH /funding-pathways/:id`, `PATCH /grants/:id`: explicit allowlisted fields plus **`version`, `updatedAt`, `reason`**. `version` is sidecar revision (0 for untouched legacy); `updatedAt` is exact last-read parent timestamp. Both must match. Errors are 428 for missing revision/timestamp, 409 `funding_edit_conflict` for conflicting changes. Row lock plus revision guards prevent stale/competing writes; timestamp also notices changes made by outside/legacy writers. Audit/primary/sidecar all use the same managed DB transaction.
- `POST /.../:id/archive` and `/reactivate`: `{version,updatedAt,reason}` only. Archive state uses sidecar `archivedAt`, **not** a fake enum. Lifecycle stage, project, owner, amounts and evidence/work links remain unchanged. Archived editing and duplicate archival/reactivation are rejected. Reactivation does not imply renewed funder approval.
- `GET /funding-pathways/export.csv`, `/grants/export.csv`: same `archive/status` filters, no pagination. All matching records up to 1000; larger exports fail 413 instead of silently truncating. CSV preserves recorded money/currency and neutralizes spreadsheet formula-leading cells. Authenticated blob download in frontend.
- `GET /funding-lifecycle/options?kind=projects|owners|pathways|evidence|work&q=...`: only safe allowlisted fields, tenant scope, 100-record cap, escaped LIKE search; meta flags truncated results. Owner choices are active users; server revalidates references at save. Search supports large catalogs without unbounded load.
- `GET /grants/:id/history`: latest 100 allowlisted audit summaries, scoped by tenant/entity. Legacy audit metadata is not blindly returned.

Sidecar fields: organizationId, entityType, entityId, version, archivedAt, provenance, sourceUrl, evidenceIds, workItemIds, createdBy/updatedBy, timestamps. All writes and required audits are transactional. No destructive deletes, evidence upload, external URL fetch, funder discovery, award inference or currency conversion is implemented.

Money is accepted as non-negative decimal with at most two fractional digits and <= 999999999999.99, retained as DECIMAL/string. UI inputs show `$` and explicit AUD/NZD; displays never combine those currencies. Changing currency requires explicitly re-entering or clearing every relevant amount. Date-only values are real YYYY-MM-DD within 1900–2200, and acquittal date cannot precede application due date.

## Valid lifecycle transitions

Grants: identified → assessing/withdrawn; assessing → identified/preparing/not_successful/withdrawn; preparing → assessing/submitted/withdrawn; submitted → preparing/awarded/not_successful/withdrawn; awarded → contracted/withdrawn; contracted → acquitting/withdrawn; acquitting → contracted/acquitted; acquitted is terminal; not_successful/withdrawn → assessing. Same-state detail edits allowed. Awarded/delivery/acquitted stages require awardedAmount to be recorded (zero remains a real recorded amount).

Pathways: watching → preparing/closed; preparing → watching/submitted/closed; submitted → preparing/awarded/not_successful/closed; awarded → closed; not_successful → watching/closed; closed → watching. Fit is explicitly Council-assessed, never computed. Archival is a separate preservation action.

Evidence/work links: up to 50 distinct UUIDs each; every item must be in the same tenant and either unassigned or on this same grant/project. No overwrite/reassignment of another grant’s existing links. This area stores curated links in the sidecar instead of changing shared WorkItem/EvidenceItem. Source/evidence URLs use a HTTPS hostname allowlist: no credentials, executable/data scheme, IP literal, unusual port or localhost/local/internal/test hostname. They are opened with noopener/noreferrer and are never fetched by API. Referenced evidence URLs from legacy rows are revalidated before display; unsafe ones are suppressed. This is reference metadata, not private file upload or file-serving functionality.

## Verification

- `node --test api/tests/fundingLifecycle.test.mjs`: **25 passed**, DB-free permission, tenant/reference, current-role, transition, money/date/URL/CSV, stale version/timestamp, atomic audit failure, archival and migration rerun tests.
- `node --check api/tests/fundingLifecycleIntegration.mjs`: passed; real isolated API/DB runner provided, **not executed by this area**.
- `CI=true node node_modules/react-scripts/bin/react-scripts.js build` (frontend): production build **passed**.
- `CI=true node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false --runInBand` (frontend): **6 suites, 20 tests passed**, including 8 new funding tests and all existing UI regression tests.
- API `node --test` discovery: **44/45 passed**; existing `altchaContactProtection.test.mjs` purpose-bound challenge test failed because it tries to connect to unavailable local MySQL. No DB was started. The 25 funding unit tests all passed. Parent must rerun the full API suite with its isolated DB.
- All owned API JavaScript/migration/integration files passed `node --check`; `git diff --check` passed. Unexpected persistence errors are sanitized before the shared logger; SQL/connection data is never forwarded. MySQL lock deadlock/timeout returns actionable edit conflict.
- No real migration/DB rehearsal or production-only dependency install/audit was performed in this assigned worktree. Parent owns dependencies and deployment gate. Source is not claimed production-ready until those gates and isolated integration pass.

## Limitations and release prerequisites

1. Router must be mounted ahead of legacy funding routes and migration 019 applied; otherwise pages expose an honest unavailable state, not samples. Missing schema maps to 503 `funding_schema_unavailable` for common MySQL errors.
2. Curated evidence/work links are not an upload or task editor. Existing central task/evidence creation remains parent-owned; no newly fabricated evidence percentage is shown.
3. Latest 100 history entries and max 1000 CSV rows are intentional caps. Export over cap must be filtered, not silently truncated.
4. Legacy provenance remains unknown; no migration guesses who created old records. Archival sidecar initializes lazily under a locked parent record.
5. No live discovery provider, GrantMaestro transport, external funder verification or currency conversion exists. All are explicitly absent in copy.
6. Native date controls, focus-visible styling, inline non-modal forms, labels, loading/empty/error states and responsive grids are implemented. Real browser/mobile visual smoke verification remains parent’s release gate; no shared browser was used.
7. Sidecar references are polymorphic metadata with application tenant validation; central FK/association graph is untouched. Existing central writers must be routed through lifecycle handlers or adapted to respect archived state/revision. Timestamp catches many external edits but not a same-timestamp external write; parent should remove insecure legacy write entry points and ensure a high-resolution write contract for any future writers.
