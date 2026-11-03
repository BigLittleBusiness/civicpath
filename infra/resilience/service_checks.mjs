#!/usr/bin/env node
import { readFile, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SERVICE_NAMES = Object.freeze(['email', 'storage', 'billing', 'webhook', 'backgroundJobs', 'backup']);
export const HEALTH_KEYS = Object.freeze(['service', 'status', 'checks']);
function target(value, allowLocalHttp) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Unsafe endpoint');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalHttp && url.protocol === 'http:' && loopback)) throw new Error('HTTPS required');
  return url;
}
async function request(url, { fetchImpl, timeoutMs, token, expectedStatus = 200, statusOnly = false }) {
  let timer;
  const controller = new AbortController();
  const deadline = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve({ status: 'failed', reason: 'timeout' }); }, timeoutMs); });
  const work = (async () => {
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (response.status !== expectedStatus) { await response.body?.cancel?.(); return { status: 'failed', reason: 'unexpected_http_status' }; }
      if (statusOnly) { await response.body?.cancel?.(); return { status: 'verified' }; }
      let body = null;
      // Bound response body, not just network headers. Do not return arbitrary endpoint content.
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const chunks = []; let size = 0;
        while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length;
          if (size > 65536) { await reader.cancel(); return { status: 'failed', reason: 'oversize_response' }; } chunks.push(Buffer.from(result.value)); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } else { body = await response.json(); }
      return { status: 'verified', body };
    } catch { return { status: 'failed', reason: 'network_or_contract_error' }; }
  })();
  try { return await Promise.race([work, deadline]); } finally { clearTimeout(timer); }
}

function safeHealth(body, expected) {
  const data = body?.data;
  if (!data || data.service !== 'civicpath-api' || data.status !== expected || Object.keys(body).some((key) => key !== 'data')
    || Object.keys(data).some((key) => !HEALTH_KEYS.includes(key))) return false;
  if (expected === 'alive') return Object.keys(data).length === 2;
  return data.checks && Object.keys(data.checks).length === 2 && data.checks.database === 'ready'
    && ['ready', 'not_configured'].includes(data.checks.backgroundJobs) && Object.keys(data.checks).every((key) => ['database', 'backgroundJobs'].includes(key));
}

export async function checkServices(config, { fetchImpl = fetch, timeoutMs = 3000, allowLocalHttp = false, strict = true, token } = {}) {
  if (!config || typeof config !== 'object' || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) throw new Error('Invalid check configuration');
  const base = target(config.baseUrl, allowLocalHttp); base.pathname = base.pathname.replace(/\/$/, '');
  const results = [];
  for (const [path, expected, name] of [['/api/v1/health/live', 'alive', 'liveness'], ['/api/v1/health/ready', 'ready', 'readiness']]) {
    const started = performance.now(); const result = await request(target(new URL(path, base).toString(), allowLocalHttp), { fetchImpl, timeoutMs });
    const verified = result.status === 'verified' && safeHealth(result.body, expected);
    results.push({ name, status: verified ? 'verified' : 'failed', reason: verified ? 'contract_verified' : result.reason || 'invalid_or_unsafe_health_contract', durationMs: Math.round(performance.now() - started) });
    if (verified && expected === 'ready') results.push({ name: 'jobHeartbeat', status: result.body.data.checks.backgroundJobs === 'ready' ? 'verified' : 'not_configured' });
  }
  const services = config.services || {};
  if (Object.keys(services).some((name) => !SERVICE_NAMES.includes(name))) throw new Error('Unknown configured service');
  for (const name of SERVICE_NAMES) {
    const service = services[name];
    if (!service || service.configured === false) { results.push({ name, status: 'not_configured' }); continue; }
    if (service.configured !== true || !service.evidenceUrl) { results.push({ name, status: 'configured_unverified' }); continue; }
    const endpoint = target(service.evidenceUrl, allowLocalHttp);
    // Never send a bearer token to a different origin.
    const sameOriginToken = endpoint.origin === base.origin ? token : undefined;
    const result = await request(endpoint, { fetchImpl, timeoutMs, token: sameOriginToken });
    const evidence = result.body?.data;
    const current = Date.now(); const verifiedAt = Date.parse(evidence?.verifiedAt);
    const maxAgeMs = service.maxEvidenceAgeMs ?? 86400000;
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 7 * 86400000) throw new Error('Invalid evidence age');
    const verified = result.status === 'verified' && evidence?.service === name && evidence?.status === 'verified'
      && ['staging', 'production'].includes(evidence?.environment) && evidence.environment === config.environment
      && Number.isFinite(verifiedAt) && verifiedAt <= current + 60000 && current - verifiedAt <= maxAgeMs;
    results.push({ name, status: verified ? 'verified' : result.status === 'failed' ? 'failed' : 'configured_unverified', reason: verified ? 'fresh_readonly_evidence' : result.reason || 'missing_stale_or_wrong_environment_evidence' });
  }
  // Optional application smoke contracts: safe GETs only; no state mutation or payments.
  if ((config.smoke || []).length > 20) throw new Error('Too many smoke contracts');
  for (const [index, contract] of (config.smoke || []).entries()) {
    if (typeof contract.path !== 'string' || !contract.path.startsWith('/') || contract.path.startsWith('//') || contract.path.includes('?')) throw new Error('Invalid smoke path');
    const endpoint = new URL(contract.path, base);
    if (endpoint.origin !== base.origin || ![200, 401, 403, 404].includes(contract.expectedStatus)) throw new Error('Invalid smoke contract');
    const missingToken = contract.authenticated && !token;
    const result = missingToken ? { status: 'not_configured' } : await request(endpoint, { fetchImpl, timeoutMs, expectedStatus: contract.expectedStatus, token: contract.authenticated ? token : undefined, statusOnly: true });
    results.push({ name: `smoke_${index + 1}`, status: missingToken ? 'not_configured' : result.status, reason: missingToken ? 'test_identity_not_configured' : result.reason || 'http_contract_verified' });
  }
  return { operation: 'staged_readiness_smoke', status: results.some((r) => r.status === 'failed' || (strict && r.status !== 'verified')) ? 'not_ready' : 'verified', checks: results,
    scope: 'read_only_finite_checks; no service enablement; evidence assertions are not delivery transactions' };
}

export async function main(args = process.argv.slice(2)) {
  const options = Object.fromEntries(args.filter((arg) => arg.includes('=')).map((arg) => { const [key, ...rest] = arg.split('='); return [key, rest.join('=')]; }));
  if (!options['--config']) throw new Error('Private --config=FILE required');
  const info = await lstat(options['--config']);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 65536) throw new Error('Private regular configuration required');
  const config = JSON.parse(await readFile(options['--config'], 'utf8'));
  const result = await checkServices(config, { allowLocalHttp: args.includes('--allow-local-http'), strict: !args.includes('--allow-unconfigured'), timeoutMs: Number(options['--timeout-ms'] || 3000), token: process.env.CIVICPATH_SMOKE_TOKEN });
  console.log(JSON.stringify(result)); return result.status === 'verified' ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch(() => { console.error(JSON.stringify({ status: 'failed_closed', reason: 'Check configuration or endpoint unavailable; details suppressed' })); process.exitCode = 2; });
}
