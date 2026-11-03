import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createHealthRouter } from '../src/routes/v1/health.js';
import { createHealthService, createJobHeartbeatRegistry } from '../src/services/healthService.js';

test('standalone read-only router: real finite local HTTP contract separates liveness/readiness', async () => {
  let dbReady = false;
  const jobs = createJobHeartbeatRegistry(); jobs.register('retry', { maxAgeMs: 2000000 });
  const service = createHealthService({ databaseProbe: async () => ({ status: dbReady ? 'ready' : 'unready' }), jobs, requireJobs: true });
  const app = express(); app.use('/api/v1/health', createHealthRouter({ service }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/health`;
  try {
    const live = await fetch(`${base}/live`); assert.equal(live.status, 200); assert.equal(live.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await live.json(), { data: { service: 'civicpath-api', status: 'alive' } });
    let ready = await fetch(`${base}/ready`); assert.equal(ready.status, 503);
    dbReady = true;
    ready = await fetch(`${base}/ready`); assert.equal(ready.status, 503); // Restarted job state is not silently green.
    jobs.succeed('retry'); ready = await fetch(`${base}/ready`); assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { data: { service: 'civicpath-api', status: 'ready', checks: { database: 'ready', backgroundJobs: 'ready' } } });
    assert.equal((await fetch(base)).status, 200); assert.equal((await fetch(`${base}/ready`, { method: 'POST' })).status, 404);
    jobs.fail('retry'); assert.equal((await fetch(`${base}/ready`)).status, 503); assert.equal((await fetch(`${base}/live`)).status, 200);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
