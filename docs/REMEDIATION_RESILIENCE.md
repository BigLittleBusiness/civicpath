# Area 9 — Operational resilience remediation

## Scope and permission boundaries

This is standalone tooling for the existing CivicPath MySQL/Express architecture. No central router, scheduler, index, deploy script, model registry, environment template, dependency file or production infrastructure is changed. No migration or application data write is needed for health. Public health is intentionally unauthenticated, read-only and tenant-neutral: it reports only fixed service/status strings and two fixed check labels. It never returns job names, counts, hostnames, database names, deployment versions, errors, topology, tenants or secrets. Executive/viewer access gains no writes. Operator backup reads, isolated rehearsal writes and off-host uploads are separately explicitly gated; production restore is not implemented.

| Action | Caller and authorisation | Data / tenancy boundary |
| --- | --- | --- |
| GET health live/ready/compatibility alias | Public GET, bounded and rate-limited by parent | No tenant records or metadata returned; SELECT 1 only |
| Job heartbeat hooks | Trusted server scheduler code only | No HTTP mutation route; no tenant IDs/errors retained |
| Database backup | Approved operator; private read-only MySQL client config; explicit source-read acknowledgement | Named existing source, no writes, no DDL; encrypted dump remains sensitive |
| Restore rehearsal | Approved operator on explicitly isolated loopback nondefault-port instance | New random cp_restore database only; fresh account limited to that DB; no reuse, DROP or deletion |
| S3 backup upload | Separate explicit operator approval; pre-existing versioned destination/IAM | Encrypted bundle only; exact-version readback; no bucket provisioning |
| Service checks / monitor | Operator, safe GET contracts, optional staging test bearer identity | Same-origin identity only; no email/send/payment/webhook/storage mutation |

## Exact integration instructions (parent-owned files only)

Exports:

- `api/src/services/healthService.js`: `createMysqlReadinessProbe({ sequelize, timeoutMs, cacheMs, now })`, `createJobHeartbeatRegistry({ now })`, `createHealthService({ databaseProbe, jobs, requireJobs })`.
- Registry methods: `register(name, { maxAgeMs, startupGraceMs, maxRunMs })`, `start(name)`, `succeed(name)`, `fail(name)`, `run(name, asyncWork)`, `check()`.
- `api/src/controllers/healthController.js`: `createHealthController(service)` returning `live` and `ready` handlers.
- `api/src/routes/v1/health.js`: `createHealthRouter({ service, middleware = [] })`, returning an Express router. No second Sequelize instance/pool is imported or created.

Parent should replace the existing static `v1Router.get('/health', ...)` with the standalone router **before** authentication/tenant middleware. Do not leave the old handler earlier in the stack or it will shadow the compatibility alias. Instantiate the registry once and share it with scheduler wrappers:

```js
import { sequelize } from '../../config/database.js'; // relative path from routes/v1/index.js
import { createHealthRouter } from './health.js';
import { createHealthService, createMysqlReadinessProbe, createJobHeartbeatRegistry } from '../../services/healthService.js';

// Export/share this same instance with scheduledJobs, via a parent-owned runtime module.
const jobs = createJobHeartbeatRegistry();
jobs.register('pulse_retry', { maxAgeMs: 25 * 60_000, maxRunMs: 5 * 60_000 });
jobs.register('contact_retry', { maxAgeMs: 25 * 60_000, maxRunMs: 5 * 60_000 });
jobs.register('strategy_alerts', { maxAgeMs: 96 * 60 * 60_000, maxRunMs: 15 * 60_000 });
const health = createHealthService({
  databaseProbe: createMysqlReadinessProbe({ sequelize, timeoutMs: 1500, cacheMs: 1000 }),
  jobs,
  requireJobs: true,
});
v1Router.use('/health', createHealthRouter({ service: health, middleware: [/* parent rate limiter */] }));
```

