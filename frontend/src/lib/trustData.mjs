// Pure presentation rules: missing data is not zero, and live errors are never samples.
export const readinessDimensions = [
  ['scopeScore', 'Scope'], ['costScore', 'Cost'], ['approvalsScore', 'Approvals'],
  ['partnerScore', 'Partners'], ['fundingScore', 'Funding fit'], ['deliveryScore', 'Delivery'],
];
const stages = { concept: 'Concept', scoping: 'Scoping', business_case: 'Business case', funding_ready: 'Funding ready', approved: 'Approved', delivery: 'Delivery', completed: 'Completed', on_hold: 'On hold' };
export const stageLabel = (stage) => stages[stage] || (typeof stage === 'string' ? stage.replace(/_/g, ' ') : 'Unstaged');
export const isDemoWorkspace = (user) => user?.organisationIsDemo === true;
export const workspaceKey = (user) => user?.organizationId && user?.id ? `${user.organizationId}:${user.id}:${user.role}:${isDemoWorkspace(user)}` : null;
export const canManageProjects = (role) => ['org_admin', 'portfolio_manager'].includes(role);
export const isRecordId = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function numberOrNull(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export const percentOrNull = (value) => { const number = numberOrNull(value); return number !== null && number <= 100 ? number : null; };
export function requireRows(value) {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== 'object' || Array.isArray(row) || !row.id)) throw new Error('Invalid register response');
  return value;
}
export function latestAssessment(project) {
  const assessments = Array.isArray(project.ReadinessAssessments) ? project.ReadinessAssessments.filter((item) => item && typeof item === 'object' && !Array.isArray(item) && (!item.projectId || item.projectId === project.id) && (!item.organizationId || item.organizationId === project.organizationId)) : [];
  return [...assessments].sort((a, b) => (Date.parse(b.assessedAt) || 0) - (Date.parse(a.assessedAt) || 0))[0] || null;
}
export function toProject(project) {
  const assessment = latestAssessment(project);
  const readiness = assessment ? percentOrNull(assessment.score) : null;
  return {
    ...project, name: project.name || 'Untitled project', priority: project.Priority?.title || 'No linked Council priority',
    stage: stageLabel(project.stage), stageKey: project.stage, assessment, readiness,
    risk: readiness === null ? 'Unassessed' : readiness < 50 ? 'High' : readiness < 75 ? 'Medium' : 'Low',
    cost: numberOrNull(project.estimatedCost), target: numberOrNull(project.targetFunding), secured: numberOrNull(project.securedFunding), jobs: numberOrNull(project.expectedJobs),
    expectedBenefit: project.expectedBenefit || project.summary || 'No benefit statement has been recorded yet.', currencyCode: project.currencyCode || 'AUD',
  };
}
export function assessmentDimensions(assessment) {
  return readinessDimensions.map(([key, label]) => {
    const score = numberOrNull(assessment?.[key]);
    const valid = score !== null && Number.isInteger(score) && score <= 5;
    return { key, label, score: valid ? score : null, percent: valid ? score / 5 * 100 : null };
  });
}
export function readinessPayload(form) {
  const payload = {};
  for (const [key] of readinessDimensions) {
    const score = numberOrNull(form[key]);
    if (score === null || !Number.isInteger(score) || score > 5) throw new Error('Choose a score from 0 to 5 for all six dimensions.');
    payload[key] = score;
  }
  if (typeof form.assessmentNote !== 'string' || form.assessmentNote.trim().length < 10 || form.assessmentNote.length > 8000) throw new Error('Record an evidence note (10–8,000 characters) supporting this assessment.');
  return { ...payload, assessmentNote: form.assessmentNote.trim() };
}
export async function saveReadiness({ client, user, project, form }) {
  if (!canManageProjects(user?.role) || !isRecordId(project?.id) || !user?.organizationId || project.organizationId !== user.organizationId) throw new Error('This assessment cannot be changed by this account.');
  const response = await client.post(`/projects/${project.id}/readiness-assessments`, readinessPayload(form));
  const assessment = response?.data?.data;
  if (!assessment || assessment.projectId !== project.id || assessment.organizationId !== user.organizationId || percentOrNull(assessment.score) === null) throw new Error('The assessment response could not be verified. Refresh before trying again.');
  return assessment;
}
export const initialDataState = (key) => ({ key, status: 'loading', rows: [] });
export function rowsForWorkspace(state, key) { return state.key === key && state.status === 'success' ? state.rows : []; }
export function addCreatedProject(state, key, project) {
  // Never append to stale, errored, demonstration fallback or another tenant's rows.
  return { key, status: 'success', rows: [project, ...rowsForWorkspace(state, key).filter((item) => item.id !== project.id)] };
}
export function dashboardData(overview, projectRecords) {
  if (!overview || typeof overview !== 'object' || !overview.summary || !Array.isArray(overview.pathways) || !Array.isArray(overview.workItems)) throw new Error('Invalid dashboard response');
  const projects = requireRows(projectRecords).map(toProject);
  const sum = (key) => projects.reduce((total, project) => total + (project[key] ?? 0), 0);
  const assessed = projects.filter((project) => project.readiness !== null);
  const target = sum('target'); const secured = sum('secured');
  const fundingReadyCount = projects.filter((project) => project.stageKey === 'funding_ready').length;
  const summary = { livePortfolioValue: sum('cost'), fundingTarget: target, securedFunding: secured, fundingGap: Math.max(0, target - secured), expectedJobs: sum('jobs'), averageReadiness: assessed.length ? assessed.reduce((total, project) => total + project.readiness, 0) / assessed.length : null, fundingReadyCount, strategyCount: numberOrNull(overview.summary.strategyCount) };
  const palette = [{ name: 'Assessed ≥75%', color: '#0D6A55', test: (p) => p.readiness !== null && p.readiness >= 75 }, { name: 'Assessed 50–74%', color: '#60716D', test: (p) => p.readiness !== null && p.readiness >= 50 && p.readiness < 75 }, { name: 'Assessed <50%', color: '#CD7C4E', test: (p) => p.readiness !== null && p.readiness < 50 }, { name: 'Unassessed', color: '#B8CCC4', test: (p) => p.readiness === null }];
  const stageMix = new Map(); projects.forEach((project) => stageMix.set(project.stage, (stageMix.get(project.stage) || 0) + 1));
  const names = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  return {
    projects, summary, assessedCount: assessed.length,
    missingAmounts: projects.some((project) => ['cost', 'target', 'secured', 'jobs'].some((key) => project[key] === null)),
    readiness: palette.map(({ name, color, test }) => ({ name, color, value: projects.filter(test).length })),
    stages: [...stageMix].map(([stage, count]) => ({ stage, count, colour: '#0D6A55' })),
    benefits: [{ name: 'Expected jobs', value: summary.expectedJobs }, { name: 'Projects', value: projects.length }, { name: 'Funding ready', value: fundingReadyCount }],
    pathways: overview.pathways,
    actions: overview.workItems.map((item) => ({ ...item, type: typeof item.workType === 'string' ? item.workType.replace(/_/g, ' ') : 'Work item', project: names[item.projectId] || 'Council portfolio' })),
    // This is a categorical amount snapshot, not a fabricated temporal funding trend.
    fundingSeries: overview.pathways.filter((item) => numberOrNull(item.potentialAmount) !== null).map((item) => ({ id: item.id, name: item.sourceName || 'Unnamed pathway', value: numberOrNull(item.potentialAmount) / 1000000 })),
  };
}
export async function loadSetupEvidence(client, user, { includeMembers = true } = {}) {
  if (!workspaceKey(user)) return { profile: null, members: null, profileStatus: 'unavailable', membersStatus: 'unavailable' };
  const [profile, members] = await Promise.allSettled([
    client.get('/workspace/profile'),
    includeMembers && user.role === 'org_admin' ? client.get('/workspace/members') : Promise.resolve(null),
  ]);
  const profileData = profile.status === 'fulfilled' ? profile.value?.data?.data : null;
  const memberData = members.status === 'fulfilled' ? members.value?.data?.data : null;
  const validProfile = profileData?.profile?.id === user.organizationId && Array.isArray(profileData?.eligibleOwners);
  const validMembers = user.role === 'org_admin' && memberData?.organization?.id === user.organizationId && Array.isArray(memberData?.members);
  return { profile: validProfile ? profileData : null, members: validMembers ? memberData.members : null, profileStatus: validProfile ? 'success' : 'unavailable', membersStatus: validMembers ? 'success' : 'unavailable' };
}
export function setupItems({ evidence, user, projectCount = null, strategyCount = null, now = Date.now() }) {
  const profile = evidence?.profile?.profile;
  const owner = evidence?.profile?.eligibleOwners?.find((member) => member.id === profile?.workspaceOwnerId && canManageProjects(member.role));
  const ownerKnown = evidence?.profileStatus === 'success';
  const ownerDone = Boolean(owner && profile.operatingContactName?.trim() && profile.operatingContactRole?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.operatingContactEmail || ''));
  const membersKnown = evidence?.membersStatus === 'success';
  const colleagues = (evidence?.members || []).filter((member) => member.id !== user?.id && !member.isCurrentUser);
  const active = colleagues.filter((member) => member.status === 'active').length;
  const pending = colleagues.filter((member) => member.status === 'invited' && Date.parse(member.invitationExpiresAt) > now).length;
  const expired = colleagues.filter((member) => member.status === 'invited' && !(Date.parse(member.invitationExpiresAt) > now)).length;
  const item = (title, to, known, complete, detail) => ({ title, to, status: !known ? 'unavailable' : complete ? 'complete' : 'todo', done: known && complete, detail });
  return [
    item('Confirm the workspace owner and operating contact', '/settings', ownerKnown, ownerDone, !ownerKnown ? 'Workspace profile unavailable. Retry or ask the Organisation Administrator.' : ownerDone ? 'An eligible active owner and complete operating contact are recorded.' : 'Choose an active owner and record the contact name, role and email.'),
    item('Add or import the Council’s priority projects', '/portfolio', projectCount !== null, projectCount > 0, projectCount === null ? 'Project register not verified.' : `${projectCount} recorded projects.`),
    item('Create a strategy delivery register or import adopted actions', '/strategy-delivery', strategyCount !== null, strategyCount > 0, strategyCount === null ? 'Strategy register not verified.' : `${strategyCount} recorded strategies.`),
    item('Invite colleagues and confirm team access', '/settings', membersKnown, active > 0, !membersKnown ? 'Team readiness unavailable to this view. The Organisation Administrator can verify People and Access.' : `${active} active colleagues; ${pending} pending invitations; ${expired} expired or unverified invitations. Invitations alone do not confirm team access.`),
  ];
}
