// Public health responses intentionally contain no connection details, job names or errors.
const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Native mysql2 SELECT 1 with a total response deadline, protocol timeout and no probe fan-out.
 * The shared Sequelize pool is never closed. A timed-out probe connection is destroyed;
 * a late pool acquisition is released without executing SQL. */
export function createMysqlReadinessProbe({ sequelize, timeoutMs = 1500, cacheMs = 1000, now = Date.now }) {
  if (!sequelize?.connectionManager) throw new TypeError('A Sequelize connection manager is required');
  const deadlineMs = clamp(timeoutMs, 100, 5000, 1500);
  const ttl = clamp(cacheMs, 0, 5000, 1000);
  const manager = sequelize.connectionManager;
  let active = null;
  let cached = null;
  let cachedAt = -Infinity;
  return async function probeDatabase() {
    if (active) return active.response;
    if (cached && now() - cachedAt < ttl) return cached;
    let connection;
    let expired = false;
    let destroyed = false;
    let timer;
    const started = now();
    const destroy = () => {
      if (!connection || destroyed) return;
      destroyed = true;
      // Consume asynchronous teardown errors; do not leak driver errors into health logs.
      Promise.resolve().then(() => manager.destroyConnection(connection)).catch(() => {});
    };
    const operation = Promise.resolve().then(async () => {
      try {
        connection = await manager.getConnection({ type: 'SELECT', useMaster: true });
        if (expired || now() - started >= deadlineMs) return false;
        await new Promise((resolve, reject) => {
          connection.query({ sql: 'SELECT 1', timeout: Math.max(1, deadlineMs - (now() - started)) },
            (error) => error ? reject(error) : resolve());
        });
        return !expired;
      } catch {
        destroy();
        return false;
      } finally {
        if (connection && !destroyed) {
          try { await manager.releaseConnection(connection); } catch { destroy(); }
        }
      }
    });
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { expired = true; destroy(); resolve(false); }, deadlineMs);
    });
    const slot = { response: null };
    slot.response = Promise.race([operation, timeout]).then((ready) => {
      clearTimeout(timer);
      cached = { status: ready ? 'ready' : 'unready' };
      cachedAt = now();
      return cached;
    });
    active = slot;
    // Keep the slot until the driver/acquisition actually settles, even after the HTTP timeout.
    operation.finally(() => { if (active === slot) active = null; }).catch(() => {});
    return slot.response;
  };
}

/** In-process hooks: parent must register every actual worker job on each worker instance.
 * Never put errors, counts, IDs, tenants or secrets into public readiness. */
export function createJobHeartbeatRegistry({ now = Date.now } = {}) {
  const jobs = new Map();
  function register(name, { maxAgeMs, startupGraceMs = 0, maxRunMs = Math.min(300000, maxAgeMs) } = {}) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 7 * 86400000
      || !Number.isSafeInteger(startupGraceMs) || startupGraceMs < 0 || startupGraceMs > maxAgeMs
      || !Number.isSafeInteger(maxRunMs) || maxRunMs < 1000 || maxRunMs > maxAgeMs) throw new TypeError('Invalid heartbeat policy');
    if (jobs.has(name)) throw new TypeError('Job already registered');
    jobs.set(name, { registeredAt: now(), maxAgeMs, startupGraceMs, maxRunMs, lastSuccess: null, startedAt: null, failed: false });
  }
  const lookup = (name) => { const job = jobs.get(name); if (!job) throw new TypeError('Job is not registered'); return job; };
  function start(name) { const job = lookup(name); if (job.startedAt !== null) throw new Error('Job already running'); job.startedAt = now(); }
  function succeed(name) { const job = lookup(name); job.lastSuccess = now(); job.startedAt = null; job.failed = false; }
  function fail(name) { const job = lookup(name); job.startedAt = null; job.failed = true; }
  function check() {
    if (!jobs.size) return { status: 'not_configured' };
    const current = now();
    const unready = [...jobs.values()].some((job) => job.failed
      || (job.startedAt !== null && current - job.startedAt > job.maxRunMs)
      || (job.lastSuccess === null ? job.startupGraceMs === 0 || current - job.registeredAt > job.startupGraceMs : current - job.lastSuccess > job.maxAgeMs));
    return { status: unready ? 'unready' : 'ready' };
  }
  async function run(name, work) {
    start(name);
    try { const result = await work(); succeed(name); return result; }
    catch (error) { fail(name); throw error; }
  }
  return Object.freeze({ register, start, succeed, fail, check, run });
}

export function createHealthService({ databaseProbe, jobs = null, requireJobs = false } = {}) {
  if (typeof databaseProbe !== 'function') throw new TypeError('A database probe is required');
  return Object.freeze({
    liveness: () => ({ service: 'civicpath-api', status: 'alive' }),
    async readiness() {
      let database = { status: 'unready' };
      try { if ((await databaseProbe())?.status === 'ready') database = { status: 'ready' }; } catch { /* fail closed */ }
      let backgroundJobs = { status: 'not_configured' };
      try { if (jobs) { const status = jobs.check()?.status; backgroundJobs = { status: ['ready', 'unready', 'not_configured'].includes(status) ? status : 'unready' }; } }
      catch { backgroundJobs = { status: 'unready' }; }
      const ready = database.status === 'ready' && backgroundJobs.status !== 'unready' && (!requireJobs || backgroundJobs.status === 'ready');
      return { service: 'civicpath-api', status: ready ? 'ready' : 'unready', checks: { database: database.status, backgroundJobs: backgroundJobs.status } };
    },
  });
}