Wrap actual job work, not merely cron registration/startup, e.g. `jobs.run('pulse_retry', () => retryPendingPulseNotifications())`. The wrapper rethrows the original error for the caller's private error handling while storing only a boolean failure. Success after zero work attempted is a scheduler execution heartbeat, **not** evidence of email delivery. A job that is disabled/not commissioned should be left `not_configured` and documented, never falsely marked successful. Do not register the existing log-only due-date placeholder as a verified worker. Long jobs need sensible explicit policies. Default `startupGraceMs = 0` intentionally reports registered-but-never-successful jobs as **unready immediately after a restart**; there is no reset-to-green restart loophole. Explicit nonzero startup grace is an operator exception and must be justified. For daily weekday jobs, 96h covers weekend gaps; a first start remains unready until a genuine successful run. A parent can arrange a safe non-mutating/appropriate startup catch-up separately.

The registry is process-local, **not durable**. It makes no cross-restart stale-age or shared-worker claim. Expected maps fail closed at process startup and require fresh successful runs. If the scheduler is a different process or there are multiple API workers, do not use a healthy empty/API-local registry: parent must supply a trusted bounded shared job-check adapter with durable last-success/expected-job state, or use a separate worker readiness target. Use `requireJobs: true` on the worker-readiness target. Do not evict healthy web replicas just because unrelated external commissioning is absent; `/live` is always DB/job-independent.

Endpoint contracts, all with `Cache-Control: no-store`:

- `/api/v1/health/live`: HTTP 200 `{ "data": { "service": "civicpath-api", "status": "alive" } }`.
- `/api/v1/health/ready` and `/api/v1/health`: HTTP 200 if ready, otherwise 503. Fixed `checks.database` is `ready|unready`; `checks.backgroundJobs` is `ready|unready|not_configured`.
- Database probe uses the existing Sequelize connection manager, native mysql2 callback `SELECT 1`, maximum response deadline 100–5000ms (1500ms default), native query timeout, single-flight acquisition and short cache. A query deadline destroys only the borrowed probe connection. A late acquisition is returned without executing SQL. Pending acquisition/driver operations stay single-flight after the HTTP timeout rather than building an unbounded queue. Shared Sequelize pool is never closed. The shared pool's existing 30s acquisition wait is not globally altered; health response still fails by its own deadline. Parent should apply perimeter/API health rate limits and tune pool/network timeouts centrally.

## Locally executable tests and drill

No DB or daemon is started by these tests. Node pure/fake tests do not require Sequelize. The optional real local Express contract test requires the existing Express dependency; dependency manifests are untouched.

```bash
bash infra/resilience/local_drill.sh
node --test api/tests/resilienceHealthRouter.test.mjs
python3 -m py_compile infra/resilience/*.py
bash -n infra/resilience/local_drill.sh
```

The finite fake-contract drill performs **real OpenSSL encrypted compression/decryption**, authenticates the manifest/ciphertext digest, checks byte-identical plaintext roundtrip, rejects wrong keys/tampering, rejects production/default-port/remote/no-approval restore targets, checks SQL allowlists and private file permissions, tests memory-only generated credentials, and exercises fake versioned S3 PUT/exact-version readback. Fake S3 and service HTTP contracts are **not live external acceptance**.

### Parent's isolated MySQL8 round-trip

`infra/resilience/mysql_roundtrip_drill.py` accepts JSON on stdin only, with exactly `user`, `password`, `sourceDatabase`; no secrets in argv/environment/logs or persisted plaintext credential files. Source must be a fresh `civicpath_test_<6–32 lowercase hex>` database. The parent/operator owns the existing isolated instance and supplies generated credentials from its process. It can use Python `subprocess.run([...], input=json.dumps(generated).encode(), check=True)` targeting:

```text
python3 infra/resilience/mysql_roundtrip_drill.py --port 3317 \
  --acknowledge-isolated-instance --output-dir /PRIVATE/APPROVED/drill
```

