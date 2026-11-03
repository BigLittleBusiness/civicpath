import test from 'node:test';
import assert from 'node:assert/strict';
import { addCreatedProject, assessmentDimensions, canManageProjects, dashboardData, initialDataState, isDemoWorkspace, latestAssessment, loadSetupEvidence, numberOrNull, readinessPayload, requireRows, rowsForWorkspace, saveReadiness, setupItems, toProject, workspaceKey } from './trustData.mjs';

const tenant = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const otherTenant = '00000000-0000-4000-8000-000000000003';
const admin = { id: 'admin', organizationId: tenant, role: 'org_admin', organisationIsDemo: false };
const project = { id, organizationId: tenant, name: 'First real project', stage: 'concept', estimatedCost: 0, targetFunding: 0, securedFunding: 0, expectedJobs: 0 };
const overview = { summary: { strategyCount: 0, livePortfolioValue: 9999999, fundingReadyCount: 2, averageReadiness: 68 }, projects: [], stageMix: [], pathways: [], workItems: [] };
const form = { scopeScore: 0, costScore: 1, approvalsScore: 2, partnerScore: 3, fundingScore: 4, deliveryScore: 5, assessmentNote: 'Sources and gaps recorded here.' };
const profileData = { profile: { id: tenant, workspaceOwnerId: 'owner', operatingContactName: 'Council contact', operatingContactRole: 'Portfolio manager', operatingContactEmail: 'contact@example.test' }, eligibleOwners: [{ id: 'owner', role: 'portfolio_manager' }] };
const envelope = (data) => ({ data: { data } });
const evidence = (members = []) => ({ profile: profileData, profileStatus: 'success', members, membersStatus: 'success' });

