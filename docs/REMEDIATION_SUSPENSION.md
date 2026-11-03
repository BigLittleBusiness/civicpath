# CivicPath remediation area 5: consistent suspension enforcement

## Scope and implementation

This change owns `api/src/middleware/auth.js`, `api/src/controllers/authController.js`, `api/src/controllers/customerAdminController.js`, four tenant-security service modules, and suspension tests. No central route, model index, package/lock, environment/template, frontend, schema, production configuration or database migration is changed. All imports use the existing Sequelize instance and model exports. There are no added dependencies.

Authentication now reads the authoritative user **and** organisation on every protected full/pending session. The token must match the current user ID, organisation ID, role, active user status and session version. Malformed/missing versions fail closed. Pending-MFA tokens cannot authenticate full API sessions even when supplied as bearer tokens. Only HS256 is accepted by the production verifier.

Organisation access uses an allowlist (`trial`, `active`), independently of subscription entitlement. `suspended`, `closed`, `inactive`, unknown, null, missing and soft-deleted organisations have no council workspace access. An active subscription cannot override suspension. Subscription checks continue to require active, unexpired subscriptions for workspace data; suspension is checked before subscription queries and before billing/support handlers.

Login checks organisation access before issuing a pending or full session. Full session issuance re-reads user status/version and organisation state without adopting a newer session version after password/MFA verification. A concurrent password reset, suspension or restoration therefore requires a fresh authentication attempt. MFA enrollment retry-secret reuse, mandatory platform MFA, authenticator/recovery-code verification and privileged reauthentication remain supported. `accountLifecycleController.js` and the historical `systemAdminMfaFlow.mjs` / `passwordResetConcurrencyFlow.mjs` are untouched; atomic password-reset token consumption and session invalidation remain in place.

## Explicit permission matrix

| Identity / state | Authentication | Council data API | Billing / tenant support API | Platform operations | Tenant state change |
|---|---|---|---|---|---|
| Active tenant user, active/trial organisation | Login with current subscription as before | Existing route roles + active subscription | Existing policy, no suspension exception | Denied | Denied |
| Tenant user, suspended/closed/inactive organisation | New login denied; old session denied | Denied | Denied, including read-only billing summary and support challenge | Denied | Denied |
| Executive, active tenant | Existing login | Read-only, existing entitlements | Read-only only; tenant mutations denied | Denied | Denied |
| Platform admin, active account and existing home organisation | Mandatory MFA; `/auth/me` and `/auth/step-up` available | Denied regardless of home tenant or subscription | Denied | Allowed only on mounted `/v1/admin` router | Existing council/joint-organisation allowlist + fresh step-up |
| Legacy platform admin attached to suspended council | MFA recovery/sign-in allowed explicitly for **operations only** | Denied | Denied | Allowed with freshly authenticated session | Allowed subject to target allowlist + fresh step-up |
| Missing/deleted organisation or disabled user | Denied | Denied | Denied | Denied | Denied |

There is **no tenant access-recovery data endpoint** in this change. Password reset and logout remain public authentication operations, not council-data access. Public support/contact paths retain their existing public policy and return no council tenant data. Suspended customer representatives must use public contact channels or ask a platform administrator for restoration; they cannot access billing/customer portals through stale sessions. Platform recovery is explicitly operations-only and never grants council API entitlement.

## Atomic suspend and restore

`createTenantStateChanger()` runs one managed transaction:

1. Validate actor role, fresh step-up, target UUID and approved destination state.
2. Lock the target council/joint-organisation row (`SELECT ... FOR UPDATE`) and validate demo/duplicate transitions.
3. Update organisation status.
4. Increment **all existing users'** `sessionVersion` in that tenant, including inactive accounts and legacy platform administrators.
5. Create `TenantStateEvent`.
6. Create the required `AuditLog` in the same transaction.

