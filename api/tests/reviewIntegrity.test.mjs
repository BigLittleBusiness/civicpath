import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWriter, assertVersion, quarterlyTransition, requestTransition, handoverTransition, assertHandoverRequest, assertOutcome, packTransition, assertOpenPack, lockedMutation, quarterlyMutation, saveQuarterlyNarrative, handleIntegrityError } from '../src/services/reviewIntegrity.js';

const auth = (sub = 'author', role = 'contributor', organizationId = 'org') => ({ sub, role, organizationId });
const base = () => ({ id: 'update', actionId: 'action', reportingPeriodId: 'period', organizationId: 'org', submittedBy: 'author', version: 1, workflowStatus: 'draft', achievements: 'Original' });
const action = { id: 'action', organizationId: 'org', strategyId: 'strategy', ownerId: 'owner', status: 'attention' };
const fail = (fn, status) => assert.throws(fn, (error) => error.status === status);
const transition = (record, workflowStatus, actor = auth(), extra = {}) => quarterlyTransition({ auth: actor, record, action, value: { expectedVersion: record.version, workflowStatus, ...extra } });

test('authentication, role and tenant allowlists fail closed', () => {
  fail(() => assertWriter(null, 'org'), 401);
  for (const role of ['executive', 'platform_admin', 'unknown']) fail(() => assertWriter(auth('user', role), 'org'), 403);
  fail(() => assertWriter(auth('user', 'org_admin', 'other'), 'org'), 403);
  fail(() => assertWriter({ sub: 'user', role: 'org_admin' }, 'org'), 403);
  for (const role of ['org_admin', 'portfolio_manager', 'contributor']) assert.doesNotThrow(() => assertWriter(auth('user', role), 'org'));
});
test('quarterly submit → independent endorse → manager include increments exact version and retains endorser', () => {
  const record = base();
  Object.assign(record, transition(record, 'submitted_for_review', auth(), { reviewRequestedFromUserId: 'reviewer' }));
  assert.equal(record.version, 2);
  Object.assign(record, transition(record, 'endorsed', auth('reviewer'), { reviewComment: 'Evidence verified' }));
  assert.equal(record.reviewedBy, 'reviewer'); assert.equal(record.version, 3);
  Object.assign(record, transition(record, 'included_in_report', auth('manager', 'portfolio_manager')));
  assert.equal(record.workflowStatus, 'included_in_report'); assert.ok(record.includedInReportAt); assert.equal(record.reviewedBy, 'reviewer'); assert.equal(record.version, 4);
  Object.assign(record, transition(record, 'draft'));
  for (const field of ['reviewedBy', 'reviewedAt', 'reviewComment', 'includedInReportAt', 'reviewRequestedFromUserId']) assert.equal(record[field], null);
});
test('step skips, unrelated contributors, self assignment and manager self-endorsement rejected', () => {
  const draft = base();
  fail(() => transition(draft, 'endorsed', auth('manager', 'org_admin')), 409);
  fail(() => transition(draft, 'included_in_report', auth('manager', 'org_admin')), 409);
  fail(() => transition(draft, 'submitted_for_review', auth('other'), { reviewRequestedFromUserId: 'reviewer' }), 403);
  fail(() => transition(draft, 'submitted_for_review', auth(), { reviewRequestedFromUserId: 'author' }), 422);
  const submitted = { ...base(), workflowStatus: 'submitted_for_review', reviewRequestedFromUserId: 'reviewer' };
  fail(() => transition(submitted, 'endorsed', auth('other')), 403);
  fail(() => transition(submitted, 'endorsed', auth('author', 'org_admin')), 403);
  fail(() => transition(submitted, 'changes_requested', auth('reviewer')), 422);
  fail(() => transition(submitted, 'draft', auth('other')), 403);
  fail(() => transition({ ...submitted, workflowStatus: 'endorsed' }, 'included_in_report', auth('reviewer')), 403);
  fail(() => transition(submitted, 'endorsed', auth('reviewer'), { reviewRequestedFromUserId: 'other' }), 422);
});
test('missing, negative, string and stale expected versions are rejected', () => {
  for (const value of [undefined, null, 0, -1, '1', 1.5]) fail(() => assertVersion(base(), value), 422);
  fail(() => assertVersion(base(), 2), 409);
});
test('request responder cannot accept own response; requester accepts submitted response only', () => {
  const record = { requestType: 'evidence', status: 'open', requestedByUserId: 'requester', requestedFromUserId: 'recipient' };
  fail(() => requestTransition(auth('recipient'), record, { status: 'complete' }), 409);
  fail(() => requestTransition(auth('stranger'), record, { status: 'submitted', response: 'Evidence' }), 403);
  Object.assign(record, requestTransition(auth('recipient'), record, { status: 'submitted', response: 'Evidence' }));
  fail(() => requestTransition(auth('recipient'), record, { status: 'complete' }), 403);
  Object.assign(record, requestTransition(auth('requester'), record, { status: 'complete' }));
  assert.equal(record.response, 'Evidence'); assert.ok(record.completedAt);
  fail(() => requestTransition(auth('requester'), record, { status: 'submitted' }), 409);
});
test('handovers transfer only nominated owner; accepted/requested handovers cannot be replaced', () => {
  const record = { ownerId: 'owner', handoverStatus: 'not_requested' };
  fail(() => assertHandoverRequest(auth('stranger'), record), 403);
  assertHandoverRequest(auth('owner'), record);
  Object.assign(record, { handoverStatus: 'requested', handoverRequestedTo: 'recipient' });
  fail(() => assertHandoverRequest(auth('owner'), record), 409);
  fail(() => handoverTransition(auth('stranger'), record, { handoverStatus: 'accepted' }), 403);
  fail(() => handoverTransition(auth('recipient'), record, { handoverStatus: 'revised_date_proposed', response: 'Need time' }), 422);
  Object.assign(record, handoverTransition(auth('recipient'), record, { handoverStatus: 'accepted' }));
  assert.equal(record.ownerId, 'recipient');
  fail(() => handoverTransition(auth('recipient'), record, { handoverStatus: 'declined', response: 'Changed mind' }), 409);
});
test('owned outcomes require paired safe references and follow-up owner/date', () => {
  fail(() => assertOutcome({ outcomeType: 'follow_up' }), 422);
  fail(() => assertOutcome({ outcomeType: 'follow_up', ownerId: 'owner' }), 422);
  fail(() => assertOutcome({ outcomeType: 'note', resourceId: 'id' }), 422);
  fail(() => assertOutcome({ outcomeType: 'note', resourceType: 'action' }), 422);
  assertOutcome({ outcomeType: 'follow_up', ownerId: 'owner', dueDate: '2026-12-01' });
});
test('packs must go draft → ready → completed → archived, no unanswered questions or closed writes', () => {
  let pack = { ownerId: 'owner', status: 'draft' };
  fail(() => packTransition(auth('owner'), pack, 'completed'), 409);
  fail(() => packTransition(auth('other'), pack, 'ready'), 403);
  Object.assign(pack, packTransition(auth('owner'), pack, 'ready'));
  fail(() => packTransition(auth('owner'), pack, 'completed', 1), 409);
  Object.assign(pack, packTransition(auth('owner'), pack, 'completed'));
  fail(() => assertOpenPack(pack), 409);
  Object.assign(pack, packTransition(auth('manager', 'org_admin'), pack, 'archived'));
  fail(() => packTransition(auth('owner'), pack, 'draft'), 409);
});

