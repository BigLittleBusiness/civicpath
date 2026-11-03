# CivicPath remediation area 1 — trustworthy demo-to-live onboarding

## Scope and integration

This is a frontend-only implementation on `remediation/trust`, based on published `a7651d1`. It changes only `PortfolioPage.js`, `DashboardPage.js`, `WorkspaceSetupPanel.js`, the new pure `trustData.mjs` helper, associated tests and this document. There are no dependencies, configuration/template edits, API/controller/route/model changes or migrations. No database, daemon, external service, browser, production change or publication was used.

Cherry-pick this area's local commit into the parent integration branch. Existing default imports of DashboardPage and PortfolioPage and the existing named imports of WorkspaceProfilePanel/DataImportPanel continue to work. No App or Settings change is required for area 1.

### Area 2 maintenance panel integration

There is deliberately **no duplicate project maintenance panel** here. PortfolioPage provides an optional render prop called `renderProjectMaintenance`. The parent can integrate the area 2 panel in its owned App/route composition:

```jsx
<PortfolioPage
  renderProjectMaintenance={({ project, user, onUpdated }) => (
    <ProjectMaintenancePanel
      project={project}
      user={user}
      onUpdated={onUpdated}
    />
  )}
/>
```

Adapt the child prop names to area 2's actual exports. The callback renders inside the selected project's detail aside. `project` includes the original API fields (`id`, `organizationId`, `estimatedCost`, `targetFunding`, `ReadinessAssessments`, etc.) plus presentation fields: `stage` is the display label, `stageKey` is the original API stage code, `assessment` is the latest recorded assessment, `readiness` is the actual score or `null`, and `cost/target/secured/jobs` are normalized known values or `null`. **Use `stageKey`, not display `stage`, for API mutations.** `onUpdated()` reloads projects, work items and selectors from the API; it does not trust arbitrary child-supplied records. The callback is not invoked when no selected project matches the filter.

### Exports

- `PortfolioPage` default: optional `renderProjectMaintenance({ project, user, onUpdated })` render prop.
- `DashboardPage` default: no new required props.
- `WorkspaceSetupPanel`: existing `WorkspaceProfilePanel({ user })`, `DataImportPanel({ canManage })`, and `SetupChecklist({ projectCount = null, strategyCount = null })` named exports. SetupChecklist reads the authenticated user via the existing AuthContext. It no longer uses `isAdmin` or `hasStrategy` as completion assertions; those former dashboard-only arguments have been replaced at its sole call site.
- `trustData.mjs`: `readinessDimensions`, `stageLabel`, `isDemoWorkspace`, `workspaceKey`, `canManageProjects`, `isRecordId`, `numberOrNull`, `percentOrNull`, `requireRows`, `latestAssessment`, `toProject`, `assessmentDimensions`, `readinessPayload`, `saveReadiness`, `initialDataState`, `rowsForWorkspace`, `addCreatedProject`, `dashboardData`, `loadSetupEvidence`, `setupItems`. These are dependency-free pure rules or explicit dependency-injected I/O helpers. Node tests run without a DB.

## Data truthfulness

Neither page imports or uses demoData. Even demo tenants use their own stored API records only; empty/error/demo workspaces never receive a static fallback. The sole demonstration labelling condition is the exact authenticated boolean `user.organisationIsDemo === true` already supplied by AuthContext. Demo labels stay visible in both portfolio and dashboard and make clear that mutations are confined to that demo tenant. There is no name-based, role-based, error-based or loading-based demo inference.

Empty successful live registers show zero project/funding/job counts, an explicit first-project state, and empty charts. Failed or malformed requests show unavailable values and retry actions rather than zero or samples. Numeric zero survives normalization. Missing recorded fields stay null on individual project rows; portfolio totals sum known amounts and explicitly disclose missing values. Requests and visible state are keyed to authenticated tenant, user, role and demo flag. Old-tenant rows, details and in-flight writes cannot repopulate a changed workspace.

Dashboard reads both `/dashboard/overview` and `/projects`. The current overview API caps project rows at eight and converts absent readiness to zero; therefore totals, stages and assessment averages are derived from the complete project register, not its capped or ambiguous overview summary. Genuine latest assessments, including score zero, are retained; projects without an assessment are explicitly unassessed and appear in that chart bucket. Average readiness uses assessed projects only. Funding-ready **stage count** is kept distinct from assessment score bands.

Funding sources are displayed as a real categorical potential-amount bar-chart snapshot, not an invented monthly award trend. Empty pathways never fall back to fundingVelocity. Portfolio open work uses actual project-ID matches from `/work-items`, excludes completed work, and has honest loading/error/zero states instead of fabricated decisions. No hard-coded readiness date, risk offset or work count remains.

## Setup and permission matrix

| Operation / evidence | Organisation Administrator | Portfolio Manager | Contributor | Executive |
| --- | --- | --- | --- | --- |
| Read tenant projects / overview / work / profile | Yes | Yes | Yes | Yes |
| Read `/workspace/members` for checklist | Yes | **Never called** | **Never called** | **Never called** |
| Create a project | Yes | Yes | Hidden/guarded | Hidden/guarded |
| Read assessment detail | Yes | Yes | Read-only | Read-only |
| Record readiness assessment | Yes | Yes | Hidden/guarded | Hidden/guarded |
| Save workspace profile | Yes | Read-only | Read-only | Read-only |

Platform/unknown roles do not gain project mutation capabilities. These presentation guards supplement, not replace, the existing server-side tenant-scoped role checks.

