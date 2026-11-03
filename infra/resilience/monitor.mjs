#!/usr/bin/env node
import { readFile, writeFile, lstat, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkServices } from './service_checks.mjs';
export function evaluateAlerts(report, previous = {}, { latencyMs = 1500, consecutiveFailures = 3 } = {}) {
  if (!Number.isInteger(latencyMs) || latencyMs < 100 || latencyMs > 10000 || !Number.isInteger(consecutiveFailures) || consecutiveFailures < 1 || consecutiveFailures > 10) throw new Error('Invalid thresholds');
  const state = {}; const alerts = [];
  for (const check of report.checks) {
    const unhealthy = check.status === 'failed' || (check.status !== 'verified');
    const failures = unhealthy ? Math.min(1000, (Number.isSafeInteger(previous[check.name]) ? Math.max(0, previous[check.name]) : 0) + 1) : 0;
    state[check.name] = failures;
    if (unhealthy && failures >= consecutiveFailures) alerts.push({ check: check.name, severity: check.status === 'not_configured' || check.status === 'configured_unverified' ? 'commissioning_blocker' : 'critical', condition: check.status });
    if (check.durationMs > latencyMs) alerts.push({ check: check.name, severity: 'warning', condition: 'latency_threshold' });
  }
  return { state, alerts, status: alerts.length ? 'alert' : report.status === 'verified' ? 'healthy' : 'pending_threshold' };
}
async function privateJson(path, missing = false) {
  try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 65536) throw new Error('Private regular file required'); return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (missing && error.code === 'ENOENT') return {}; throw error; }
}
export async function main(args = process.argv.slice(2)) {
  const options = Object.fromEntries(args.filter((arg) => arg.includes('=')).map((arg) => { const [key, ...rest] = arg.split('='); return [key, rest.join('=')]; }));
  if (!options['--config'] || !options['--state']) throw new Error('Private config and state paths required');
  if (resolve(options['--config']) === resolve(options['--state'])) throw new Error('State cannot overwrite configuration');
  const config = await privateJson(options['--config']); const previous = await privateJson(options['--state'], true);
  const report = await checkServices(config, { allowLocalHttp: args.includes('--allow-local-http'), token: process.env.CIVICPATH_SMOKE_TOKEN });
  const result = evaluateAlerts(report, previous);
  const temporary = `${options['--state']}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(result.state) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, options['--state']);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
  // Caller owns alert transport/schedule. No webhook, email or daemon is enabled here.
  console.log(JSON.stringify({ operation: 'monitor_once', status: result.status, alerts: result.alerts }));
  return result.status === 'alert' ? 2 : report.status === 'verified' ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => { process.exitCode = code; }).catch(() => { console.error(JSON.stringify({ status: 'failed_closed', reason: 'Monitor configuration/state/check failed' })); process.exitCode = 2; });