// A serial managed-transaction fixture provides the same lock visibility and
// rollback contract as the production injected helpers, without a DB/config import.
function fixture(initial = base()) {
  let state = { period: { id: 'period', organizationId: 'org', strategyId: 'strategy', status: 'open' }, action: { ...action, ownerId: 'author' }, update: initial, audits: [] };
  let tail = Promise.resolve(); const calls = [];
  const sequelize = { transaction: (work) => {
    const result = tail.then(async () => {
      const transaction = { LOCK: { UPDATE: 'UPDATE' }, data: structuredClone(state) };
      const value = await work(transaction); state = transaction.data; return value;
    });
    tail = result.catch(() => {}); return result;
  } };
  const model = (key) => ({ findOne: async (options) => {
    assert.ok(options.transaction); assert.equal(options.lock, 'UPDATE'); calls.push(key);
    const data = options.transaction.data[key];
    if (!data || Object.entries(options.where).some(([field, value]) => data[field] !== value)) return null;
    return { ...data, update: async function (patch, { transaction }) { Object.assign(transaction.data[key], patch); Object.assign(this, patch); } };
  } });
  const Period = model('period'); const Action = model('action'); const Update = model('update');
  Update.create = async (value, { transaction }) => { transaction.data.update = { ...value, id: 'update' }; return transaction.data.update; };
  const mutate = (callback, organizationId = 'org') => quarterlyMutation({ sequelize, Period, Action, Update, organizationId, actionId: 'action', periodId: 'period', mutate: callback });
  return { mutate, sequelize, Update, calls, state: () => structuredClone(state), setPeriod: (status) => { state.period.status = status; } };
}
const narrative = (expectedVersion) => ({ expectedVersion, actionId: 'action', status: 'on_track', achievements: 'Edited after inclusion', riskSummary: 'New evidence', movement: 'advanced' });
const save = (f, value, audit = async (record, transaction) => transaction.data.audits.push(record.id)) => f.mutate((context) => saveQuarterlyNarrative({ ...context, Update: f.Update, auth: auth(), value, organizationId: 'org', audit }));

