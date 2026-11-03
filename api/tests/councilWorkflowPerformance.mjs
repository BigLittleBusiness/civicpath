import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { performance } from 'node:perf_hooks';
import { env } from '../src/config/env.js';
import { sequelize } from '../src/config/database.js';
import { Organization, User, Subscription, ProductPlan, CivicProject, Grant, StrategicPlan, StrategyFocusArea, StrategyAction, ActionMilestone, QuarterlyReportingPeriod, QuarterlyActionUpdate } from '../src/models/index.js';

assert.match(env.db.database, /^civicpath_test_[a-f0-9]+$/, 'Performance fixtures may only run in a script-created disposable database.');
const suffix = crypto.randomBytes(6).toString('hex');
const base = process.env.COLLABORATION_TEST_BASE_URL || 'http://127.0.0.1:3017/v1';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):3017\/v1$/, 'Performance traffic is restricted to the isolated local API.');
try {
  const plan = await ProductPlan.create({ code: `perf-${suffix}`, name: 'Performance verification plan', product: 'civicpath', annualPriceAud: 5000, workflowUserLimit: 50, activeProjectLimit: 1000, activeGrantLimit: 1000, features: { strategyDelivery: true }, isActive: true });
  const organization = await Organization.create({ name: 'Isolated performance verification council', slug: `perf-${suffix}`, organisationType: 'council', country: 'AU', status: 'active', isDemo: false });
  const user = await User.create({ organizationId: organization.id, email: `perf-${suffix}@example.com`, firstName: 'Performance', lastName: 'Verification', passwordHash: 'not-a-login-credential', role: 'org_admin', status: 'active' });
  await Subscription.create({ organizationId: organization.id, planId: plan.id, status: 'active', endsAt: new Date(Date.now() + 31_536_000_000), entitlements: { strategyDelivery: true } });
  const projects = await CivicProject.bulkCreate(Array.from({ length: 100 }, (_, index) => ({ organizationId: organization.id, ownerId: user.id, name: `Test project ${index + 1}`, stage: 'scoping', category: 'economic_development', estimatedCost: 50000, isSample: false })));
  await Grant.bulkCreate(Array.from({ length: 100 }, (_, index) => ({ organizationId: organization.id, projectId: projects[index].id, leadId: user.id, title: `Test grant ${index + 1}`, funder: 'Test-only funder', status: 'identified', requestedAmount: 10000, isSample: false })));
  const strategy = await StrategicPlan.create({ organizationId: organization.id, name: 'Test-only strategy', ownerId: user.id, status: 'active' });
  const focus = await StrategyFocusArea.create({ organizationId: organization.id, strategyId: strategy.id, code: 'P', title: 'Test-only focus area' });
  const actions = await StrategyAction.bulkCreate(Array.from({ length: 50 }, (_, index) => ({ organizationId: organization.id, strategyId: strategy.id, focusAreaId: focus.id, ownerId: user.id, actionCode: `P${index + 1}`, title: `Test action ${index + 1}`, status: 'on_track' })));
  await ActionMilestone.bulkCreate(actions.flatMap((action) => Array.from({ length: 3 }, (_, index) => ({ organizationId: organization.id, actionId: action.id, ownerId: user.id, title: `Test milestone ${index + 1}`, status: 'in_progress' }))));
  const period = await QuarterlyReportingPeriod.create({ organizationId: organization.id, strategyId: strategy.id, label: 'Test-only quarter', financialYear: 'PERF', quarter: 'Q1', startsOn: '2026-07-01', endsOn: '2026-09-30', status: 'open' });
  await QuarterlyActionUpdate.bulkCreate(actions.map((action) => ({ organizationId: organization.id, actionId: action.id, reportingPeriodId: period.id, submittedBy: user.id, status: 'on_track', achievements: 'Synthetic performance fixture only', workflowStatus: 'included_in_report', includeInReport: true })));
  const token = jwt.sign({ sub: user.id, organizationId: organization.id, role: user.role, sessionVersion: user.sessionVersion }, env.jwtSecret, { expiresIn: '5m' });
  const paths = ['/dashboard/overview', '/projects', '/grants', `/strategy-workspace?strategyId=${strategy.id}`, `/strategy-reporting-periods/${period.id}/report`, '/collaboration/my-work'];
  const results = [];
  for (const path of paths) {
    const samples = []; let maxBytes = 0;
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      const response = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
      const body = await response.text();
      samples.push(performance.now() - start); maxBytes = Math.max(maxBytes, Buffer.byteLength(body));
      assert.equal(response.status, 200, `${path} failed: ${body.slice(0, 150)}`);
      assert.ok(maxBytes < 2_000_000, `${path} exceeded the verification response-size guard.`);
    }
    samples.sort((a, b) => a - b);
    results.push({ path, requests: samples.length, medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)), p95Ms: Number(samples[Math.ceil(samples.length * 0.95) - 1].toFixed(2)), maxResponseBytes: maxBytes });
  }
  console.log(JSON.stringify({ environment: 'isolated local MySQL 8; not a Binary Lane SLA or production-load certification', fixture: { projects: 100, grants: 100, strategyActions: 50, milestones: 150, quarterlyUpdates: 50 }, results }, null, 2));
  console.log('Representative-volume council workflow verification passed. Entire disposable database is removed by its parent harness.');
} finally { await sequelize.close(); }
