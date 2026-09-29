import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { sequelize } from '../src/config/database.js';
import {
  ActionDependency,
  ActionEvidenceLink,
  ActionFundingPosition,
  ActionMilestone,
  CivicProject,
  QuarterlyActionUpdate,
  QuarterlyReportingPeriod,
  StrategyAction,
  StrategyActionProject,
  StrategyAlert,
  StrategyDecision,
  StrategyFocusArea,
  StrategyMeasure,
  StrategyReportSnapshot,
  StrategyRiskIssue,
  StrategyStakeholder,
  StrategyStatusDefinition,
  StrategicPlan,
  User,
} from '../src/models/index.js';
import { env } from '../src/config/env.js';
import { evaluateStrategyAlerts } from '../src/services/strategyAlerts.js';

const baseUrl = process.env.STRATEGY_TEST_BASE_URL || 'http://127.0.0.1:3017/v1';
const suffix = crypto.randomUUID().slice(0, 8);
let organizationId;
let strategyId;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${options.method || 'GET'} ${path} failed (${response.status}): ${body.error || JSON.stringify(body)}`);
  return body.data;
}

async function cleanup() {
  if (!strategyId || !organizationId) return;
  const strategyWhere = { organizationId, strategyId };
  const actionIds = (await StrategyAction.findAll({ where: strategyWhere, attributes: ['id'] })).map((item) => item.id);
  const periodIds = (await QuarterlyReportingPeriod.findAll({ where: strategyWhere, attributes: ['id'] })).map((item) => item.id);
  await Promise.all([
    StrategyAlert.destroy({ where: strategyWhere, force: true }),
    StrategyReportSnapshot.destroy({ where: strategyWhere, force: true }),
    StrategyDecision.destroy({ where: strategyWhere, force: true }),
    StrategyRiskIssue.destroy({ where: strategyWhere, force: true }),
    ActionDependency.destroy({ where: strategyWhere, force: true }),
    StrategyStatusDefinition.destroy({ where: strategyWhere, force: true }),
    ...(periodIds.length ? [QuarterlyActionUpdate.destroy({ where: { organizationId, reportingPeriodId: periodIds }, force: true })] : []),
    ...(actionIds.length ? [
      ActionMilestone.destroy({ where: { organizationId, actionId: actionIds }, force: true }),
      StrategyActionProject.destroy({ where: { organizationId, actionId: actionIds }, force: true }),
      StrategyMeasure.destroy({ where: { organizationId, actionId: actionIds }, force: true }),
      StrategyStakeholder.destroy({ where: { organizationId, actionId: actionIds }, force: true }),
      ActionFundingPosition.destroy({ where: { organizationId, actionId: actionIds }, force: true }),
      ActionEvidenceLink.destroy({ where: { organizationId, actionId: actionIds }, force: true }),
    ] : []),
  ]);
  await QuarterlyReportingPeriod.destroy({ where: strategyWhere, force: true });
  await StrategyAction.destroy({ where: strategyWhere, force: true });
  await StrategyFocusArea.destroy({ where: strategyWhere, force: true });
  await StrategicPlan.destroy({ where: { id: strategyId, organizationId }, force: true });
}

try {
  await sequelize.authenticate();
  const user = await User.findOne({ where: { role: 'org_admin', status: 'active' } });
  assert.ok(user, 'An active council administrator is required for the strategy flow test.');
  organizationId = user.organizationId;
  const token = jwt.sign({ sub: user.id, organizationId, role: user.role }, env.jwtSecret, { expiresIn: '5m' });
  const headers = { authorization: `Bearer ${token}` };
  const project = await CivicProject.findOne({ where: { organizationId }, attributes: ['id'] });
  assert.ok(project, 'A tenant project is required to test action/project links.');

  const strategy = await request('/strategies', { method: 'POST', headers, body: JSON.stringify({ name: `Strategy test ${suffix}`, reference: 'Test only', reportingCadence: 'quarterly', status: 'active' }) });
  strategyId = strategy.id;
  const focus = await request(`/strategies/${strategyId}/focus-areas`, { method: 'POST', headers, body: JSON.stringify({ code: `T-${suffix}`, title: 'Test focus area', sortOrder: 1 }) });
  const actionA = await request(`/strategies/${strategyId}/actions`, { method: 'POST', headers, body: JSON.stringify({ actionCode: 'T1', title: 'Test action one', focusAreaId: focus.id, ownerId: user.id, status: 'attention', nextStep: 'Record delivery evidence', readinessScore: 55, reportingPriority: 'executive' }) });
  const actionB = await request(`/strategies/${strategyId}/actions`, { method: 'POST', headers, body: JSON.stringify({ actionCode: 'T2', title: 'Test action two', focusAreaId: focus.id, ownerId: user.id, status: 'on_track', readinessScore: 75 }) });
  const importPreview = await request(`/strategies/${strategyId}/imports/actions/preview`, { method: 'POST', headers, body: JSON.stringify({ csv: 'action_code,title,focus_area,status,readiness_score\nT3,Imported test action,Test focus area,on_track,65' }) });
  assert.equal(importPreview.rowCount, 1, 'Action import preview should parse one row.');
  const importResult = await request(`/strategies/${strategyId}/imports/actions/commit`, { method: 'POST', headers, body: JSON.stringify({ rows: importPreview.rows }) });
  assert.equal(importResult.created, 1, 'Action import should commit the parsed, validated row.');
  await request(`/strategy-actions/${actionA.id}/projects`, { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, relationshipType: 'primary_delivery' }) });
  await request(`/strategy-actions/${actionA.id}/milestones`, { method: 'POST', headers, body: JSON.stringify({ title: 'Past due test milestone', ownerId: user.id, dueDate: '2025-01-01', status: 'in_progress' }) });
  await request(`/strategies/${strategyId}/dependencies`, { method: 'POST', headers, body: JSON.stringify({ dependentType: 'action', dependentId: actionA.id, predecessorType: 'action', predecessorId: actionB.id, dependencyType: 'decision', severity: 'critical', status: 'open', detail: 'Test critical dependency.' }) });
  await request(`/strategies/${strategyId}/decisions`, { method: 'POST', headers, body: JSON.stringify({ actionId: actionA.id, ownerId: user.id, title: 'Test decision due', decisionStatus: 'required', dueDate: '2025-01-01' }) });
  const period = await request(`/strategies/${strategyId}/reporting-periods`, { method: 'POST', headers, body: JSON.stringify({ label: `Test Q1 ${suffix}`, financialYear: `T-${suffix}`, quarter: 'Q1', startsOn: '2026-07-01', endsOn: '2026-09-30', updateDueOn: '2026-09-30', status: 'open' }) });
  await request(`/strategy-reporting-periods/${period.id}/action-updates`, { method: 'POST', headers, body: JSON.stringify({ actionId: actionA.id, status: 'attention', movement: 'advanced', achievements: 'Test delivery update', evidenceSummary: 'Test evidence', nextQuarterCommitments: 'Test next commitment' }) });
  await request(`/strategy-actions/${actionA.id}/measures`, { method: 'POST', headers, body: JSON.stringify({ name: 'Test measure', unit: '%', currentValue: '55', reportingFrequency: 'quarterly', lastMeasuredAt: '2025-01-01' }) });
  const actionDetail = await request(`/strategy-actions/${actionA.id}`, { headers });
  assert.equal(actionDetail.linkedProjects.length, 1, 'Action should return linked portfolio project.');
  assert.equal(actionDetail.ActionMilestones.length, 1, 'Action should return milestone.');
  const report = await request(`/strategy-reporting-periods/${period.id}/report`, { headers });
  assert.equal(report.summary.totalActions, 3, 'Quarterly report should include created and imported strategy actions.');
  assert.equal(report.summary.updateCoverage, 33, 'Quarterly report should calculate action-update coverage.');
  const snapshot = await request(`/strategy-reporting-periods/${period.id}/report-snapshots`, { method: 'POST', headers, body: JSON.stringify({ status: 'draft' }) });
  assert.equal(snapshot.reportingPeriodId, period.id, 'Report snapshot should retain the reporting period.');
  const alerts = await evaluateStrategyAlerts({ organizationId });
  assert.ok(alerts.created >= 2, 'Strategy alert service should create overdue dependency, milestone or decision alerts.');
  const workspace = await request(`/strategy-workspace?strategyId=${strategyId}`, { headers });
  assert.ok(workspace.alerts.length >= 2, 'Workspace should return generated in-app alerts.');
  console.log('Strategy delivery API flow passed.');
} finally {
  await cleanup();
  await sequelize.close();
}