The checklist is persistent by deriving from saved API evidence on every mount and its refresh action, never by localStorage/sessionStorage ticks or the current user's role. Owner completion requires a selected owner that is present in the active eligible owner list plus recorded operating contact name, role and valid email. An onboarding timestamp alone is not sufficient. Project and strategy completion require actual positive register counts; missing counts are unverified, not zero. Administrators see active colleagues (excluding self), pending invitations and expired/unverified invitations. Team completion requires an active colleague; a sent or pending invitation is not proof that access has been accepted. Other roles see a clearly labelled unavailable team-readiness state and administrator guidance; no privileged endpoint is probed.

WorkspaceProfilePanel now shows actionable load/save errors and a real read-only identity summary for other roles. Saves use an explicit field allowlist, convert an empty owner choice to null, and ignore responses from a changed session. DataImportPanel retains its existing workflow with defensive canManage checks on its asynchronous handlers.

## Readiness workflow

The old inert ellipsis has been replaced with a labelled assessment button. It and the main readiness button open a keyboard-accessible dialog (label, Escape, focus containment and return focus). Actual API `scopeScore`, `costScore`, `approvalsScore`, `partnerScore`, `fundingScore`, `deliveryScore` values are shown on the genuine 0–5 scale; absent/invalid dimensions say Not recorded and have no fabricated bars.

Organisation Administrators and Portfolio Managers can explicitly record all six integer scores plus a supporting evidence note (10–8,000 characters). There are no default invented scores. POST uses the existing `/projects/:projectId/readiness-assessments` route. Client guards require the allowed role, a UUID real record and exact current organization ownership before any POST. The response must return the same project/tenant and a valid score before local success is shown. A save records a new assessment, not a project-stage transition or a confirmed approval. API failure stays in the dialog with an actionable error. Contributors/executives have a read-only assessment view.

## Validation commands and results

Run from the worktree root:

```sh
node --test frontend/src/lib/trustData.test.mjs
```

Run from its frontend directory, using the existing approved dependency symlink (do not commit it):

```sh
CI=true node node_modules/react-scripts/bin/react-scripts.js test --watchAll=false --runInBand
node_modules/.bin/eslint src/pages/PortfolioPage.js src/pages/DashboardPage.js src/components/WorkspaceSetupPanel.js src/lib/trustData.mjs src/pages/TrustPages.test.js
CI=true node node_modules/react-scripts/bin/react-scripts.js build
git diff --check
```

The dependency location is `/home/ubuntu/civicpath-app-rolehelp-publish/frontend/node_modules`. No added dependency or lockfile is needed. Native Node tests are `.test.mjs` and intentionally separate from CRA/Jest discovery. JSX integration regressions use the existing testing-library/Jest setup and mock the API, auth and chart library rather than a DB or service.

Validation covers explicit demo identification, zero versus missing numbers, sample exclusion in empty/error/loading states, first-real-project creation, old tenant clearing, a full register greater than eight rows, assessment provenance/latest ordering/true zero, role and cross-tenant mutation rejection before POST, input allowlisting, response mismatch/API failure, no privileged checklist read for non-admins, actual owner/contact readiness, pending/expired/active team evidence, setup reload/refresh, empty charts, retry actions, read-only executive dialogs, and filter/detail consistency. Existing role-help/navigation tests are also run. Build, lint and exact test results are reported with the final local commit.

## Limitations and release prerequisites

1. The current permissible shared profile response has no aggregate team/invitation fields. Non-admin team readiness is intentionally **unavailable**, not marked incomplete or guessed. Do not change this by calling the administrator-only members route. A future permission-reviewed aggregate read endpoint could provide counts without exposing private member data.
2. Readiness and profile writes reuse existing controllers. Their audit writes occur separately from the primary write; area 1 does not change shared controllers. Server-side transactional audit hardening and DB rollback tests remain a parent/backend release prerequisite. A failed save is not automatically retried, since the current assessment route has no idempotency token.
3. No API authorization, DB rollback/migration rehearsal, production dependency audit or actual live end-to-end test was performed in this frontend-only worktree. No production-ready/deployment claim is made. Parent must run the full central release gates before release.
4. Shared browser use was forbidden. DOM tests cover loading/empty/error/read-only states, dialog semantics, focus behavior and real workflows, and the production build verifies rendering compilation. Actual mobile/tablet/desktop visual and live backend smoke checks remain integration gates. Existing responsive styles are reused, not replaced.
5. The project/work list endpoints are currently unpaginated. This implementation uses the existing complete register to avoid misleading overview counts. High-volume tenants require API pagination/aggregate provenance work outside the owned files; no N+1 project requests were added.
6. `/dashboard/overview` exposes only overdue open work and caps that list; dashboard labels it accordingly. Portfolio lists up to ten returned open work items while showing the actual loaded count. No guarantee of email delivery, accepted invitations, confirmed approvals, funding awards or bank receipts is inferred from UI scores or pending invitations.
7. Area 2's maintenance panel is intentionally absent until the parent wires its export into the provided render prop. No duplicate panel was implemented.

## Verified local gate record

- Native Node trust regressions: **28/28 passed**.
- CRA/Jest full frontend regression suite: **5/5 suites, 29/29 tests passed**, including 17 new rendered trust/workflow/keyboard tests and the 12 existing role-help/navigation tests.
- Owned-source ESLint: checked with `--max-warnings=0`; **passed with no errors or warnings**.
- Frontend optimized production build: **compiled successfully** using the existing dependency symlink; no new dependencies or template/configuration edits.
- `git diff --check`: **passed**. Commit is local only, with the explicit owned-file allowlist; no dependency symlink, build output, secret or parent-owned file is staged.
- Production deployment, publication, dependency audit, database/controller integration and shared browser verification: **not performed**, as required by the delegated scope.
