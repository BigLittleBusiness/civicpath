import test from 'node:test';
import assert from 'node:assert/strict';
import { createMysqlReadinessProbe, createJobHeartbeatRegistry, createHealthService } from '../src/services/healthService.js';
import { createHealthController } from '../src/controllers/healthController.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fakeManager(query = (_options, callback) => callback(null, [{ '1': 1 }])) {
  const counts = { acquire: 0, release: 0, destroy: 0 };
  return { counts, connectionManager: {
    async getConnection() { counts.acquire++; return { query }; },
    async releaseConnection() { counts.release++; },
    async destroyConnection() { counts.destroy++; },
  } };
}

test('SELECT 1 is read-only, native driver timeout bounded; cache limits fan-out', async () => {
  const fake = fakeManager((options, callback) => { assert.equal(options.sql, 'SELECT 1'); assert.ok(options.timeout <= 1500); callback(null, []); });
  const probe = createMysqlReadinessProbe({ sequelize: fake });
  const results = await Promise.all(Array.from({ length: 50 }, () => probe()));
  assert.ok(results.every((r) => r.status === 'ready'));
  assert.equal(fake.counts.acquire, 1); assert.equal(fake.counts.release, 1);
  await probe(); assert.equal(fake.counts.acquire, 1);
});

test('hung SELECT has bounded response and destroys only probe connection; no repeated acquisition', async () => {
  const fake = fakeManager(() => {});
  const probe = createMysqlReadinessProbe({ sequelize: fake, timeoutMs: 100, cacheMs: 0 });
  const started = Date.now();
  assert.deepEqual(await probe(), { status: 'unready' });
  assert.ok(Date.now() - started < 1000);
  await sleep(10);
  assert.equal(fake.counts.destroy, 1); assert.equal(fake.counts.release, 0);
  await probe(); assert.equal(fake.counts.acquire, 1);
});

test('late pool acquisition is released without query and stays single-flight', async () => {
  let resolveAcquire; let acquisitions = 0; let released = 0; let queried = false;
  const sequelize = { connectionManager: { getConnection() { acquisitions++; return new Promise((resolve) => { resolveAcquire = resolve; }); }, async releaseConnection() { released++; }, async destroyConnection() {} } };
  const probe = createMysqlReadinessProbe({ sequelize, timeoutMs: 100, cacheMs: 0 });
  assert.equal((await probe()).status, 'unready');
  assert.equal((await probe()).status, 'unready'); assert.equal(acquisitions, 1);
  resolveAcquire({ query() { queried = true; } }); await sleep(10);
  assert.equal(released, 1); assert.equal(queried, false);
});

test('database and controller errors never expose driver credentials or topology', async () => {
  const secret = 'password=DO_NOT_EXPOSE host=internal tenant=23';
  const fake = fakeManager((_options, callback) => callback(new Error(secret)));
  const service = createHealthService({ databaseProbe: createMysqlReadinessProbe({ sequelize: fake }) });
  const data = await service.readiness(); assert.equal(data.status, 'unready'); assert.ok(!JSON.stringify(data).includes(secret));
  const responses = [];
  const res = { set(k, v) { assert.equal(k, 'Cache-Control'); assert.equal(v, 'no-store'); return this; }, status(code) { this.code = code; return this; }, json(body) { responses.push({ code: this.code, body }); return this; } };
  const controller = createHealthController(service);
  controller.live({}, res); await controller.ready({}, res);
  assert.equal(responses[0].code, 200); assert.equal(responses[0].body.data.status, 'alive'); assert.equal(responses[1].code, 503);
  const throwing = createHealthController({ readiness: async () => { throw new Error(secret); } });
  await throwing.ready({}, res); assert.ok(!JSON.stringify(responses).includes(secret));
});

test('jobs are explicitly not configured; required heartbeat wiring fails closed', async () => {
  const registry = createJobHeartbeatRegistry();
  assert.deepEqual(registry.check(), { status: 'not_configured' });
  const required = createHealthService({ databaseProbe: async () => ({ status: 'ready' }), jobs: registry, requireJobs: true });
  assert.equal((await required.readiness()).status, 'unready');
  assert.equal(required.liveness().status, 'alive');
  registry.register('expected_retry', { maxAgeMs: 2000 });
  assert.equal(registry.check().status, 'unready'); // No green grace after a process restart.
  registry.succeed('expected_retry');
  assert.equal(registry.check().status, 'ready');
});

test('heartbeat grace, stale success, failure, long-running and recovery policy', async () => {
  let time = 0; const registry = createJobHeartbeatRegistry({ now: () => time });
  registry.register('retry', { maxAgeMs: 2000, startupGraceMs: 1000, maxRunMs: 1000 });
  assert.equal(registry.check().status, 'ready'); time = 1001; assert.equal(registry.check().status, 'unready');
  await registry.run('retry', async () => 1); assert.equal(registry.check().status, 'ready');
  await assert.rejects(registry.run('retry', async () => { throw new Error('private'); })); assert.equal(registry.check().status, 'unready');
  registry.succeed('retry'); assert.equal(registry.check().status, 'ready');
  registry.start('retry'); assert.throws(() => registry.start('retry')); time += 1001; assert.equal(registry.check().status, 'unready');
  registry.succeed('retry'); time += 2001; assert.equal(registry.check().status, 'unready');
  assert.throws(() => registry.register('retry', { maxAgeMs: 2000 })); assert.throws(() => registry.register('secret/job', { maxAgeMs: 2000 }));
  assert.throws(() => registry.start('missing'));
});
