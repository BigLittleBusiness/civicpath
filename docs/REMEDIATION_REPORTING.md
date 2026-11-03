# Remediation area 4 — real strategy reporting

Implemented in `remediation/reporting`, based on `a7651d1`. No shared integration files, model registry, package/lock files, configuration templates or environment files were changed. No production deployment, paid service, external browsing, database/daemon or push was performed. No dependency was added.

## Permission matrix

| Action | org_admin | portfolio_manager | executive | contributor / platform_admin |
| --- | --- | --- | --- | --- |
| List strategies/periods; read live report | Yes | Yes | Yes | No |
| List/read/download immutable snapshots | Yes | Yes | Yes | No |
| Save a recorded draft snapshot | Yes | Yes | No | No |
| Modify/delete a snapshot; certify review/approval | No | No | No | No |

Each controller action requires an authenticated identity, matching authenticated/tenant organisation, and a currently active persisted user in that organisation. The persisted role is checked again rather than trusting an old JWT role. Every lookup is tenant-scoped. Supplied tenant/body ownership fields are rejected; missing and cross-tenant IDs yield the same 404. Parent authentication and active entitlement remain mandatory.

## Parent integration: API (mandatory)

In `api/src/routes/v1/index.js`, import:

```js
import { reportSnapshotsRouter } from './reportSnapshots.js';
```

Mount once immediately after `v1Router.use(requireActiveEntitlement)` (and therefore after `requireAuth` and `tenantScope`):

```js
v1Router.use(reportSnapshotsRouter);
```

**Remove** the existing `createReportSnapshot` import from `strategyController.js` and the old line:

```js
v1Router.post('/strategy-reporting-periods/:periodId/report-snapshots', requireRoles('org_admin', 'portfolio_manager'), createReportSnapshot);
```

Also remove the old `getQuarterlyReport` import/GET registration for `/strategy-reporting-periods/:periodId/report`; the router supplies its bounded allowlisted read compatibility alias.

The new standalone router includes that POST path as a compatibility alias for the transactional, draft-only writer. Leaving the old writer mounted is not acceptable: it accepts fabricated reviewed/approved labels, allocates versions with `count + 1`, serializes raw model content, and writes the audit outside its transaction. Mounting the new router before it technically shadows it, but explicitly remove the legacy registration to make the security boundary durable.

No new model registration or migration is required. `StrategyReportSnapshot` and its tenant/strategy/period/type index already exist from migration 009. This implementation imports only existing Sequelize/model references, never calls `sync`, and stores schema-versioned allowlisted content in the existing JSON column. Parent must ensure the existing schema is present. No `018_report_history.mjs` is supplied because there is no essential schema change.

### Router endpoints (relative to `/v1`)

| Method | Endpoint | Response |
| --- | --- | --- |
| GET | `/reports/strategies?limit=50&offset=0` | Safe strategy choices; max 100 per page |
| GET | `/reports/strategies/:strategyId/periods?limit=50&offset=0` | Safe period choices; max 100 per page |
| GET | `/reports/periods/:periodId` | Live allowlisted report |
| GET | `/reports/periods/:periodId/snapshots?limit=20&beforeVersion=N` | Metadata only; max 50, descending versions |
| POST | `/reports/periods/:periodId/snapshots` | `{status:'draft'}` or `{}` only; returns full snapshot metadata/content |
| GET | `/reports/snapshots/:snapshotId` | Immutable historical content and metadata |
| GET | `/reports/snapshots/:snapshotId/download?format=json` | JSON, CSV or self-contained HTML attachment |
| GET | `/strategy-reporting-periods/:periodId/report` | Safe compatibility alias for live report |
| POST | `/strategy-reporting-periods/:periodId/report-snapshots` | Safe compatibility alias for draft creation |