test('demo labels require exactly the authenticated boolean flag', () => {
  for (const user of [null, {}, { organisationIsDemo: 'true' }, { role: 'org_admin' }, { type: 'demo' }, { organisationName: 'Demo Council' }]) assert.equal(isDemoWorkspace(user), false);
  assert.equal(isDemoWorkspace({ organisationIsDemo: true }), true);
});
test('session key changes across tenant, role, user and demo/live transitions', () => {
  assert.equal(workspaceKey(null), null);
  for (const changed of [{ ...admin, organizationId: otherTenant }, { ...admin, role: 'executive' }, { ...admin, id: 'another' }, { ...admin, organisationIsDemo: true }]) assert.notEqual(workspaceKey(changed), workspaceKey(admin));
});
test('loading, error and success-empty states contain no fallback records', () => {
  const key = workspaceKey(admin);
  assert.deepEqual(rowsForWorkspace(initialDataState(key), key), []);
  assert.deepEqual(rowsForWorkspace({ key, status: 'error', rows: [{ id: 'sample' }] }, key), []);
  assert.deepEqual(rowsForWorkspace({ key, status: 'success', rows: [] }, key), []);
});
test('first real project cannot retain sample or stale rows', () => {
  const key = workspaceKey(admin); const created = toProject(project);
  const old = { key, status: 'sample', rows: [{ id: 'sample' }] };
  assert.deepEqual(addCreatedProject(old, key, created).rows, [created]);
  assert.deepEqual(addCreatedProject({ key: 'other', status: 'success', rows: [{ id: 'sample' }] }, key, created).rows, [created]);
});
test('created projects retain only current successful live rows and deduplicate IDs', () => {
  const key = workspaceKey(admin); const old = { key, status: 'success', rows: [{ id }, { id: 'second' }] };
  assert.deepEqual(addCreatedProject(old, key, project).rows.map((row) => row.id), [id, 'second']);
  assert.deepEqual(rowsForWorkspace(old, 'other'), []);
});
test('invalid API list response fails closed instead of producing sample rows', () => {
  for (const value of [null, undefined, {}, { data: [] }, [null], [{}]]) assert.throws(() => requireRows(value));
  assert.deepEqual(requireRows([]), []);
});
test('numeric zero is genuine and null, blank, invalid and negative are unavailable', () => {
  assert.equal(numberOrNull(0), 0); assert.equal(numberOrNull('0'), 0);
  for (const value of [null, undefined, '', true, false, 'broken', -1, Infinity]) assert.equal(numberOrNull(value), null);
});
test('unassessed projects are not zero-score or fabricated high-risk projects', () => {
  assert.equal(toProject(project).readiness, null); assert.equal(toProject(project).risk, 'Unassessed');
  assert.equal(toProject(project).jobs, 0); assert.equal(toProject(project).cost, 0);
  assert.equal(toProject({ ...project, estimatedCost: null }).cost, null);
});
test('genuine zero assessments are retained', () => {
  const assessed = toProject({ ...project, ReadinessAssessments: [{ projectId: id, organizationId: tenant, score: 0, scopeScore: 0 }] });
  assert.equal(assessed.readiness, 0); assert.equal(assessed.risk, 'High');
  assert.equal(assessmentDimensions(assessed.assessment)[0].percent, 0);
});
test('latest genuine assessment is chosen without mutating source order', () => {
  const older = { projectId: id, organizationId: tenant, assessedAt: '2026-01-01', score: 20 };
  const newer = { projectId: id, organizationId: tenant, assessedAt: '2026-02-01', score: 80 };
  const source = { ...project, ReadinessAssessments: [older, newer] };
  assert.equal(latestAssessment(source), newer); assert.equal(source.ReadinessAssessments[0], older);
});
test('cross-tenant and cross-project assessments are ignored', () => {
  assert.equal(latestAssessment({ ...project, ReadinessAssessments: [{ projectId: id, organizationId: otherTenant, score: 90 }, { projectId: 'another', organizationId: tenant, score: 90 }] }), null);
});
test('dimension bars use actual 0–5 scores; total offsets are not used', () => {
  const dimensions = assessmentDimensions({ score: 90, scopeScore: 1, costScore: 0, approvalsScore: 5, partnerScore: 8, fundingScore: -1 });
  assert.deepEqual(dimensions.map((item) => item.percent), [20, 0, 100, null, null, null]);
  assert.deepEqual(assessmentDimensions(null).map((item) => item.percent), Array(6).fill(null));
});
test('dashboard empty collections retain all zero counts and no synthetic funding chart', () => {
  const data = dashboardData(overview, []);
  assert.equal(data.projects.length, 0); assert.equal(data.summary.livePortfolioValue, 0); assert.equal(data.summary.fundingTarget, 0); assert.equal(data.summary.securedFunding, 0); assert.equal(data.summary.fundingReadyCount, 0); assert.equal(data.summary.expectedJobs, 0); assert.equal(data.summary.strategyCount, 0);
  assert.equal(data.summary.averageReadiness, null);
  for (const key of ['stages', 'fundingSeries', 'actions']) assert.deepEqual(data[key], []);
  assert.equal(data.readiness.reduce((sum, row) => sum + row.value, 0), 0);
});
test('dashboard aggregates the full register rather than capped overview or sample summaries', () => {
  const rows = Array.from({ length: 10 }, (_, n) => ({ ...project, id: `project-${n}`, estimatedCost: 100, stage: n === 0 ? 'funding_ready' : 'concept' }));
  const data = dashboardData(overview, rows);
  assert.equal(data.projects.length, 10); assert.equal(data.summary.livePortfolioValue, 1000); assert.equal(data.summary.fundingReadyCount, 1); assert.equal(data.readiness.find((row) => row.name === 'Unassessed').value, 10);
});
test('dashboard averages only actual latest assessments, including a genuine zero', () => {
  const data = dashboardData(overview, [project, { ...project, id: 'p2', ReadinessAssessments: [{ score: 0 }] }, { ...project, id: 'p3', ReadinessAssessments: [{ score: 100 }] }]);
  assert.equal(data.assessedCount, 2); assert.equal(data.summary.averageReadiness, 50);
  assert.equal(data.readiness.find((row) => row.name === 'Unassessed').value, 1);
});
test('funding snapshot preserves a zero pathway, skips unknown amounts and is not temporal', () => {
  const data = dashboardData({ ...overview, pathways: [{ id: 'a', sourceName: 'Source A', potentialAmount: 0 }, { id: 'b', sourceName: 'Source B', potentialAmount: 2000000 }, { id: 'c', sourceName: 'Unknown', potentialAmount: null }] }, [project]);
  assert.deepEqual(data.fundingSeries.map((row) => row.value), [0, 2]); assert.equal(data.fundingSeries[0].name, 'Source A'); assert.equal('month' in data.fundingSeries[0], false);
});
test('dashboard fails closed on malformed overview data', () => {
  for (const payload of [null, {}, { summary: {} }, { ...overview, pathways: null }, { ...overview, workItems: null }]) assert.throws(() => dashboardData(payload, []));
});
test('project mutation capabilities exclude executives, contributors and platform accounts', () => {
  for (const role of ['executive', 'contributor', 'platform_admin', '', undefined]) assert.equal(canManageProjects(role), false);
  for (const role of ['org_admin', 'portfolio_manager']) assert.equal(canManageProjects(role), true);
});
test('assessment validates all six dimensions and evidence note; strips extra properties', () => {
  assert.equal(readinessPayload({ ...form, admin: true }).scopeScore, 0); assert.equal('admin' in readinessPayload({ ...form, admin: true }), false);
  for (const value of ['', null, undefined, -1, 6, 1.5, 'invalid']) assert.throws(() => readinessPayload({ ...form, scopeScore: value }));
  for (const assessmentNote of ['', 'short', 'a'.repeat(8001)]) assert.throws(() => readinessPayload({ ...form, assessmentNote }));
});
test('authorised same-tenant assessment POST uses existing API contract', async () => {
  let received;
  const assessment = { id: 'assessment', projectId: id, organizationId: tenant, score: 50, ...form };
  const result = await saveReadiness({ client: { post: async (...args) => { received = args; return envelope(assessment); } }, user: admin, project, form });
  assert.deepEqual(received, [`/projects/${id}/readiness-assessments`, form]); assert.equal(result, assessment);
});
test('readiness role, tenant and malformed/sample IDs reject before making any request', async () => {
  let calls = 0; const client = { post: async () => { calls += 1; } };
  for (const role of ['executive', 'contributor', 'platform_admin', undefined]) await assert.rejects(saveReadiness({ client, user: { ...admin, role }, project, form }));
  for (const badProject of [{ ...project, organizationId: otherTenant }, { ...project, organizationId: undefined }, { ...project, id: 'p1' }, { ...project, id: '../another' }]) await assert.rejects(saveReadiness({ client, user: admin, project: badProject, form }));
  assert.equal(calls, 0);
});
test('unverified write response and API failure never produce a successful assessment', async () => {
  for (const assessment of [null, { projectId: 'wrong', organizationId: tenant, score: 50 }, { projectId: id, organizationId: otherTenant, score: 50 }, { projectId: id, organizationId: tenant, score: null }]) await assert.rejects(saveReadiness({ client: { post: async () => envelope(assessment) }, user: admin, project, form }));
  await assert.rejects(saveReadiness({ client: { post: async () => { throw new Error('offline'); } }, user: admin, project, form }), /offline/);
});
test('non-admin checklist never calls the admin-only membership endpoint', async () => {
  for (const role of ['portfolio_manager', 'contributor', 'executive', 'platform_admin']) {
    const calls = [];
    const loaded = await loadSetupEvidence({ get: async (path) => { calls.push(path); return envelope(profileData); } }, { ...admin, role });
    assert.deepEqual(calls, ['/workspace/profile']); assert.equal(loaded.profileStatus, 'success'); assert.equal(loaded.membersStatus, 'unavailable');
  }
});
test('admin checklist verifies member response tenant and includes current membership evidence', async () => {
  const calls = [];
  const loaded = await loadSetupEvidence({ get: async (path) => { calls.push(path); return envelope(path === '/workspace/profile' ? profileData : { organization: { id: tenant }, members: [{ id: 'colleague', status: 'active' }] }); } }, admin);
  assert.deepEqual(calls, ['/workspace/profile', '/workspace/members']); assert.equal(loaded.membersStatus, 'success');
  assert.equal(setupItems({ evidence: loaded, user: admin, projectCount: 1, strategyCount: 1 })[3].done, true);
});
test('checklist errors and wrong-tenant data are unavailable, never complete', async () => {
  for (const get of [async () => { throw new Error('offline'); }, async (path) => envelope(path === '/workspace/profile' ? { ...profileData, profile: { ...profileData.profile, id: otherTenant } } : { organization: { id: otherTenant }, members: [] })]) {
    const loaded = await loadSetupEvidence({ get }, admin);
    assert.equal(loaded.profileStatus, 'unavailable'); assert.equal(loaded.membersStatus, 'unavailable');
    assert.equal(setupItems({ evidence: loaded, user: admin })[0].status, 'unavailable');
  }
});
test('owner completion requires an eligible recorded owner plus full contact, not admin role or onboarding timestamp', () => {
  const items = setupItems({ evidence: evidence(), user: admin, projectCount: 0, strategyCount: 0 });
  assert.equal(items[0].done, true); assert.equal(items[1].done, false); assert.equal(items[2].done, false);
  for (const change of [{ workspaceOwnerId: null }, { workspaceOwnerId: 'removed' }, { operatingContactName: '' }, { operatingContactRole: '' }, { operatingContactEmail: 'invalid' }]) assert.equal(setupItems({ evidence: { ...evidence(), profile: { ...profileData, profile: { ...profileData.profile, onboardingCompleteAt: '2026-01-01', ...change } } }, user: admin })[0].done, false);
});
test('team readiness excludes self/disabled and does not mistake pending/expired invitations for active access', () => {
  const members = [{ id: admin.id, status: 'active' }, { id: 'disabled', status: 'inactive' }, { id: 'pending', status: 'invited', invitationExpiresAt: '2026-12-01' }, { id: 'expired', status: 'invited', invitationExpiresAt: '2026-01-01' }];
  const options = { evidence: evidence(members), user: admin, now: Date.parse('2026-11-01') };
  const team = setupItems(options)[3]; assert.equal(team.done, false); assert.match(team.detail, /0 active colleagues; 1 pending invitations; 1 expired/);
  assert.equal(setupItems({ ...options, evidence: evidence([...members, { id: 'active', status: 'active' }]) })[3].done, true);
});
test('reload-derived completion persists from saved records and distinguishes unverified register counts', () => {
  const options = { evidence: evidence([{ id: 'colleague', status: 'active' }]), user: admin, projectCount: 1, strategyCount: 1 };
  assert.deepEqual(setupItems(JSON.parse(JSON.stringify(options))), setupItems(options));
  const unavailable = setupItems({ evidence: null, user: admin }); assert.ok(unavailable.every((item) => item.status === 'unavailable' && !item.done));
});
