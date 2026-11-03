// Pure workflow policy and injected persistence: deliberately does not import DB/config.
export class ReviewIntegrityError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const MANAGERS = ['org_admin', 'portfolio_manager'];
export const WRITERS = [...MANAGERS, 'contributor'];
export function assertWriter(auth, organizationId) {
  if (!auth?.sub) throw new ReviewIntegrityError(401, 'Authentication is required.');
  if (!organizationId || !auth.organizationId || auth.organizationId !== organizationId) throw new ReviewIntegrityError(403, 'Council workspace access is required.');
  if (!WRITERS.includes(auth.role)) throw new ReviewIntegrityError(403, 'Your role is read-only for collaboration.');
}
export function assertVersion(record, expectedVersion) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new ReviewIntegrityError(422, 'Send the expectedVersion shown on the current quarterly update.');
  if (record.version !== expectedVersion) throw new ReviewIntegrityError(409, 'This update changed. Refresh and review the latest version before saving; your text has not been applied.');
}
export const resetReview = () => ({ workflowStatus: 'draft', reviewRequestedFromUserId: null, reviewedBy: null, reviewedAt: null, reviewComment: null, includedInReportAt: null });
export function assertEditablePeriod(period) {
  if (!period) throw new ReviewIntegrityError(404, 'Reporting period not found.');
  if (!['preparing', 'open'].includes(period.status)) throw new ReviewIntegrityError(409, 'This reporting period is locked or finalised. Reopen it before changing updates.');
}
export function canAuthor(auth, record, action) {
  return MANAGERS.includes(auth.role) || record?.submittedBy === auth.sub || action.ownerId === auth.sub;
}
export function quarterlyTransition({ auth, record, action, value, now = new Date() }) {
  assertVersion(record, value.expectedVersion);
  const from = record.workflowStatus; const to = value.workflowStatus;
  const transitions = { draft: ['submitted_for_review'], changes_requested: ['draft', 'submitted_for_review'], submitted_for_review: ['draft', 'changes_requested', 'endorsed'], endorsed: ['draft', 'included_in_report'], included_in_report: ['draft'] };
  if (!transitions[from]?.includes(to)) throw new ReviewIntegrityError(409, `Cannot move a quarterly update from ${from} to ${to}.`);
  const manager = MANAGERS.includes(auth.role);
  if (['draft', 'submitted_for_review'].includes(to) && !canAuthor(auth, record, action)) throw new ReviewIntegrityError(403, 'Only the submitting contributor, action owner or manager can submit or withdraw this update.');
  if (['changes_requested', 'endorsed'].includes(to) && !manager && auth.sub !== record.reviewRequestedFromUserId) throw new ReviewIntegrityError(403, 'Only the assigned reviewer or a manager can review this update.');
  if (to === 'included_in_report' && !manager) throw new ReviewIntegrityError(403, 'Only an organisation administrator or portfolio manager can include an endorsed update.');
  if (to === 'endorsed' && auth.sub === record.submittedBy) throw new ReviewIntegrityError(403, 'The narrative author cannot endorse their own update. Assign an independent reviewer.');
  if (to !== 'submitted_for_review' && value.reviewRequestedFromUserId) throw new ReviewIntegrityError(422, 'Review assignment can only change when submitting for review.');
  if (to === 'submitted_for_review' && !value.reviewRequestedFromUserId) throw new ReviewIntegrityError(422, 'Choose an active reviewer before submitting.');
  if (to === 'submitted_for_review' && value.reviewRequestedFromUserId === record.submittedBy) throw new ReviewIntegrityError(422, 'Choose an independent reviewer, not the narrative author.');
  if (to === 'changes_requested' && !value.reviewComment?.trim()) throw new ReviewIntegrityError(422, 'Explain the changes required.');
  if (to === 'draft') return { ...resetReview(), version: record.version + 1 };
  const patch = { workflowStatus: to, version: record.version + 1 };
  if (to === 'submitted_for_review') Object.assign(patch, { ...resetReview(), workflowStatus: to, reviewRequestedFromUserId: value.reviewRequestedFromUserId, submittedAt: now });
  if (['changes_requested', 'endorsed'].includes(to)) Object.assign(patch, { reviewComment: value.reviewComment || null, reviewedBy: auth.sub, reviewedAt: now, includedInReportAt: null });
  // Inclusion does not overwrite who endorsed the narrative.
  if (to === 'included_in_report') patch.includedInReportAt = now;
  return patch;
}
export function requestTransition(auth, record, value) {
  if (record.requestType === 'handover') throw new ReviewIntegrityError(422, 'Use the dependency handover workflow to transfer ownership.');
  const allowed = { open: ['submitted', 'declined'], changes_requested: ['submitted', 'declined'], submitted: ['changes_requested', 'complete'] };
  if (!allowed[record.status]?.includes(value.status)) throw new ReviewIntegrityError(409, 'That request transition is no longer available. Refresh the request.');
  const manager = MANAGERS.includes(auth.role);
  const responding = ['submitted', 'declined'].includes(value.status);
  if (!manager && (responding ? record.requestedFromUserId : record.requestedByUserId) !== auth.sub) throw new ReviewIntegrityError(403, responding ? 'Only the recipient or a manager can respond.' : 'Only the requester or a manager can accept or request changes.');
  if (['submitted', 'changes_requested'].includes(value.status) && !value.response?.trim()) throw new ReviewIntegrityError(422, 'A response or explanation is required.');
  // Acceptance retains the submitted response rather than silently clearing it.
  return { status: value.status, ...(value.response !== undefined ? { response: value.response } : {}), completedAt: ['complete', 'declined'].includes(value.status) ? new Date() : null };
}
export function assertHandoverRequest(auth, record) {
  if (!MANAGERS.includes(auth.role) && record.ownerId !== auth.sub) throw new ReviewIntegrityError(403, 'Only the dependency owner or a manager can request a handover.');
  if (!['not_requested', 'clarification_requested', 'revised_date_proposed', 'declined', null, undefined].includes(record.handoverStatus)) throw new ReviewIntegrityError(409, 'A requested or accepted handover cannot be overwritten.');
}
export function handoverTransition(auth, record, value) {
  if (record.handoverStatus !== 'requested') throw new ReviewIntegrityError(409, 'Only a currently requested handover can receive a response.');
  if (!record.handoverRequestedTo) throw new ReviewIntegrityError(409, 'This handover has no nominated recipient.');
  if (!MANAGERS.includes(auth.role) && record.handoverRequestedTo !== auth.sub) throw new ReviewIntegrityError(403, 'Only the receiving owner or a manager can respond.');
  if (!['accepted', 'clarification_requested', 'revised_date_proposed', 'declined'].includes(value.handoverStatus)) throw new ReviewIntegrityError(422, 'Invalid handover response.');
  if (value.handoverStatus === 'revised_date_proposed' && !value.proposedDueDate) throw new ReviewIntegrityError(422, 'Provide the proposed due date.');
  if (value.handoverStatus !== 'accepted' && !value.response?.trim()) throw new ReviewIntegrityError(422, 'Explain the handover response.');
  return { handoverStatus: value.handoverStatus, handoverResponse: value.response || null, proposedDueDate: value.proposedDueDate || null, ...(value.handoverStatus === 'accepted' ? { ownerId: record.handoverRequestedTo } : {}) };
}
export function assertPackOwner(auth, pack) {
  if (!MANAGERS.includes(auth.role) && pack.ownerId !== auth.sub) throw new ReviewIntegrityError(403, 'Only the Review Pack owner or a manager can change this pack.');
}
export function assertOpenPack(pack) {
  if (!['draft', 'ready'].includes(pack.status)) throw new ReviewIntegrityError(409, 'This Review Pack is closed or archived and is read-only.');
}
export function packTransition(auth, pack, status, unanswered = 0) {
  assertPackOwner(auth, pack);
  if (!({ draft: ['ready'], ready: ['completed'], completed: ['archived'] })[pack.status]?.includes(status)) throw new ReviewIntegrityError(409, 'Use draft → ready → completed → archived. Closed packs cannot be reopened.');
  if (status === 'completed' && unanswered) throw new ReviewIntegrityError(409, 'Answer all pre-reading questions before closing this Review Pack.');
  return { status };
}
export function assertOutcome(value) {
  if (Boolean(value.resourceType) !== Boolean(value.resourceId)) throw new ReviewIntegrityError(422, 'Supply both a resource type and record ID, or neither.');
  if (['decision', 'follow_up'].includes(value.outcomeType) && !value.ownerId) throw new ReviewIntegrityError(422, 'Decisions and follow-ups require an active owner.');
  if (value.outcomeType === 'follow_up' && !value.dueDate) throw new ReviewIntegrityError(422, 'Follow-ups require a due date.');
}
export function handleIntegrityError(error, res, next) {
  if (error instanceof ReviewIntegrityError) return res.status(error.status).json({ error: error.message });
  if (['SequelizeUniqueConstraintError', 'SequelizeOptimisticLockError'].includes(error.name) || ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.original?.code)) return res.status(409).json({ error: 'Another change competed with this request. Refresh before retrying.' });
  return next(error);
}
// The loaded instance is always read *inside* the transaction with a row lock.
// All dependent writes (including audit) finish before the short transaction commits.
export async function lockedMutation({ sequelize, Model, where, mutate }) {
  return sequelize.transaction(async (transaction) => {
    const record = await Model.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    if (!record) throw new ReviewIntegrityError(404, 'Council workspace record not found.');
    return mutate(record, transaction);
  });
}
// Shared lock ordering for narrative and workflow: period → action → update.
// Locking the action also serialises first creation, avoiding an unsafe upsert.
export async function quarterlyMutation({ sequelize, Period, Action, Update, organizationId, periodId, actionId, mutate }) {
  return sequelize.transaction(async (transaction) => {
    const options = { transaction, lock: transaction.LOCK.UPDATE };
    const period = await Period.findOne({ where: { id: periodId, organizationId }, ...options });
    assertEditablePeriod(period);
    const action = await Action.findOne({ where: { id: actionId, organizationId, strategyId: period.strategyId }, ...options });
    if (!action) throw new ReviewIntegrityError(422, 'The action does not belong to this reporting period’s Council strategy.');
    const record = await Update.findOne({ where: { organizationId, actionId, reportingPeriodId: periodId }, ...options });
    return mutate({ record, action, period, transaction });
  });
}
export async function saveQuarterlyNarrative({ auth, value, record, action, period, transaction, Update, audit, organizationId }) {
  if (!canAuthor(auth, record, action)) throw new ReviewIntegrityError(403, 'Only the submitting contributor, action owner or a manager can edit this narrative.');
  const { expectedVersion, ...narrative } = value;
  let saved = record;
  if (record) {
    if (expectedVersion === 0) throw new ReviewIntegrityError(409, 'A quarterly update already exists. Refresh before editing the current version.');
    assertVersion(record, expectedVersion);
    await record.update({ ...narrative, ...resetReview(), version: record.version + 1, submittedBy: auth.sub, submittedAt: new Date() }, { transaction });
  } else {
    if (expectedVersion !== 0) throw new ReviewIntegrityError(expectedVersion === undefined ? 422 : 409, 'New updates require expectedVersion: 0. Refresh if an update already exists.');
    saved = await Update.create({ ...narrative, organizationId, actionId: action.id, reportingPeriodId: period.id, submittedBy: auth.sub, version: 1, ...resetReview() }, { transaction });
  }
  await action.update({ status: value.status, statusRationale: value.riskSummary || action.statusRationale }, { transaction });
  await audit(saved, transaction, Boolean(record));
  return { record: saved, created: !record };
}