Responses retain snapshot ID, strategy/period IDs, actual backend version, created date, report type, stored workflow label, `approvalStatus:'not_certified'` and assurance statement. Historical legacy labels are preserved for provenance but explicitly never certified as actual formal approval. JSON downloads include metadata; CSV includes a snapshot provenance row; HTML includes snapshot ID/version/date/stored label and prints as a recorded draft. Private storage keys, attachment URLs, user emails/credentials, owner objects, arbitrary metadata and review/approval actor objects are not allowlisted. Evidence source **names** and recorded dates are exported; URL/storage/credential-style source values are replaced with an omission notice. User-entered narrative remains council working content; exports must stay subject to council information-handling policy.

Snapshots are created in a managed repeatable-read transaction. The tenant-scoped period row is locked **before** report generation and version allocation, so writers using these endpoints serialize per period; `max(version)+1` includes soft-deleted rows and does not reuse numbers. Audit and snapshot writes share the transaction and rollback together. There are no snapshot overwrite/update/delete/approval endpoints. Underlying administrative database access is not made tamper-proof by this feature; the old writer must be removed.

High-cost source sections are bounded to 2,000 rows and safe content to 2 MiB. If a limit is exceeded the operation fails explicitly rather than publishing a partial report. Choices have bounded pagination; history uses a bounded version cursor. Queries bulk-load related records using only active action IDs, never N+1 joins. No source record is mutated by a reporting GET; this avoids the existing workspace GET's status-default creation side effect. Unexpected reporting/database failures return a sanitized actionable 503 without passing SQL/model values to the generic error logger. Responses use `Cache-Control: no-store`.

## Parent integration: frontend

`frontend/src/pages/ReportsPage.js` is fully replaced; the existing route can keep importing the default export. It loads real `/reports/strategies` and period choices, defaults to an active strategy/open period when present (otherwise newest available choice), supports more choices, and displays labelled loading/empty/error states with no fabricated demo values. Contributor/platform-admin roles do not load reporting APIs.

To insert into `StrategyDeliveryPage.js`, import:

```js
import { ReportHistoryPanel } from '../components/ReportHistoryPanel';
```

Within its reporting tab, insert the panel once under `AuthProvider`:

```jsx
<ReportHistoryPanel
  strategyId={selectedStrategy?.id}
  periodId={selectedReportPeriodId || currentPeriod?.id}
  refreshKey={reportRefreshCounter}
  onSnapshotCreated={(snapshot) => {
    // Optional: consume actual ID, version and capture date; never discard them.
  }}
/>
```

`selectedReportPeriodId` and `reportRefreshCounter` above are illustrative parent-owned state names; if those do not exist, pass `currentPeriod?.id` and omit `refreshKey`. For period selection, the parent should bind the existing real `periods` list to a labelled select and pass its selected ID. The panel does not infer an organisation or period from a hardcoded value. It handles a missing period safely without API requests.

Replace/remove the parent's legacy snapshot button/handler, or gate it to `org_admin`/`portfolio_manager` and refresh the panel after creation. Prefer this panel's single save control so a returned snapshot's version/reference/date is immediately visible. The panel always fetches its own allowlisted live report rather than consuming raw `workspace.report`. API requests are aborted/ignored on period changes; delayed stale-period responses cannot overwrite the newly selected report.

Exports: named/default `ReportHistoryPanel`, named `ReportDocument`. Props: `strategyId`, `periodId`, optional `refreshKey` (default 0), `onSnapshotCreated`, `apiClient` (dependency injection for tests). CSS imports automatically. Live print is available without saving; JSON/CSV/HTML downloads require selecting a saved snapshot. Downloaded HTML is self-contained, escaped, uses semantic headings/tables and a browser Print / Save as PDF button; there is no server-generated PDF or paid PDF service. Responsive CSS handles narrow/mobile layouts and visible focus; print CSS isolates the report from the shell and repeats table headings.

## Required small `strategyController.js` metric correction (parent-owned)

The old `reportPackage` computes `evidenceCoverage` from `readinessScore > 0`. That is not evidence coverage. Either delegate its report data to the new reporting repository (preferred for consistent allowlisted metrics), or apply this small correction in the existing package:

1. Import `computeEvidenceCoverage` from `../services/reportMetrics.js`.
2. Add an `ActionEvidenceLink.findAll` query alongside the existing report source queries, scoped by `organizationId` and joined to `StrategyAction` with **both** `organizationId`, `strategyId` and `isActive:true` in its `where`, `required:true`. Select only `id`, `organizationId`, `actionId`; do not return private evidence URLs.
3. Replace readiness-derived `evidenceCoverage` with:

```js
const evidenceMetrics = computeEvidenceCoverage(actionRows, evidenceLinks, organizationId);
```

4. Spread `...evidenceMetrics` into `summary` instead of the old readiness-derived field, and use the definition in displayed help/labels.

Definition: percentage of active strategy actions having at least one recorded `ActionEvidenceLink`, regardless of its `isVerified` flag. Recorded does **not** mean independently verified, valid, complete or assured. Free-text evidence summaries/readiness scores do not count. Deleted, inactive, foreign-action and foreign-tenant links do not count. Zero eligible actions yields 0%, with numerator/denominator separately reported. Linked-project evidence is not counted implicitly; create an explicit action evidence link to make that contribution visible.

For complete metric consistency, fix existing on-track/completed category summaries to **sum all matching status definitions**, rather than `.find(...).count`; count distinct included active action IDs for update coverage. Do not combine AUD/NZD totals or present identified/submitted amounts as secured funding. The standalone report already implements these corrections.

## Report meaning and limitations

Reports explicitly state their basis: the **live strategy register at generation**, plus included-in-report updates for the selected period. They are not a historical reconstruction of the register at period end. Selecting an old period selects its included updates; action statuses, current evidence, risks, dependencies, measures/funding and overdue assessment are still current at capture time. A saved snapshot freezes that capture, and later source edits cannot change its stored values. Included-only updates are counted by distinct active action ID; unreviewed/draft updates are not presented as included evidence.

Legacy snapshots' previous readiness-derived evidence metric is deliberately displayed as not recorded under the new definition; it is never recomputed with today's evidence. Source bounds reject overly large historic snapshots rather than silently truncating them. History pagination assumes distinct versions from the safe writer; legacy duplicate versions created by the old concurrent count writer may need an audited repair or more robust cursor if present. No destructive legacy migration is attempted. The existing index covers tenant/strategy/period/type filtering; very large history volumes may warrant a separately rehearsed additive ordering index after query-plan measurement.

Actual DB integration/rehearsal and browser visual/print verification were **not run** under the no-DB/no-shared-browser constraints. Parent should rehearse against disposable non-production MySQL, verify a real rollback on audit failure and simultaneous HTTP saves, confirm authenticated route mounting, inspect mobile/desktop and multi-page browser PDF, and run full API/dependency audit/release gates before deployment. No production-ready/deployed claim is made.

## Validation

Passed locally:

- `node --test api/tests/reportSnapshots.test.mjs`: 11 DB-free integration/security/helper tests (create/list/read/download; exec read-only; wrong role; stale persisted role; disabled/forged tenant; cross-tenant period/strategy/snapshot; atomic rollback; concurrent monotonic versions; validation; real evidence coverage; safe allowlist; legacy provenance; CSV injection; HTML escaping; limits).
- `CI=true node node_modules/react-scripts/scripts/test.js --watchAll=false --runInBand` from `frontend`: 6 suites, 21 tests, including 6 panel and 3 real report-page tests plus pre-existing regression tests.
- `CI=true node node_modules/react-scripts/scripts/build.js` from `frontend`: strict optimized build compiled successfully after fixing two effect-cleanup lint warnings.
- `node --check` for all four reporting API modules and `git diff --check`.

Node controller tests inject a bounded repository, persisted actor and managed transactional store; they run without Sequelize or a database. They prove application control flow, not actual MySQL locking/isolation. Existing frontend/API dependency directories were symlinked for validation only and are not committed. No package or lockfile edits were needed.
