// Run only against an isolated, disposable test DB/API with parent-provided DB env.
// This script never starts a DB or API daemon. All fixtures use a unique suffix.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import {
  ActionDependency, AuditLog, CollaborationActivity, CollaborationComment, CollaborationNotification, CollaborationParticipant, CollaborationRequest, CollaborationThread, DecisionPack, EngagementPlan, FundingCollaborationRoom, FundingRoomCheckpoint, PartnerCommitment, QuarterlyActionUpdate, QuarterlyReportingPeriod, ReviewPack, ReviewPackItem, ReviewPackOutcome, ReviewPackQuestion, StrategyAction, StrategyFocusArea, StrategyReportSnapshot, StrategyStatusDefinition, StrategicPlan, User, UserWatch,
} from '../src/models/index.js';

const baseUrl = process.env.COLLABORATION_TEST_BASE_URL || 'http://127.0.0.1:3017/v1';
if (process.env.COLLABORATION_TEST_ALLOW_WRITE !== 'isolated-test-only') throw new Error('Set COLLABORATION_TEST_ALLOW_WRITE=isolated-test-only only with an isolated disposable database/API.');
const suffix = crypto.randomUUID().slice(0, 8);
let organizationId; let strategyId; const users = [];
const made = { actionIds: [], dependencyIds: [], periodIds: [], updateIds: [], roomIds: [], packIds: [], decisionPackIds: [], threadIds: [], requestIds: [], commitmentIds: [], engagementIds: [], snapshotIds: [] };
const tokenFor = (user) => jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role, sessionVersion: user.sessionVersion || 0 }, env.jwtSecret, { expiresIn: '10m' });
const headersFor = (user) => ({ authorization: `Bearer ${tokenFor(user)}` });
async function result(path, actor, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/json', ...(actor || {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function request(path, actor, method = 'GET', body) {
  const response = await result(path, actor, method, body);
  assert.ok(response.status >= 200 && response.status < 300, `${method} ${path}: ${response.status} ${response.body.error || 'Failed'}`);
  return response.body.data;
}
async function expectStatus(status, path, actor, method, body) {
  assert.equal((await result(path, actor, method, body)).status, status, `${method} ${path} should reject with ${status}`);
}
async function cleanup() {
  if (!organizationId || !strategyId) return;
  const actionIds = made.actionIds;
  const pairs = [['action', actionIds], ['dependency', made.dependencyIds], ['funding_room', made.roomIds], ['review_pack', made.packIds], ['decision', made.decisionPackIds], ['quarterly_update', made.updateIds]];
  if (made.threadIds.length) {
    await CollaborationComment.destroy({ where: { organizationId, threadId: made.threadIds }, force: true });
    await CollaborationThread.destroy({ where: { organizationId, id: made.threadIds }, force: true });
  }
  if (made.requestIds.length) await CollaborationRequest.destroy({ where: { organizationId, id: made.requestIds }, force: true });
  for (const [resourceType, resourceIds] of pairs) if (resourceIds.length) {
    for (const Model of [CollaborationParticipant, CollaborationActivity, CollaborationNotification, UserWatch]) await Model.destroy({ where: { organizationId, resourceType, resourceId: resourceIds }, force: true });
  }
  if (made.packIds.length) {
    for (const Model of [ReviewPackItem, ReviewPackQuestion, ReviewPackOutcome]) await Model.destroy({ where: { organizationId, reviewPackId: made.packIds }, force: true });
    await ReviewPack.destroy({ where: { organizationId, id: made.packIds }, force: true });
  }
  if (made.decisionPackIds.length) await DecisionPack.destroy({ where: { organizationId, id: made.decisionPackIds }, force: true });
  if (made.roomIds.length) {
    await FundingRoomCheckpoint.destroy({ where: { organizationId, fundingRoomId: made.roomIds }, force: true });
    await FundingCollaborationRoom.destroy({ where: { organizationId, id: made.roomIds }, force: true });
  }
  if (made.commitmentIds.length) await PartnerCommitment.destroy({ where: { organizationId, id: made.commitmentIds }, force: true });
  if (made.engagementIds.length) await EngagementPlan.destroy({ where: { organizationId, id: made.engagementIds }, force: true });
  await StrategyReportSnapshot.destroy({ where: { organizationId, strategyId }, force: true });
  await QuarterlyActionUpdate.destroy({ where: { organizationId, reportingPeriodId: made.periodIds }, force: true });
  if (made.dependencyIds.length) await ActionDependency.destroy({ where: { organizationId, id: made.dependencyIds }, force: true });
  await StrategyStatusDefinition.destroy({ where: { organizationId, strategyId }, force: true });
  if (actionIds.length) await StrategyAction.destroy({ where: { organizationId, id: actionIds }, force: true });
  await StrategyFocusArea.destroy({ where: { organizationId, strategyId }, force: true });
  await QuarterlyReportingPeriod.destroy({ where: { organizationId, strategyId }, force: true });
  await StrategicPlan.destroy({ where: { organizationId, id: strategyId }, force: true });
  // Do not delete audit history; immutable audit evidence remains ID-scoped test history.
  if (users.length) await User.destroy({ where: { organizationId, id: users }, force: true });
}
try {
  await sequelize.authenticate();
  const admin = await User.findOne({ where: { role: 'org_admin', status: 'active' } });
  assert.ok(admin, 'An active Council administrator in the isolated fixture is required.'); organizationId = admin.organizationId;
  const createUser = async (role) => {
    const user = await User.create({ organizationId, email: `collaboration-${role}-${suffix}@example.invalid`, firstName: 'Test', lastName: role, passwordHash: 'test-only-not-a-login', role, status: 'active' }); users.push(user.id); return user;
  };
  const peer = await createUser('portfolio_manager'); const reviewer = await createUser('contributor'); const executive = await createUser('executive'); const stranger = await createUser('contributor');
  const headers = headersFor(admin); const peerHeaders = headersFor(peer); const reviewerHeaders = headersFor(reviewer); const executiveHeaders = headersFor(executive); const strangerHeaders = headersFor(stranger);
  const strategy = await request('/strategies', headers, 'POST', { name: `Collaboration test ${suffix}`, status: 'active' }); strategyId = strategy.id;
  const focus = await request(`/strategies/${strategyId}/focus-areas`, headers, 'POST', { code: 'C', title: 'Collaboration test' });
  const actionA = await request(`/strategies/${strategyId}/actions`, headers, 'POST', { title: 'Collaboration action', actionCode: 'C1', focusAreaId: focus.id, ownerId: admin.id }); made.actionIds.push(actionA.id);
  const actionB = await request(`/strategies/${strategyId}/actions`, headers, 'POST', { title: 'Collaboration predecessor', actionCode: 'C2', focusAreaId: focus.id, ownerId: peer.id }); made.actionIds.push(actionB.id);
  await request(`/strategy-actions/${actionA.id}/participants`, headers, 'POST', { userId: reviewer.id, role: 'reviewer' });
  const thread = await request(`/strategy-actions/${actionA.id}/threads`, headers, 'POST', { title: 'Evidence context', body: 'Confirm evidence.', mentionUserIds: [peer.id] }); made.threadIds.push(thread.id);
  await request(`/collaboration/threads/${thread.id}/comments`, peerHeaders, 'POST', { body: 'Evidence ready.' });
  const contribution = await request(`/strategy-actions/${actionA.id}/requests`, headers, 'POST', { requestType: 'evidence', requestedFromUserId: reviewer.id, title: 'Provide evidence' }); made.requestIds.push(contribution.id);
  const requestPath = `/collaboration/requests/${contribution.id}`;
  await expectStatus(409, requestPath, reviewerHeaders, 'PATCH', { status: 'complete' });
  await expectStatus(403, requestPath, executiveHeaders, 'PATCH', { status: 'submitted', response: 'Must reject' });
  await request(requestPath, reviewerHeaders, 'PATCH', { status: 'submitted', response: 'Evidence attached internally.' });
  await expectStatus(403, requestPath, reviewerHeaders, 'PATCH', { status: 'complete' });
  const accepted = await request(requestPath, headers, 'PATCH', { status: 'complete' }); assert.equal(accepted.response, 'Evidence attached internally.');
  const dependency = await request(`/strategies/${strategyId}/dependencies`, headers, 'POST', { dependentType: 'action', dependentId: actionA.id, predecessorType: 'action', predecessorId: actionB.id, dependencyType: 'evidence', severity: 'material', ownerId: admin.id }); made.dependencyIds.push(dependency.id);
  const handoverPath = `/strategy-dependencies/${dependency.id}/handover`;
  await request(handoverPath, headers, 'POST', { requestedToUserId: peer.id, detail: 'Lead evidence dependency.' });
  await expectStatus(403, handoverPath, strangerHeaders, 'PATCH', { handoverStatus: 'accepted' });
  await expectStatus(403, handoverPath, executiveHeaders, 'PATCH', { handoverStatus: 'accepted' });
  const handover = await request(handoverPath, peerHeaders, 'PATCH', { handoverStatus: 'accepted', response: 'Accepted.' }); assert.equal(handover.ownerId, peer.id);
  await expectStatus(409, handoverPath, peerHeaders, 'PATCH', { handoverStatus: 'declined', response: 'Too late.' });
  const period = await request(`/strategies/${strategyId}/reporting-periods`, headers, 'POST', { label: `C ${suffix}`, financialYear: `T-${suffix}`, quarter: 'Q1', startsOn: '2026-07-01', endsOn: '2026-09-30', status: 'open' }); made.periodIds.push(period.id);
  const narrativePath = `/strategy-reporting-periods/${period.id}/action-updates`;
  const narrative = { actionId: actionA.id, status: 'on_track', achievements: 'Test progress.' };
  await expectStatus(422, narrativePath, headers, 'POST', narrative);
  let update = await request(narrativePath, headers, 'POST', { ...narrative, expectedVersion: 0 }); made.updateIds.push(update.id);
  const workflowPath = `/quarterly-action-updates/${update.id}/workflow`;
  const move = async (workflowStatus, actor = headers, extra = {}) => { update = await request(workflowPath, actor, 'PATCH', { workflowStatus, expectedVersion: update.version, ...extra }); return update; };
  await expectStatus(401, workflowPath, {}, 'PATCH', { workflowStatus: 'endorsed', expectedVersion: update.version });
  await expectStatus(422, workflowPath, headers, 'PATCH', { workflowStatus: 'submitted_for_review', reviewRequestedFromUserId: reviewer.id });
  await expectStatus(409, workflowPath, headers, 'PATCH', { workflowStatus: 'included_in_report', expectedVersion: update.version });
  await expectStatus(409, workflowPath, headers, 'PATCH', { workflowStatus: 'endorsed', expectedVersion: update.version });
  await expectStatus(422, workflowPath, headers, 'PATCH', { workflowStatus: 'submitted_for_review', reviewRequestedFromUserId: admin.id, expectedVersion: update.version });
  await expectStatus(422, workflowPath, headers, 'PATCH', { workflowStatus: 'submitted_for_review', reviewRequestedFromUserId: executive.id, expectedVersion: update.version });
  await move('submitted_for_review', headers, { reviewRequestedFromUserId: reviewer.id });
  await expectStatus(403, workflowPath, strangerHeaders, 'PATCH', { workflowStatus: 'endorsed', expectedVersion: update.version });
  await expectStatus(403, workflowPath, headers, 'PATCH', { workflowStatus: 'endorsed', expectedVersion: update.version }); // manager author cannot self-endorse
  await expectStatus(403, workflowPath, executiveHeaders, 'PATCH', { workflowStatus: 'endorsed', expectedVersion: update.version });
  await move('changes_requested', reviewerHeaders, { reviewComment: 'Clarify source evidence.' });
  await move('submitted_for_review', headers, { reviewRequestedFromUserId: reviewer.id });
  await move('endorsed', reviewerHeaders, { reviewComment: 'Reviewed.' });
  await expectStatus(403, workflowPath, reviewerHeaders, 'PATCH', { workflowStatus: 'included_in_report', expectedVersion: update.version });
  await move('included_in_report'); assert.equal(update.reviewedBy, reviewer.id);
  const snapshot = await request(`/strategy-reporting-periods/${period.id}/report-snapshots`, headers, 'POST', { status: 'draft' }); made.snapshotIds.push(snapshot.id);
  const originalSnapshot = JSON.stringify(snapshot.content);
  const includedVersion = update.version;
  update = await request(narrativePath, headers, 'POST', { ...narrative, achievements: 'Changed after inclusion.', expectedVersion: includedVersion });
  assert.equal(update.workflowStatus, 'draft'); assert.equal(update.version, includedVersion + 1);
  for (const field of ['reviewedBy', 'reviewedAt', 'reviewComment', 'includedInReportAt', 'reviewRequestedFromUserId']) assert.equal(update[field], null);
  await expectStatus(409, narrativePath, headers, 'POST', { ...narrative, expectedVersion: includedVersion });
  assert.equal(JSON.stringify((await StrategyReportSnapshot.findByPk(snapshot.id)).content), originalSnapshot, 'Immutable report content must remain unchanged.');
  const competingVersion = update.version;
  const competing = await Promise.all([result(narrativePath, headers, 'POST', { ...narrative, achievements: 'Competing A', expectedVersion: competingVersion }), result(narrativePath, headers, 'POST', { ...narrative, achievements: 'Competing B', expectedVersion: competingVersion })]);
  assert.deepEqual(competing.map((item) => item.status).sort(), [200, 409]);
  const persisted = await QuarterlyActionUpdate.findByPk(update.id); assert.equal(persisted.version, competingVersion + 1);
  assert.equal(persisted.achievements, competing.find((item) => item.status === 200).body.data.achievements);
  const anotherTenantUser = await User.findOne({ where: { organizationId: { [Op.ne]: organizationId }, status: 'active', role: ['org_admin', 'portfolio_manager', 'contributor'] } });
  assert.ok(anotherTenantUser, 'Isolated fixture must provide a second active tenant for negative tests.');
  await expectStatus(404, workflowPath, headersFor(anotherTenantUser), 'PATCH', { workflowStatus: 'submitted_for_review', expectedVersion: persisted.version, reviewRequestedFromUserId: reviewer.id });
  await expectStatus(422, narrativePath, headers, 'POST', { ...narrative, actionId: crypto.randomUUID(), expectedVersion: 0 });
  const pack = await request('/review-packs', headers, 'POST', { strategyId, reportingPeriodId: period.id, template: 'quarterly_executive', title: 'Test internal review', items: [{ resourceType: 'action', resourceId: actionA.id }] }); made.packIds.push(pack.id);
  const packStatusPath = `/review-packs/${pack.id}/status`;
  await expectStatus(403, `/review-packs/${pack.id}/questions`, executiveHeaders, 'POST', { question: 'Reject executive write.' });
  await expectStatus(409, packStatusPath, headers, 'PATCH', { status: 'completed' });
  const question = await request(`/review-packs/${pack.id}/questions`, reviewerHeaders, 'POST', { question: 'What must be decided?' });
  await request(packStatusPath, headers, 'PATCH', { status: 'ready' });
  await expectStatus(409, packStatusPath, headers, 'PATCH', { status: 'completed' });
  const answerPath = `/review-packs/${pack.id}/questions/${question.id}`;
  await expectStatus(403, answerPath, strangerHeaders, 'PATCH', { response: 'Not authorised' });
  await request(answerPath, headers, 'PATCH', { response: 'Proceed with the recorded evidence plan.' });
  await expectStatus(409, answerPath, headers, 'PATCH', { response: 'Cannot replace an answer.' });
  await expectStatus(422, `/review-packs/${pack.id}/outcomes`, headers, 'POST', { outcomeType: 'follow_up', outcome: 'Missing owner/date' });
  await expectStatus(422, `/review-packs/${pack.id}/outcomes`, headers, 'POST', { outcomeType: 'note', outcome: 'Missing paired reference', resourceType: 'action' });
  await request(`/review-packs/${pack.id}/outcomes`, headers, 'POST', { outcomeType: 'follow_up', outcome: 'Peer to complete evidence', ownerId: peer.id, dueDate: '2027-01-01', resourceType: 'action', resourceId: actionA.id });
  const detailedPack = await request(`/review-packs/${pack.id}`, executiveHeaders);
  assert.equal(detailedPack.internalOnly, true); assert.equal(detailedPack.sourceMode, 'live_preview'); assert.equal(detailedPack.ReviewPackOutcomes[0].sourcePreview.id, actionA.id);
  await request(packStatusPath, headers, 'PATCH', { status: 'completed' });
  await expectStatus(409, `/review-packs/${pack.id}/questions`, reviewerHeaders, 'POST', { question: 'Closed write' });
  await request(packStatusPath, headers, 'PATCH', { status: 'archived' });
  await expectStatus(409, packStatusPath, headers, 'PATCH', { status: 'ready' });
  const auditCount = await AuditLog.count({ where: { organizationId, entityType: 'quarterly_action_update', entityId: update.id } }); assert.ok(auditCount >= 8);
  console.log('Collaboration API flow passed: versions, independent approval, state guards, concurrent stale 409, immutable snapshots and pack outcomes/closure.');
} finally { await cleanup(); await sequelize.close(); }
