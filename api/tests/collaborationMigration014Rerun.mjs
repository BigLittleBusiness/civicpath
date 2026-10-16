import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { sequelize } from '../src/config/database.js';
import {
  PlatformSetting,
  QuarterlyActionUpdate,
  QuarterlyReportingPeriod,
  StrategyAction,
  StrategyFocusArea,
  StrategicPlan,
  User,
} from '../src/models/index.js';

const suffix = crypto.randomUUID().slice(0, 8);
const markerKey = 'collaboration_014_quarterly_workflow_cutover';
let organizationId;
let strategyId;
let focusId;
let actionId;
let periodId;
let updateId;

async function cleanup() {
  if (updateId) await QuarterlyActionUpdate.destroy({ where: { id: updateId, organizationId }, force: true });
  if (periodId) await QuarterlyReportingPeriod.destroy({ where: { id: periodId, organizationId }, force: true });
  if (actionId) await StrategyAction.destroy({ where: { id: actionId, organizationId }, force: true });
  if (focusId) await StrategyFocusArea.destroy({ where: { id: focusId, organizationId }, force: true });
  if (strategyId) await StrategicPlan.destroy({ where: { id: strategyId, organizationId }, force: true });
}

try {
  await sequelize.authenticate();
  const cutover = await PlatformSetting.findOne({ where: { settingKey: markerKey } });
  assert.ok(cutover?.configuration?.status === 'complete', 'Run db:migrate before this migration-rerun regression test.');

  const admin = await User.findOne({ where: { role: 'org_admin', status: 'active' } });
  assert.ok(admin, 'An active Council administrator is required.');
  organizationId = admin.organizationId;

  const strategy = await StrategicPlan.create({ organizationId, name: `Migration rerun test ${suffix}`, status: 'active' });
  strategyId = strategy.id;
  const focus = await StrategyFocusArea.create({ organizationId, strategyId, code: `M${suffix}`, title: 'Migration rerun test', status: 'active' });
  focusId = focus.id;
  const action = await StrategyAction.create({ organizationId, strategyId, focusAreaId: focus.id, actionCode: `M${suffix}`, title: 'Draft must remain draft', ownerId: admin.id });
  actionId = action.id;
  const period = await QuarterlyReportingPeriod.create({ organizationId, strategyId, label: `Migration ${suffix}`, financialYear: `T-${suffix}`, quarter: 'Q1', startsOn: '2027-07-01', endsOn: '2027-09-30', status: 'open' });
  periodId = period.id;
  const update = await QuarterlyActionUpdate.create({ organizationId, actionId: action.id, reportingPeriodId: period.id, submittedBy: admin.id, status: 'on_track', workflowStatus: 'draft' });
  updateId = update.id;

  const rerun = spawnSync(process.execPath, ['db/migrations/014_collaboration_workspaces.mjs'], { cwd: new URL('..', import.meta.url).pathname, env: process.env, encoding: 'utf8' });
  assert.equal(rerun.status, 0, `Migration 014 rerun failed: ${rerun.stderr || rerun.stdout}`);

  await update.reload();
  assert.equal(update.workflowStatus, 'draft', 'A draft created after the cutover must remain draft on later deployments.');
  assert.equal(update.includedInReportAt, null, 'A later migration rerun must not add a report-inclusion timestamp.');
  console.log('Migration 014 one-time cutover rerun test passed.');
} finally {
  await cleanup();
  await sequelize.close();
}