Do not paste real credentials into a shell pipeline/history. The drill creates a **new** `cp_restore_YYYYMMDD_<12hex>` DB and scoped random account, encrypts/decrypts with a throwaway high-entropy key in a Linux anonymous memfd, compares every table's `SHOW CREATE TABLE` digest, exact row count and `CHECKSUM TABLE ... EXTENDED`, verifies unchanged source, and records only aggregate digest/count and isolated database IDs. Writes occur only in the fresh restore DB and test account on the explicitly acknowledged isolated instance. Tables/data/accounts are retained rather than destroyed. The throwaway backup key is intentionally discarded, so the drill's artifact is not a recoverable operational backup. No shared DB is started. With live writes to source, stop/quiesce the **test workload** or expect the unchanged-source check to fail.

This agent could not authenticate to the parent's isolated server without its generated credentials; live MySQL roundtrip execution must be completed by parent/operator and its exact report recorded. A successfully run script's `verified_isolated_roundtrip` is the acceptance evidence, not this narrative.

## Real encrypted backup / restore tooling

`infra/resilience/backup_restore.py` uses Python standard library, MySQL8 `mysql`/`mysqldump`, gzip and OpenSSL CLI; optional upload uses AWS CLI. It does not install any package, schedule or service. Every output/secret input directory/file is owner-private, nonsymlink and regular (0700 directory, 0600 file). No `.env` is read. Store operator-managed credentials and high-entropy 32+ byte passphrase in an approved private secret store/path outside Git. The restore account and finite-drill credentials use inherited Linux memfd, not plaintext credential files. MySQL login-path inheritance is disabled with `MYSQL_TEST_LOGIN_FILE=/dev/null`; explicit `--defaults-file` is always first. No password is placed in CLI args or output.

### Backup

```text
python3 infra/resilience/backup_restore.py backup \
  --client-config /PRIVATE/source-readonly.cnf --passphrase-file /PRIVATE/backup-key \
  --db-name APPROVED_SOURCE --output-dir /PRIVATE/backups --acknowledge-source-read
```

The source read must be authorised by the production owner before running there; no source production read was performed here. Use a least-privilege account with SELECT and needed metadata privileges; deny source mutation. The pipeline is `mysqldump --single-transaction --quick ... | gzip | openssl enc`; clear source SQL never lands on disk during backup. It disables drop statements, database creation directives, GTID/global output, column statistics, stored routines/events/triggers and locks; the preflight **rejects**, rather than silently omits, stored code/views/non-InnoDB tables. DDL must be prohibited throughout the snapshot. Pre/post table inventory digest must match. Production-wide application writes may continue with InnoDB single-transaction snapshot, but reconciliation/data checksum rehearsal needs a quiescent test snapshot. A missing metadata privilege/unsupported feature fails closed; use a separately reviewed backup plan for unsupported schemas.

Encryption is AES-256-CBC with fresh OpenSSL salt, PBKDF2-HMAC-SHA256 (600,000 iterations), and **encrypt-then-MAC**: an independent domain-separated salt/key authenticates the canonical manifest including ciphertext SHA256/length/schema inventory. HMAC is verified **before decryption or restore DB creation**. This avoids unauthenticated CBC and daemon-dependent GPG. The secret high-entropy passphrase must be retained separately in approved recovery escrow; length checks cannot prove entropy. Bundle includes `database.sql.gz.enc`, `manifest.json` and `manifest.sha256`. Public SHA256 checks detect corruption; keyed HMAC prevents forgery when checksums are recomputed. No key, credentials, source name/host, storage path or plaintext SQL appear in the manifest.

```text
python3 infra/resilience/backup_restore.py verify --bundle /PRIVATE/backups/backup-ID
```

`verify` proves local ciphertext/manifest checksums only and reports `offHost:not_checked`; it does not decrypt or prove database recovery. For actual recovery use the isolated rehearsal with retained key. All commands are finite, bounded by `--timeout` (10–3600s; default 900s). Failed pipelines retain any encrypted partial artifact but create no accepted manifest. Errors are generic to avoid leaking operator details.

