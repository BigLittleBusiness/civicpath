import test from 'node:test';
import assert from 'node:assert/strict';
import { checkServices, SERVICE_NAMES } from '../service_checks.mjs';
import { evaluateAlerts } from '../monitor.mjs';
const response = (data, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
function fakeFetch(overrides = {}) { return async (url, options) => {
  const path = new URL(url).pathname;
  if (overrides[path]) return overrides[path](url, options);
  if (path.endsWith('/live')) return response({ service: 'civicpath-api', status: 'alive' });
  if (path.endsWith('/ready')) return response({ service: 'civicpath-api', status: 'ready', checks: { database: 'ready', backgroundJobs: 'ready' } });
  return response({ service: path.slice(1), status: 'verified', environment: 'staging', verifiedAt: new Date().toISOString() });
}; }
const configured = () => ({ baseUrl: 'https://stage.invalid', environment: 'staging', services: Object.fromEntries(SERVICE_NAMES.map((name) => [name, { configured: true, evidenceUrl: `https://stage.invalid/${name}` }])) });

test('finite fake contracts distinguish configured, fresh verified and unconfigured', async () => {
  const ready = await checkServices(configured(), { fetchImpl: fakeFetch() }); assert.equal(ready.status, 'verified');
  const empty = await checkServices({ baseUrl: 'https://stage.invalid' }, { fetchImpl: fakeFetch() });
  assert.equal(empty.status, 'not_ready'); assert.equal(empty.checks.filter((r) => r.status === 'not_configured').length, 6);
  const stale = configured(); stale.services.email.evidenceUrl = 'https://stage.invalid/stale';
  const report = await checkServices(stale, { fetchImpl: fakeFetch({ '/stale': () => response({ service: 'email', status: 'verified', environment: 'staging', verifiedAt: '2020-01-01T00:00:00Z' }) }) });
  assert.equal(report.checks.find((r) => r.name === 'email').status, 'configured_unverified');
});

test('safe health contract rejects topology and static old healthy route', async () => {
  const report = await checkServices(configured(), { fetchImpl: fakeFetch({ '/api/v1/health/ready': () => response({ service: 'civicpath-api', status: 'ready', host: 'secret.internal', checks: { database: 'ready', backgroundJobs: 'ready' } }) }) });
  assert.equal(report.status, 'not_ready'); assert.ok(!JSON.stringify(report).includes('secret.internal'));
});

test('network headers and stalled response body are deadline bounded', async () => {
  const report = await checkServices({ baseUrl: 'https://stage.invalid' }, { timeoutMs: 100, fetchImpl: async () => new Promise(() => {}) });
  assert.equal(report.checks[0].reason, 'timeout');
  const body = await checkServices({ baseUrl: 'https://stage.invalid' }, { timeoutMs: 100, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { status: 200 }) });
  assert.equal(body.checks[0].reason, 'timeout');
});

test('no tokens to third-party service origin; credentials in URL rejected', async () => {
  const config = configured(); config.services.email.evidenceUrl = 'https://other.invalid/email';
  await checkServices(config, { token: 'SECRET', fetchImpl: async (url, options) => { if (new URL(url).origin === 'https://other.invalid') assert.equal(options.headers.Authorization, undefined); return fakeFetch()(url, options); } });
  await assert.rejects(checkServices({ baseUrl: 'https://name:secret@stage.invalid' }));
  await assert.rejects(checkServices({ baseUrl: 'http://stage.invalid' }));
});

test('smoke GET checks auth boundaries but missing authenticated identity never verified', async () => {
  const config = configured(); config.smoke = [{ path: '/restricted', expectedStatus: 401 }, { path: '/member', expectedStatus: 200, authenticated: true }];
  const report = await checkServices(config, { fetchImpl: fakeFetch({ '/restricted': () => response({}, 401), '/member': () => response({}) }) });
  assert.equal(report.checks.find((r) => r.name === 'smoke_1').status, 'verified');
  assert.equal(report.checks.find((r) => r.name === 'smoke_2').status, 'not_configured');
});

test('monitor alerts on third consecutive failure, resets on recovery and warns on latency', () => {
  const report = { status: 'not_ready', checks: [{ name: 'readiness', status: 'failed' }, { name: 'email', status: 'not_configured' }] };
  const first = evaluateAlerts(report); assert.equal(first.alerts.length, 0);
  const second = evaluateAlerts(report, first.state); assert.equal(second.alerts.length, 0);
  const third = evaluateAlerts(report, second.state); assert.equal(third.alerts[0].severity, 'critical'); assert.equal(third.alerts[1].severity, 'commissioning_blocker');
  const recovered = evaluateAlerts({ status: 'verified', checks: [{ name: 'readiness', status: 'verified', durationMs: 1800 }] }, third.state);
  assert.equal(recovered.state.readiness, 0); assert.equal(recovered.alerts[0].condition, 'latency_threshold');
});