Any dependent failure rolls back every write. All state transitions increment versions, including restoration and `active`/`trial` changes. Restoration never copies or decrements old session versions and also invalidates platform recovery sessions issued while suspended. Customer operations are authenticated by the platform actor, with explicit target organisation IDs restricted to allowed organisation types; tenant scope is never taken from request query/body/headers.

The caller's free-text `reason` is validated for compatibility but **not retained**. Operators can paste passwords/tokens into arbitrary text, so the durable event uses a fixed non-sensitive approval description. Audit metadata is exactly `{ customerId, fromStatus, toStatus, sessionsInvalidated }`; no names, request bodies, credentials, tokens, MFA codes or free text are logged. This intentionally sacrifices detailed operator rationale to satisfy the no-credential-in-log requirement. A future structured reason-code UI may replace that limitation without accepting free text into audit records.

## Integration instructions and exports

Cherry-pick the area commit as a whole. Existing central imports remain compatible; **no central route changes are required for the published `a7651d1` route layout**.

- `middleware/auth.js` still exports `requireAuth`, `requireMfaPending`, `requireRoles`, `tenantScope`, `requireActiveEntitlement`, `requireStepUp`. It additionally exports `createTenantAuthentication` for isolated tests.
- `controllers/authController.js` still exports `login`, `beginMfaSetup`, `mfaPending`, `confirmMfaSetup`, `verifyMfaLogin`, `stepUp`, `logout`, `me`, and additionally `createTenantAuthController`.
- `controllers/customerAdminController.js` keeps the original four exports.
- `services/tenantAccessPolicy.js`: `TENANT_ACCESS_STATES`, `TENANT_ROLES`, `TENANT_UNAVAILABLE`, `PLATFORM_TENANT_DENIED`, `sessionMatchesUser`, `organizationAccessDecision`, `requestAudience`, `authoritativeAuth`, `subscriptionIsCurrent`, `assertPlatformActor`.
- `services/tenantAuthentication.js`: `createTenantAuthentication` dependency-injected middleware factory.
- `services/tenantAuthController.js`: `createTenantAuthController` dependency-injected controller factory.
- `services/tenantStateChange.js`: `MANUAL_TENANT_STATES`, `councilOrganisationTypes`, `createTenantStateChanger` dependency-injected managed transactional service.

The parent must preserve this mounting order when integrating other areas:

```js
v1Router.use('/auth', authRouter);
v1Router.use('/admin', requireAuth, tenantScope, adminRouter);
v1Router.use(requireAuth, tenantScope);
// billing/support handlers here are still protected by organisation state
v1Router.use(requireActiveEntitlement);
// council data handlers follow
```

`requestAudience()` uses the exact server-controlled Express `baseUrl`: `/v1/admin` for operations; `/v1/auth` + exact `/me` or `/step-up` for full-session auth self-service; all other mounts default to council tenant. **Do not move platform operations behind the generic tenant gate.** If the parent changes the API prefix or mounts new platform routers, explicitly update the audience allowlist and tests; unknown mounts fail closed rather than grant a bypass. Do not create a tenant route named `/admin` under the platform mount. New protected routes must use these existing gates; direct/unprotected controller mounting cannot be secured by middleware it never invokes.

Auth responses add `organisationStatus` and `operationsOnly`; for platform sessions `accessActive` is **false** and `subscriptionStatus` remains `platform`. Parent-owned frontend routing should direct `platform_admin` to operations and must not interpret `accessActive:false` as permission to display customer billing recovery. No frontend changes are included; existing `AuthContext` currently drops the two new optional fields, so the parent may map them if it needs an explicit operations-only banner. The server isolation does not depend on frontend handling.

## Tests and exact commands

Focused DB-free suite (no environment configuration import, model import or DB connection):

```sh
node --test api/tests/suspensionEnforcement.test.mjs
```

Verified: **12/12 passed**, covering suspended/closed/inactive/unknown/missing tenant login, valid subscription + suspended API rejection including billing/support, stale versions after restore, authentication races, cross-tenant/stale-role/token-scope rejection, unauthenticated/wrong-role/executive denial, explicit operations-only platform MFA recovery, setup retry and one-use recovery-code compatibility, atomic suspend/restore, rollback on audit/event/invalidation failures, target/state/step-up validation, and non-sensitive audit allowlists.

