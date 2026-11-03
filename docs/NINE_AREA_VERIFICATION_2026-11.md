# CivicPath — Nine-area application verification

**Date:** 3 November 2026
**Repository/target:** `BigLittleBusiness/civicpath`, `app` branch only. `main` and the marketing branch are outside this release.
**Decision:** The integrated application acceptance suite passed in an isolated local environment. This is not approval to deploy production, evidence of commissioned external providers, a penetration-test certification, or a Binary Lane performance SLA.

## 1. Delivered outcomes

| Area | Completed application outcome |
| --- | --- |
| Trustworthy data and onboarding | Real persisted setup/readiness checks; honest empty/unavailable states; no fabricated production fallbacks; active-register totals and archive filtering. |
| Record maintenance | Governed editing across delivery records, same-tenant selection, archive/restore and archive recovery, stale-write conflicts and transactional audits. Contributors remain constrained to permitted assigned fields; Executives remain read-only. |
| Collaboration and approvals | Persisted-current-user and tenant-state checks, independent quarterly review, manager-only report inclusion, optimistic conflict checks and atomic multi-record transitions. |
| Reporting | Genuine reporting metrics, selected periods, immutable versioned snapshots/history and safe JSON, CSV and printable HTML outputs. Currency totals stay separated. |
| Suspension and recovery | Authoritative tenant/session enforcement, operations-only platform sessions and controlled billing/data recovery. Stripe payment cannot reopen a security-suspended or closed tenant. |
| Funding lifecycle | Council-owned manual grants/pathways, governed transitions, evidence/work links, conflicts, archive and bounded safe export with explicit provenance. |
| Reliable communications | Own-user inbox/preferences, organisation policy, opt-in/quiet-hour controls, durable fenced outbox, bounded retry/dead-letter processing, uncertain-send handling, signed-feedback verification and recipient suppression. |
| Council data ownership/exit | Tenant-scoped positive-allowlist export, private attachment requests, legal holds, independent request review and audited access closure with data preserved. No automatic destructive erasure. |
| Operational resilience | Liveness/readiness separation, real scheduler heartbeat/catch-up, safe encrypted backup/restore tooling, security regression tests and actual local browser/database acceptance. |

Detailed scope, operating boundaries and deployment sequence are in `NINE_AREA_REMEDIATION_2026-11.md`. The separate developer commissioning checklist is `DEVELOPER_COMMISSIONING_CHECKLIST_2026-11.md`.

## 2. Final observed acceptance results

The final combined run used fresh generated credentials, synthetic council records, a loopback-only MySQL 8 instance and actual HTTP API requests. All 18 filename-sorted migrations (`001`–`014`, `015`, `017`, `019`, `020`) ran twice against the disposable database. Numeric gaps are intentional.

| Gate | Observed result |
| --- | --- |
| API regression tests | **142 passed; 0 failed.** |
| Frontend regression tests | **111 passed across 17 suites.** |
| Strict frontend production build | Passed with CI enabled and no source-map generation. |
| Database/HTTP acceptance workflows | **11 passed:** maintenance/reporting; suspension; funding; notification reliability; tenant lifecycle; collaboration; collaboration transaction rollback; strategy delivery; concurrent password reset; System Administrator MFA; representative-volume performance. |
| Real-browser responsive layout checks | **195 passed**, covering all five roles at 390×844 mobile, 768×1024 tablet and 1440×1000 desktop. Permitted workspace-settings tabs were included. |
| Real-browser permission/keyboard checks | **15 passed**; council-to-platform and platform-to-council route boundaries checked. |
| Role-specific Top 10 default views | **15 passed** across the five roles and three viewport sizes. |
| Browser runtime errors | **0 observed.** |
| Backup/restore Python security regressions | **14 passed.** |
| Resilience/monitoring JavaScript regressions | **6 passed.** |
| Production dependency audits | **0 reported vulnerabilities** in both API and frontend at verification time (`npm audit --omit=dev`). This does not assert a vulnerability-free build-tool graph or immunity to future advisories. |
| Binary Lane portability, deploy-script syntax, whitespace/diff checks | Passed. |