### Off-host transfer (disabled unless explicitly approved)

```text
python3 infra/resilience/backup_restore.py upload --bundle /PRIVATE/backups/backup-ID \
  --bucket APPROVED_EXISTING_VERSIONED_BUCKET --prefix APPROVED_PREFIX --approve-offhost-upload
```

Requires an **already enabled** versioned S3 destination and least-privilege existing AWS CLI credentials. No bucket/IAM/lifecycle paid resources are provisioned. Uploads ciphertext/manifest/checksum with server-side AES256 as defence in depth, records returned immutable version IDs, downloads each exact version and compares SHA256 before writing private `offhost-receipt.json`. A local backup alone is `offHost:not_verified`; a returned PUT/HEAD alone is not verification. Receipt includes sensitive bucket/key/version metadata and must remain private/outside public health and Git. Overwriting an existing receipt is refused. The uploader does not promise provider-independent/other-region resilience, account independence, immutability retention, replication or key availability. Those policies require operator approval/verification. Use a bucket/account physically/logically off the application host and document region/account access independence; an S3-compatible endpoint on the same host is not off-host. The AWS CLI installed configuration/endpoint is operator-owned and must be inspected by its authorised owner before commissioning.

### Isolated restore only

Operator creates/acknowledges a dedicated MySQL8 test instance on loopback TCP with a nondefault port, and a private marker file whose exact content is `CIVICPATH_ISOLATED_RESTORE_INSTANCE` plus newline. **A name/marker alone cannot prove isolation**: do not tunnel a production server to loopback or point this tool at production. The explicit acknowledgement is the operator assertion that this is an isolated environment; no software bypass flag permits production names.

```text
python3 infra/resilience/backup_restore.py restore-rehearsal \
  --bundle /PRIVATE/backups/backup-ID --admin-config /PRIVATE/isolated-admin.cnf \
  --passphrase-file /PRIVATE/backup-key --rehearsal-dir /PRIVATE/rehearsals \
  --isolation-marker /PRIVATE/isolated.marker --host 127.0.0.1 --port 3317 \
  --acknowledge-isolated-instance
```

Default target is randomly generated. Optional `--target-db` accepts **only** `cp_restore_YYYYMMDD_<12hex>`, refuses any existing DB/report directory, and never has an overwrite/force/drop option. Ciphertext and keyed manifest integrity checks must pass before decryption. Rehearsal temporary SQL is bounded (20GiB default ceiling, configurable lower), private and automatically removed on exit; run on an approved encrypted test filesystem with adequate capacity. Clear SQL/data may exist temporarily during isolated import, unlike the source backup pipeline. SQL is conservatively lexed with quoted-data/comment handling; only unqualified CREATE TABLE, literal INSERT VALUES and session SET directives are accepted. Destructive/global/account/stored-code/client commands and cross-schema qualifiers are rejected. This is intentionally restrictive rather than a general SQL security parser: the second boundary is a fresh **least-privilege test account scoped only to the new DB**, not the admin connection. Imports stop on first error and never use `--force`. Failed partial **isolated** targets/accounts are retained for operator inspection, not deleted. This script verifies table inventory + SELECT 1 and writes private `rehearsal.json`; use `mysql_roundtrip_drill.py` for full test source-schema/row-content reconciliation. It does not by itself prove tenant/business workflows, attachments, PITR, RPO or RTO.

### Production restore approval boundary

There is deliberately **no production restore command**. Production recovery requires incident owner approval of the target, backup timestamp/version, encryption-key custody, expected data loss, downtime, tenant impacts and rollback path. Rehearse first in a new isolated DB, verify schema/data and tenant/application/auth checks, document measured RTO and effective RPO, and have an approved change plan switch the application to the reviewed restored instance. Never DROP/overwrite the original production DB as a first step. Preserve incident evidence, hold old database read-only, and coordinate notifications/webhook idempotency so recovery cannot replay deliveries or billing actions uncontrolled. Production procedure is approval-needed, not a completed drill.

