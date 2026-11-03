# Frontend remediation integration

Integrated into the shared repository after `e8165af`. This work changes frontend source/tests and this document only. No API edits, commit/push, dependencies, package/lock files, migrations, environment files, browser, daemon, provider call or deployment were performed.

## Completed wiring

- App composition activates `ProjectMaintenancePanel` through PortfolioPage’s existing `renderProjectMaintenance` callback. Trust-owned PortfolioPage, DashboardPage, trust helpers and baseline trust tests remain unchanged. A selection-independent archive view remains available after a root disappears; successful recovery reloads the portfolio.
- Selected strategy actions mount enabled `StrategyMaintenancePanel` plus `ReviewWorkflowPanel` with real action, team, reporting periods, statuses and refresh callback. Manager creation/import controls are hidden and guarded for other cohorts; executive controls remain read-only.
- Quarterly modal opens with existing recorded narratives and their strict integer version, or exactly `expectedVersion: 0` for a new narrative. POST includes that retained version and action identity. Conflict 409/428 retains text and original version, blocks automatic replay, and offers explicit discard/load-latest before a new save. Saving is labelled as returning to draft, not formal approval.
- Strategy reporting uses a real period select and `ReportHistoryPanel`. The old raw quarterly report renderer and snapshot writer are removed. Immutable snapshot ID/version/provenance remain handled by the existing history panel.
- Review Pack strategy/action URL hints must be UUIDs present in authenticated loaded strategy/action choices. Foreign, malformed or unavailable choices are not selected or fetched by URL. Delayed workspace/action responses are fenced; unsuccessful linked-strategy loads do not cause an automatic request loop.
- Settings exposes inbox/preferences to Council roles, tenant policy/outcome controls only to Organisation Administrators, lifecycle data controls to Organisation Administrators/read-only Executives, and archived-record recovery. Platform users receive no Council settings.
- AuthContext retains `organisationStatus` and `operationsOnly`. `/admin` remains canonical, with deliberate `/system-admin` compatibility redirect. Platform `accessActive:false` goes to operations before Council pages/billing mount. Authenticated ended-entitlement Council users see subscription recovery and Organisation Administrators also get `TenantDataPanel`; inactive/suspended Council state blocks both, independently of subscription. Shell state is keyed to authenticated tenant/user/role.
- The Council customer drawer has a narrow lifecycle render slot, supplied by SystemAdminPage with the selected customer ID. Operations readiness reports actual `/health/ready` database/job statuses, including 503 unready responses, with separate configuration-only billing labels and explicit unverified external-service limits.
- Platform message UI does not request organisation notification monitoring or expose historical security content/replay. Invitation outcomes distinguish provider `accepted` from delivered and direct disabled/failed/uncertain outcomes to fresh original-flow regeneration. Legacy `sent` is explicitly labelled provider accepted.
- New `ArchiveRecoveryPanel` supports all 11 maintenance kinds, bounded pages including empty filtered pages with `hasMore`, inspected-record reads, manager/server-permission restore controls, explicit confirmation, retained `expectedUpdatedAt` + `expectedVersion`, conflict/reload behavior and stale-response fencing. It is available in portfolio, strategy and settings, independent of active selection. Existing maintenance child archive toggles remain intact. Restoration preserves original delivery state; a previously inactive action may remain inactive.
- Existing project/action/milestone edit callers were audited: there are no raw legacy PATCH forms in the integrated frontend. The shared maintenance editor sends only changed fields to its guarded endpoints. It now also retains the opening form snapshot when a parent observes a competing revision; no just-before-save fetch defeats conflict checking.

The exact local Quartermark assets and public main theme are unchanged. No sample records, fabricated progress, invented service verification, delivered-email assurance or deployment claim is added.

## Validation

Executed from `frontend` using its existing `node_modules`:

```sh
CI=true node node_modules/react-scripts/bin/react-scripts.js test --runInBand --watchAll=false
CI=true node node_modules/react-scripts/bin/react-scripts.js build
node --test src/lib/trustData.test.mjs
node_modules/.bin/eslint <integrated frontend sources and new tests> --max-warnings=0
git diff --check
```

Results: **17 suites / 111 tests passed**, **optimized strict CI build compiled successfully**, **28/28 native trust regressions passed**, owned-source ESLint passed without warnings, and whitespace validation passed. New rendered/pure tests cover all Council cohorts and operations-only platform routing, ended entitlement and suspension, selected-action panel props, reporting period changes, safe deep-links, strict new/edit quarterly versions and retained 409 drafts, page-local archive pagination, manager versus read-only restore, explicit preconditions, stale responses, and maintenance form-lifetime snapshots.

Logs: `/home/ubuntu/frontend-integration-tests.log`, `/home/ubuntu/frontend-integration-build.log`, `/home/ubuntu/frontend-trust-native.log`. Build output is `frontend/build` and is not committed.

## Remaining integration/release gates

Parent owns actual API/isolated-DB routing/migration/rollback/concurrency rehearsal and real authenticated browser checks for five cohorts at three viewports, keyboard/mobile overflow/print behavior, dependency audit and deployment checks. This frontend task did not execute them. Export encryption availability, billing/provider behavior, signed notification feedback, worker commissioning, backup freshness and restore rehearsal remain authoritative backend/operator prerequisites. Health readiness alone does not certify those live services. Recovery is non-destructive and no purge, retention timer, outbox replay, binary attachment downloader or suspension bypass is introduced.