Existing non-DB regression selection also verified:

```sh
node --test api/tests/suspensionEnforcement.test.mjs api/tests/accountBillingLifecycle.test.mjs api/tests/pulseAssessment.test.mjs api/tests/pulseWebhookPayload.test.mjs api/tests/supportAttachmentStorage.test.mjs
```

Verified: **24/24 passed**. Syntax checks passed for all owned JavaScript files and both new test files; `git diff --check` passed. An unrestricted `api/tests/*.test.mjs` run returned 28 passing / 1 failing before the final added test: the existing ALTCHA persistence test required an unavailable default local DB (`ECONNREFUSED`); no service was started and no DB changes succeeded. Full DB-backed release gates remain for the parent harness.

### Guarded real-API flow for parent's isolated MySQL harness

`api/tests/suspensionEnforcementFlow.mjs` is an opt-in flow, not part of `node --test`. It refuses invocation before loading config/models unless:

- `NODE_ENV=test` and `CIVICPATH_SUSPENSION_INTEGRATION=1`;
- explicit loopback `DB_HOST`, non-default `DB_PORT` (parent's isolated instance: `3317`), and `DB_NAME` containing `test` or `remediation`;
- explicit harness-owned test-only `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `PLATFORM_ENCRYPTION_KEY`;
- `CIVICPATH_TEST_URL` is an explicit loopback HTTP URL ending exactly `/v1`;
- current working directory has no `.env` file.

The parent should launch its API and this flow against the **same migrated isolated DB**, from the harness's empty working directory and already-established non-production environment:

```sh
NODE_ENV=test CIVICPATH_SUSPENSION_INTEGRATION=1 \
  node /home/ubuntu/civicpath-remediation/suspension/api/tests/suspensionEnforcementFlow.mjs
```

Supply remaining environment settings via the isolated harness, not by printing secrets or editing templates. This agent did not start or run a DB/API daemon or invoke the configured flow. Unconfigured guard refusal and script syntax were verified. The flow has a 15-second request timeout, creates randomized fixture-only organisations/users/plan/subscriptions, performs real password/MFA login and step-up over HTTP, and cleans up fixture records and its audit-failure hook in `finally`.

It checks actual protected routes with active subscriptions, a direct fixture-only status change without version increment (403), manual API suspension (401 stale token / 403 new login), pending MFA denial and bearer-scope isolation, fresh operations-only recovery on a suspended legacy council, restore invalidating both old tenant and recovery sessions, another tenant unaffected, executive and cross-tenant role denials, allowlisted audit metadata, and an actual DB managed-transaction rollback after a required audit hook deliberately fails. The rollback portion calls the **same production state-change service** against the isolated DB because hooks in the test process cannot alter a separate API process; no test/debug API route or schema trigger is installed.

## Limitations and release gates

1. The current organisation ENUM only supports `trial`, `active`, `suspended`. This implementation denies `closed`/`inactive` if present, but deliberately does not add those write states or migrate schema without an assigned migration number. Only the existing manual states are accepted.
2. Already-running requests authorised before suspension commits are not cancelled mid-handler. All subsequent authentication gates read authoritative state; state-changing handlers in other areas can add transactional tenant-state locks where strict in-flight cancellation is required.
3. External billing/webhook lifecycle code is outside this area's ownership. The parent must ensure those writers do not overwrite a manually suspended status or reset session versions. A provider subscription update is never itself an auth entitlement override, but an external writer that explicitly sets organisation status back to active is a restore policy decision requiring coordination.
4. Detailed free-text state-change reasons are intentionally discarded, as explained above. No migration or dependency installation/audit is included.
5. Real API/DB integration, historical MFA/password concurrency flows, complete API suite, frontend build, dependency audit and migration rehearsal must run in the parent-controlled non-production release harness. This change is not claimed deployed or production-ready.