## S3 attachment version / key recovery runbook (not a fabricated drill)

Application attachments (`supportAttachmentStorage.js`) currently record storage key and SHA256 and request S3 SSE AES256. That does **not** establish bucket versioning, historical retention, independent copies or KMS escrow. Database backup is not attachment backup; coordinate the DB recovery point with object version records, and back up any local development attachments separately through an approved tool. Do not expose storageKey/tenant path to public health or restore into another tenant's key prefix.

1. Obtain incident approval and authorised private attachment record: tenant, original storage key, provider, expected size/SHA256 and needed recovery timestamp. Confirm requester permission and tenant ownership. No cross-tenant recovery.
2. Read-only inventory using existing AWS CLI credentials: `s3api get-bucket-versioning`, `list-object-versions` with the exact approved prefix, and `head-object --key KEY --version-id VERSION`. Keep output private. Identify the **object version** (not a delete marker) that matches the incident/recovery point; latest is not always correct. An ETag is not universally a content checksum.
3. `get-object --key KEY --version-id VERSION /PRIVATE/QUARANTINE/object` downloads the selected existing version into private isolated quarantine. Check byte length and SHA256 against the authorised database record. Review malware/signatures with an approved scanner; verify GET permission from the actual recovery identity.
4. If encrypted with SSE-KMS in the actual bucket, independently confirm the CMK is enabled, correct key/version policy, decrypt grant and any scheduled deletion hold. Do not change KMS policy/enable keys/cancel deletion without approval. Current app source uses SSE-S3, not a proved KMS configuration. Client-encrypted DB backup needs its independent escrowed passphrase; losing it is unrecoverable despite healthy S3 versioning.
5. Rehearse **read-only** retrieval/permission/hash on staging with a test object. Record actual commands, timestamps, checksums, version IDs, principal, environment and outcome in private evidence; missing/disabled versioning, expired versions, denied decrypt or absent escrow is a commissioning/incident blocker.
6. A production attachment reinstatement/copy/new-version upload or DB storage-key update needs tenant-scoped change approval and transactional audit. No such mutation is performed by these tools. Preserve previous version/key and incident records; review Object Lock/retention and independent-account recovery separately rather than assuming they exist.

No S3/key recovery drill was run in this worktree. The fake-contract test establishes script flow only.

## External readiness, smoke and monitoring

`service_checks.mjs` reads a private JSON check configuration (not `.env`) and only makes finite bounded HTTPS GETs. `--allow-local-http` permits loopback HTTP for finite dev contracts only, never remote plaintext. Credentials in URLs/query/fragment are rejected; redirects are rejected. Headers **and body** have an overall timeout (default 3000ms; 100–10000ms) and 64KiB body cap. Arbitrary upstream content/errors/URLs/tokens never enter reports. Bearer `CIVICPATH_SMOKE_TOKEN` is optional and sent only to same-origin configured evidence or authenticated smoke targets, never a third-party endpoint. Use a scoped read-only staging test identity with no production writes.

Configuration contract, written by operator in a private file outside Git (the following is nonsecret documentation, not an environment template):

```json
{
  "baseUrl": "https://APPROVED_STAGING_ORIGIN",
  "environment": "staging",
  "services": {
    "email": { "configured": false },
    "storage": { "configured": false },
    "billing": { "configured": false },
    "webhook": { "configured": false },
    "backgroundJobs": { "configured": false },
    "backup": { "configured": false }
  },
  "smoke": [
    { "path": "/api/v1/dashboard/overview", "expectedStatus": 401 },
    { "path": "/api/v1/strategy-workspace", "expectedStatus": 200, "authenticated": true }
  ]
}
```