test('editing included update resets all approval fields atomically and increments version', async () => {
  const f = fixture({ ...base(), workflowStatus: 'included_in_report', reviewedBy: 'reviewer', reviewedAt: 'yesterday', includedInReportAt: 'yesterday', reviewComment: 'Approved', reviewRequestedFromUserId: 'reviewer' });
  await save(f, narrative(1));
  const result = f.state(); assert.equal(result.update.workflowStatus, 'draft'); assert.equal(result.update.version, 2);
  for (const field of ['reviewedBy', 'reviewedAt', 'includedInReportAt', 'reviewComment', 'reviewRequestedFromUserId']) assert.equal(result.update[field], null);
  assert.equal(result.action.status, 'on_track'); assert.equal(result.audits.length, 1); assert.deepEqual(f.calls, ['period', 'action', 'update']);
});
test('audit failure rolls back existing narrative, approval reset and action changes', async () => {
  const f = fixture({ ...base(), workflowStatus: 'included_in_report', includedInReportAt: 'yesterday' }); const before = f.state();
  await assert.rejects(save(f, narrative(1), async () => { throw new Error('forced audit failure'); }), /forced audit/);
  assert.deepEqual(f.state(), before);
});
test('audit failure on first create rolls back primary new update and dependent action write', async () => {
  const f = fixture(null); const before = f.state();
  await assert.rejects(save(f, narrative(0), async () => { throw new Error('forced audit failure'); }), /forced audit/);
  assert.deepEqual(f.state(), before); assert.equal(f.state().update, null);
});
test('two competing narrative writes: exactly one succeeds and stale write receives 409', async () => {
  const f = fixture();
  const results = await Promise.allSettled([save(f, narrative(1)), save(f, { ...narrative(1), achievements: 'Competing text' })]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(f.state().update.version, 2); assert.equal(f.state().update.achievements, 'Edited after inclusion'); assert.equal(f.state().audits.length, 1);
});
test('two first creates with expectedVersion zero cannot overwrite each other', async () => {
  const f = fixture(null); const results = await Promise.allSettled([save(f, narrative(0)), save(f, narrative(0))]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(f.state().update.version, 1);
});
test('competing endorsement and narrative edit cannot approve the new text', async () => {
  const f = fixture({ ...base(), workflowStatus: 'submitted_for_review', reviewRequestedFromUserId: 'reviewer' });
  const endorse = f.mutate(async ({ record, action, transaction }) => { await record.update(quarterlyTransition({ auth: auth('reviewer'), record, action, value: { workflowStatus: 'endorsed', expectedVersion: 1 } }), { transaction }); });
  const results = await Promise.allSettled([endorse, save(f, narrative(1))]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(f.state().update.achievements, 'Original'); assert.equal(f.state().update.workflowStatus, 'endorsed');
});
test('locked periods and cross-tenant records are rejected before update lookups', async () => {
  const f = fixture(); f.setPeriod('locked'); await assert.rejects(save(f, narrative(1)), (error) => error.status === 409);
  const other = fixture(); await assert.rejects(other.mutate(() => {}, 'other'), (error) => error.status === 404); assert.deepEqual(other.calls, ['period']);
});
test('locked mutation rollback and safe error mapping', async () => {
  const f = fixture();
  await assert.rejects(lockedMutation({ sequelize: f.sequelize, Model: f.Update, where: { id: 'update', organizationId: 'org' }, mutate: async (record, transaction) => { await record.update({ achievements: 'bad' }, { transaction }); throw new Error('audit'); } }), /audit/);
  assert.equal(f.state().update.achievements, 'Original');
  let status; let body; const res = { status: (value) => { status = value; return res; }, json: (value) => { body = value; } };
  handleIntegrityError({ name: 'SequelizeUniqueConstraintError' }, res, () => assert.fail()); assert.equal(status, 409); assert.ok(body.error);
});