Role guidance retains 30 answers per role and Top 10 defaults. Help filtering does not grant capability permissions; server authorization is authoritative. Raw help-search telemetry is not sent to external analytics. Browser/default-view checks are synthetic acceptance evidence, not measured customer adoption or production search analytics.

## 3. Security-negative and correctness checks

The actual API/database workflows verified lower-role and cross-tenant denial, stale-session and disabled/suspended-user handling, competing writes returning conflicts, required-audit rollback, independent approval rules, immutable historical snapshots and safe exports. The existing concurrent password-reset and pending-MFA invalidation regressions also passed.

The integrated tests found and corrected a real MySQL timestamp-precision issue: maintenance responses now return the persisted database revision, avoiding false immediate stale-write conflicts. Narrow-screen settings and protected support forms were corrected without hiding controls. Log-redaction tests check that raw database errors, SQL, parameters and secret-bearing exceptions are not emitted.

Notification-provider behavior was tested with a **fake provider only**. The final application run did not send customer mail, charge cards, access production S3 or connect to a production council database.

## 4. Actual encrypted local recovery

A genuine `mysqldump → gzip → encrypted artifact → verified isolated import` round trip passed for **84 tables and 672 rows**. It verified:

- the source remained unchanged;
- table inventory and semantic schema equality, including column defaults/types/charset/collation, generated expressions, indexes, keys, foreign-key rules and CHECK constraints;
- exact row counts and MySQL extended checksums;
- authenticated encrypted-manifest integrity;
- restored application sign-in and expected workspace access for all **four council roles**, with platform-route denial.

The native rehearsal found and fixed an unsupported `mysqldump` option and a SQL-allowlist false positive on a legitimate quoted `event` column. Schema verification now compares authoritative MySQL metadata instead of formatting-sensitive `SHOW CREATE` text; it normalizes only owning-schema references, not foreign schemas. Regression tests cover those corrections. An independent read-only review found no concrete new blocking defects in these recovery changes.

Generated credentials were not persisted. Temporary API/browser services and exact disposable source/restore databases and accounts were cleaned. The drill key was deliberately discarded; encrypted test artifacts are **not operational recoverable backups**. No off-host upload, production restore, real recovery-time objective or real recovery-point objective is claimed.

## 5. Representative-volume local performance

The fixture contained **100 projects, 100 grants, 50 strategy actions, 150 milestones and 50 quarterly updates**. Each route was measured with five local requests.

| Route | Observed p95 response time |
| --- | ---: |
| Dashboard overview | 142.20 ms |
| Project list | 93.28 ms |
| Grant list | 33.36 ms |
| Strategy workspace | 97.01 ms |
| Quarterly report | 57.64 ms |
| Collaboration my work | 31.15 ms |

These are small-sample local regression observations, not a concurrent-user load test, network-inclusive customer latency promise, capacity forecast or benchmark of the Binary Lane VPS. Production capacity/latency thresholds must be commissioned on the actual deployment.

## 6. Required developer commissioning before production

The user selected a developer commissioning handover rather than live-service testing in this task. The checklist covers:

1. Approved release SHA, backup/recovery point and compatible rollback.
2. Actual Binary Lane runtime, HTTPS, origins, headers, cookies, permissions, database migration and candidate smoke tests.
3. Stripe **test-mode** registration, verified-payment activation, signed/idempotent webhooks, billing portal, plan changes, refunds and Council Proof conversion-credit reconciliation.
4. SES identities/DNS/permissions and signed delivery/bounce/complaint feedback. Provider acceptance is never labelled delivery.
5. Private S3 ownership, upload/download, denied anonymous access, versioning and exact-version recovery; Zoho inward/reply routing.
6. Exactly one scheduler owner, bounded overlap/restart/catch-up checks and genuine worker heartbeat.
7. Encrypted off-host backup, key custody, coordinated database/object restore and measured environment-specific recovery objectives.
8. Approved retention/legal-hold policy. Destructive deletion stays disabled.
9. Independent monitoring/alert routing, release approval and rollback ownership.

There is **no connected external grant-opportunity catalogue** in this release. Manual council-owned funding records are supported; legacy grant CSV commits remain intentionally disabled and explained in the interface. Report snapshots are an immutable capture of current register data plus selected-period included updates, not reconstructed historical period-end registers or formal council approval.

**Production deployment and external commissioning were not performed.**