To commission a configured service supply `configured:true`, a read-only `evidenceUrl` and optional `maxEvidenceAgeMs` (24h default, 1s–7d allowed). A fixed path returning 200 is **not** enough. Required evidence response is `{ "data": { "service": "email", "status": "verified", "environment": "staging", "verifiedAt": "ACTUAL_ISO_TIMESTAMP" } }`; service name/environment must match and timestamp must be fresh, no more than 60s in future. Parent/operator must provide authenticated read-only evidence generated from **genuine successful staging/live verification**. No evidence endpoint is invented/enabled here. A check trusting owner-issued evidence is an assertion/evidence-age check, not a new SES send/Stripe charge/S3 write/webhook delivery. Safe application smoke GETs can check 200/401/403/404 boundaries but do not establish complete workflow correctness.

```text
node infra/resilience/service_checks.mjs --config=/PRIVATE/checks.json
node infra/resilience/monitor.mjs --config=/PRIVATE/checks.json --state=/PRIVATE/monitor-state.json
```

Strict default fails readiness for **not_configured**, **configured_unverified**, stale/wrong-environment evidence and failed health. `--allow-unconfigured` is a developer diagnostic exception, not deployment acceptance. Report separates these states; it never substitutes presence of env vars for successful service verification. Names allowed: email, storage, billing, webhook, backgroundJobs, backup. Add service evidence under parent-owned secure admin integration if desired, with normal tenant/role/privacy controls; do not mount private commissioning details on public health.

Monitor is **one finite poll**, not a new daemon/cron/paid service. Caller owns approved schedule and alert transport. Private state tracks consecutive failures across invocations; do not overlap writers. Exit 0 healthy, 1 not-ready but below sustained alert threshold, 2 alert/config failure. Default alerts: health/service failure after **3 consecutive samples** is critical; missing/unverified commissioning after 3 samples is a commissioning blocker; liveness/readiness latency **over 1500ms** is a warning per sample. Recovery resets failure counter. Recommended approved sampling is 60s, giving ~3-minute sustained detection; no schedule installed here. Independent external checks must run off the application host to detect host/network loss.

Additional operator thresholds (not falsely claimed as implemented telemetry): backup age >26h for daily cadence = critical; last successful restore rehearsal >30d = commissioning warning; verified backup key escrow unavailable = critical; job retries stale >25min, run >5min = unready; weekday alerts stale >96h = unready; API 5xx >1% over 5min or >5% for 1min = alert; p95 API latency >1500ms for 5min = warning; disk free <15% or <5GiB = warning, <10% or <2GiB = critical; CPU >85%/memory >90% for 10min = capacity warning. These need existing host/log/metrics collectors and alert-owner approval. Readiness failure should remove traffic where appropriate; liveness failure/restart policy must not use readiness/DB as process liveness.

## Validation status and unavailable acceptance

Verified locally: finite DB-free deadline/single-flight/late-acquisition/probe-connection teardown tests; liveness/readiness redaction/status/header tests; expected-job restart/stale/failure/recovery tests; finite fake HTTP health/service contracts, stale evidence, stalled network/body, token origin/privacy and auth smoke checks; threshold/recovery monitoring logic; real OpenSSL roundtrip/HMAC authentication/tampering/wrong-key tests; private-file/isolation/SQL negative checks; inherited anonymous-memory credential contract; fake S3 versioned readback and no-approval/no-versioning gates. Exact commands and final totals are recorded in the task delivery.

Unverified here: parent isolated MySQL source roundtrip until generated credentials are supplied; full API and frontend regression gates (parent owns shared integration/dependencies); production dependency audit; production/staging Nginx/load-balancer wiring and external HTTPS endpoint reachability; genuine SES email reception/bounce handling; S3 attachment version/key recovery and independent off-host encrypted readback; Stripe test-mode billing roundtrip and webhook delivery; actual scheduled-job runs across worker processes/restarts; business/tenant/auth workflow smoke on restored data; backup scale/performance/DDL-free operational run, PITR and measured RPO/RTO; host metrics/alert delivery, independent monitoring location, secret escrow and retention approvals. No paid resource, production mutation, GitHub push, browsing, shared daemon or fabricated acceptance was performed.
