import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sequelize } from '../src/config/database.js';
import {
  AuditLog,
  CollaborationThread,
  StrategyAction,
  StrategyFocusArea,
  StrategicPlan,
  User,
} from '../src/models/index.js';
import { createActionThread } from '../src/controllers/collaborationController.js';

const suffix = crypto.randomUUID().slice(0, 8);
let organizationId;
let strategyId;
let focusId;
let actionId;

async function cleanup() {
  if (actionId) await StrategyAction.destroy({ where: { id: actionId, organizationId }, force: true });
  if (focusId) await StrategyFocusArea.destroy({ where: { id: focusId, organizationId }, force: true });
  if (strategyId) await StrategicPlan.destroy({ where: { id: strategyId, organizationId }, force: true });
}

try {
  await sequelize.authenticate();
  const admin = await User.findOne({ where: { role: 'org_admin', status: 'active' } });
  assert.ok(admin, 'An active Council administrator is required.');
  organizationId = admin.organizationId;

  const strategy = await StrategicPlan.create({ organizationId, name: `Audit rollback ${suffix}`, status: 'active' });
  strategyId = strategy.id;
  const focus = await StrategyFocusArea.create({ organizationId, strategyId, code: `R${suffix}`, title: 'Audit rollback', status: 'active' });
  focusId = focus.id;
  const action = await StrategyAction.create({ organizationId, strategyId, focusAreaId: focus.id, title: 'Rollback test action', actionCode: `R${suffix}`, ownerId: admin.id });
  actionId = action.id;

  const originalAuditCreate = AuditLog.create;
  AuditLog.create = async () => { throw new Error('forced audit persistence failure'); };
  let forwardedError;
  const req = {
    body: { title: `Rollback ${suffix}`, body: 'This record must roll back when its audit write fails.' },
    params: { actionId },
    tenant: { organizationId },
    auth: { sub: admin.id, role: admin.role },
    ip: '127.0.0.1',
  };
  const res = {
    status: () => res,
    json: (value) => { throw new Error(`Unexpected successful response: ${JSON.stringify(value)}`); },
  };

  try {
    await createActionThread(req, res, (error) => { forwardedError = error; });
  } finally {
    AuditLog.create = originalAuditCreate;
  }

  assert.ok(forwardedError, 'The forced audit failure must be forwarded by the controller.');
  const persisted = await CollaborationThread.count({
    where: { organizationId, resourceType: 'action', resourceId: actionId, title: `Rollback ${suffix}` },
  });
  assert.equal(persisted, 0, 'A collaboration thread persisted despite its transactional audit failure.');
  console.log('Collaboration transactional rollback test passed.');
} finally {
  await cleanup();
  await sequelize.close();
}
