// No runtime/database imports: the lifecycle is testable with injected repositories.
export const WRITE_ROLES = Object.freeze(['org_admin', 'portfolio_manager', 'contributor']);
export const READ_ROLES = Object.freeze([...WRITE_ROLES, 'executive']);
export const GRANT_TRANSITIONS = Object.freeze({
  identified: ['assessing', 'withdrawn'],
  assessing: ['identified', 'preparing', 'not_successful', 'withdrawn'],
  preparing: ['assessing', 'submitted', 'withdrawn'],
  submitted: ['preparing', 'awarded', 'not_successful', 'withdrawn'],
  awarded: ['contracted', 'withdrawn'],
  contracted: ['acquitting', 'withdrawn'],
  acquitting: ['contracted', 'acquitted'],
  acquitted: [], not_successful: ['assessing'], withdrawn: ['assessing'],
});
export const PATHWAY_TRANSITIONS = Object.freeze({
  watching: ['preparing', 'closed'], preparing: ['watching', 'submitted', 'closed'],
  submitted: ['preparing', 'awarded', 'not_successful', 'closed'],
  awarded: ['closed'], not_successful: ['watching', 'closed'], closed: ['watching'],
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,12}(?:\.\d{1,2})?$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export class FundingError extends Error {
  constructor(status, message, code = 'funding_validation') { super(message); this.status = status; this.code = code; }
}
const fail = (message, status = 422, code) => { throw new FundingError(status, message, code); };
export function uuid(value, label = 'Reference') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`${label} must be a valid UUID.`);
  return value;
}
function text(value, label, max, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`${label} must be text of at most ${max} characters.`);
  const result = value.trim();
  if (required && !result) fail(`${label} is required.`);
  return result;
}
export function dateOnly(value, label = 'Date') {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2200-12-31') fail(`${label} must be a date (YYYY-MM-DD) between 1900 and 2200.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(`${label} is not a real calendar date.`);
  return value;
}
export function money(value, label = 'Amount') {
  if (value === null || value === '') return null;
  const result = String(value);
  if (!['string', 'number'].includes(typeof value) || !MONEY.test(result)) fail(`${label} must be non-negative, at most 999999999999.99, with no more than two decimal places.`);
  // Retain a decimal string. Do not convert DECIMAL money to binary floating point.
  const [units, fraction = ''] = result.split('.');
  return `${units.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}
export function safeFundingUrl(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1000 || /\s|[\\\u0000-\u001f]/.test(value)) fail('Source URL must be a public HTTPS URL of at most 1000 characters.');
  let url; try { url = new URL(value); } catch { fail('Source URL is not valid.'); }
  // URLs are references only and are never fetched by this service. Block credentials,
  // executable schemes, unusual ports, IP literals and local/private hostnames.
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
    || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(host)) fail('Only public HTTPS hostname references without credentials are allowed.');
  return url.href;
}
function ids(value, label) {
  if (!Array.isArray(value) || value.length > 50) fail(`${label} must contain at most 50 IDs.`);
  value.forEach((id) => uuid(id, label));
  if (new Set(value).size !== value.length) fail(`${label} contains duplicate IDs.`);
  return value;
}
const GRANT_FIELDS = ['title', 'funder', 'projectId', 'fundingPathwayId', 'leadId', 'requestedAmount', 'awardedAmount', 'currencyCode', 'status', 'dueDate', 'acquittalDueDate', 'notes'];
const PATHWAY_FIELDS = ['sourceName', 'sourceType', 'projectId', 'fit', 'potentialAmount', 'currencyCode', 'dueDate', 'status', 'note'];
const STATE_FIELDS = ['sourceUrl', 'evidenceIds', 'workItemIds'];
const spec = (kind) => kind === 'grant' ? { model: 'Grant', fields: GRANT_FIELDS, transitions: GRANT_TRANSITIONS, initial: 'identified' } : { model: 'FundingPathway', fields: PATHWAY_FIELDS, transitions: PATHWAY_TRANSITIONS, initial: 'watching' };
export function validateFundingInput(kind, body, create = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('A JSON object is required.');
  const config = spec(kind); const allowed = new Set([...config.fields, ...STATE_FIELDS, 'reason', ...(create ? [] : ['version', 'updatedAt'])]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) fail(`Unsupported field: ${key}.`);
  const values = {}; const state = {};
  for (const key of config.fields) {
    if (!own(body, key)) continue;
    const value = body[key];
    if (['projectId', 'fundingPathwayId', 'leadId'].includes(key)) values[key] = value === null || value === '' ? null : uuid(value, key);
    else if (['requestedAmount', 'awardedAmount', 'potentialAmount'].includes(key)) values[key] = money(value, key);
    else if (['dueDate', 'acquittalDueDate'].includes(key)) values[key] = dateOnly(value, key);
    else if (key === 'currencyCode') { if (!['AUD', 'NZD'].includes(value)) fail('Currency must be AUD or NZD.'); values[key] = value; }
    else if (key === 'status') { if (!own(config.transitions, value)) fail('Unknown lifecycle status.'); values[key] = value; }
    else if (key === 'sourceType') { if (!['grant', 'loan', 'council', 'partner', 'private', 'other'].includes(value)) fail('Unknown source type.'); values[key] = value; }
    else if (key === 'fit') { if (!['strong', 'possible', 'watch'].includes(value)) fail('Unknown Council-assessed fit.'); values[key] = value; }
    else values[key] = text(value, key, key === 'funder' ? 180 : ['notes', 'note'].includes(key) ? 10000 : 200, !['notes', 'note'].includes(key));
  }
  if (own(body, 'sourceUrl')) state.sourceUrl = safeFundingUrl(body.sourceUrl);
  for (const field of ['evidenceIds', 'workItemIds']) if (own(body, field)) state[field] = ids(body[field], field);
  if (kind !== 'grant' && (own(state, 'evidenceIds') || own(state, 'workItemIds'))) fail('Evidence and work links belong to a grant record.');
  const reason = own(body, 'reason') ? text(body.reason, 'Audit reason', 500, true) : create ? 'Council manual entry' : fail('An audit reason is required for changes.');
  if (create) {
    for (const field of kind === 'grant' ? ['title', 'funder'] : ['sourceName', 'projectId']) if (!values[field]) fail(`${field} is required.`);
    if (values.status && values.status !== config.initial) fail(`New records start at ${config.initial}; advance through audited transitions.`);
    values.status = config.initial;
  } else {
    if (!Number.isSafeInteger(body.version) || body.version < 0) fail('A non-negative integer version is required.', 428, 'funding_version_required');
    if (typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))) fail('The last-read updatedAt timestamp is required.', 428, 'funding_version_required');
    if (!Object.keys(values).length && !Object.keys(state).length) fail('No changes were supplied.');
  }
  return { values, state, reason, version: body.version, updatedAt: body.updatedAt };
}
export function assertTransition(kind, previous, next) {
  if (next !== previous && !spec(kind).transitions[previous]?.includes(next)) fail(`Transition from ${previous} to ${next} is not permitted.`, 409, 'funding_invalid_transition');
}
export function csvCell(value) {
  let result = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(result) || /^[\t\r]/.test(result)) result = `'${result}`;
  return `"${result.replace(/"/g, '""')}"`;
}
export function fundingCsv(kind, records) {
  const columns = ['id', ...spec(kind).fields, 'provenance', 'sourceUrl', 'archivedAt', 'version'];
  return '\ufeff' + [columns.map(csvCell).join(','), ...records.map((record) => columns.map((key) => csvCell(record[key])).join(','))].join('\r\n') + '\r\n';
}
const plain = (record) => record?.get ? record.get({ plain: true }) : record;
export function serializeFunding(kind, record, state) {
  const row = plain(record); const lifecycle = plain(state);
  return { id: row.id, ...Object.fromEntries(spec(kind).fields.map((field) => [field, row[field] ?? null])),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    version: lifecycle?.version ?? 0, archivedAt: lifecycle?.archivedAt ?? null,
    provenance: lifecycle?.provenance ?? 'legacy_unverified', sourceUrl: lifecycle?.sourceUrl ?? null,
    enteredBy: lifecycle?.createdBy ?? null, lastChangedBy: lifecycle?.updatedBy ?? null,
    evidenceIds: lifecycle?.evidenceIds ?? [], workItemIds: lifecycle?.workItemIds ?? [],
    allowedTransitions: lifecycle?.archivedAt ? [] : (spec(kind).transitions[row.status] ?? []),
  };
}
export function createFundingLifecycleHandlers({ sequelize, models, audit, Op, literal }) {
  const State = models.FundingLifecycleRecord;
  async function actor(req, write = false, transaction) {
    if (!req.auth?.sub || !req.auth.organizationId) fail('Authentication is required.', 401, 'funding_auth_required');
    uuid(req.auth.sub, 'Authenticated user'); uuid(req.auth.organizationId, 'Authenticated organisation');
    if (req.tenant?.organizationId !== req.auth.organizationId) fail('Tenant scope could not be confirmed.', 403, 'funding_tenant_required');
    const user = await models.User.findOne({ where: { id: req.auth.sub, organizationId: req.auth.organizationId, status: 'active' }, attributes: ['id', 'role', 'status', 'organizationId'], transaction, ...(transaction ? { lock: transaction.LOCK.SHARE } : {}) });
    if (!user) fail('Your account is not active in this Council workspace.', 401, 'funding_auth_required');
    if (!(write ? WRITE_ROLES : READ_ROLES).includes(user.role)) fail(write ? 'This role is read-only for funding and grants.' : 'This role cannot access Council funding records.', 403, 'funding_role_required');
    return req.auth.organizationId;
  }
  function endpoint(handler) {
    return async (req, res, next) => {
      try { return await handler(req, res); } catch (error) {
        if (error instanceof FundingError) return res.status(error.status).json({ error: error.message, code: error.code });
        // The common error middleware must not reveal database internals.
        if (error?.original?.code === 'ER_NO_SUCH_TABLE' || error?.original?.code === 'ER_BAD_FIELD_ERROR') return res.status(503).json({ error: 'The funding lifecycle schema is not available. Ask your administrator to complete migration 019.', code: 'funding_schema_unavailable' });
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.original?.code)) return res.status(409).json({ error: 'Another write is in progress. Reload the record and retry; this change was not committed.', code: 'funding_edit_conflict' });
        // The shared middleware logs its error argument. Never forward raw SQL,
        // connection configuration, user notes or reference URLs into that log.
        return next(new Error('Funding lifecycle persistence failed; the operation did not complete.'));
      }
    };
  }
  async function findRecord(kind, id, organizationId, transaction, locked = false) {
    uuid(id, `${kind} ID`);
    const record = await models[spec(kind).model].findOne({ where: { id, organizationId }, transaction, ...(locked ? { lock: transaction.LOCK.UPDATE } : {}) });
    if (!record) fail('Funding record was not found in this Council workspace.', 404, 'funding_not_found');
    if (kind === 'grant' && record.isSample) fail('Funding record was not found in this Council workspace.', 404, 'funding_not_found');
    if (kind === 'pathway') {
      const project = await models.CivicProject.findOne({ where: { id: record.projectId, organizationId, isSample: false }, attributes: ['id'], transaction });
      if (!project) fail('Funding record was not found in this Council workspace.', 404, 'funding_not_found');
    }
    return record;
  }
  async function findState(kind, record, organizationId, transaction) {
    return State.findOne({ where: { organizationId, entityType: kind, entityId: record.id }, transaction });
  }
  async function ensureState(kind, record, organizationId, transaction) {
    const existing = await findState(kind, record, organizationId, transaction);
    if (existing) return existing;
    // Parent row is already locked, preventing duplicate sidecar creation by competing edits.
    return State.create({ organizationId, entityType: kind, entityId: record.id, version: 0, provenance: 'legacy_unverified', evidenceIds: [], workItemIds: [] }, { transaction });
  }
  async function reference(modelName, id, organizationId, transaction, where = {}) {
    if (!id) return null;
    const result = await models[modelName].findOne({ where: { id, organizationId, ...where }, transaction, lock: transaction.LOCK.SHARE });
    if (!result) fail('A linked reference is unavailable in this Council workspace.', 422, 'funding_reference_scope');
    return result;
  }
  async function validateReferences(kind, data, state, organizationId, transaction, recordId) {
    const project = await reference('CivicProject', data.projectId, organizationId, transaction);
    if (project && project.isSample) fail('Sample projects cannot be linked to manual funding records.');
    if (kind === 'pathway' && !project) fail('A Council project is required for a funding pathway.');
    if (kind === 'grant') {
      await reference('User', data.leadId, organizationId, transaction, { status: 'active' });
      const pathway = await reference('FundingPathway', data.fundingPathwayId, organizationId, transaction);
      if (pathway) {
        const lifecycle = await findState('pathway', pathway, organizationId, transaction);
        if (lifecycle?.archivedAt) fail('An archived pathway cannot be linked.');
        if (!data.projectId || pathway.projectId !== data.projectId) fail('The linked pathway must belong to the linked project.');
        if (pathway.currencyCode !== data.currencyCode) fail('Linked pathway and grant currencies must match; no currency conversion is implied.');
      }
      for (const [field, modelName] of [['evidenceIds', 'EvidenceItem'], ['workItemIds', 'WorkItem']]) {
        for (const id of state[field] || []) {
          const item = await reference(modelName, id, organizationId, transaction);
          if (item.grantId && item.grantId !== recordId) fail('A linked record belongs to a different grant.');
          if (item.projectId && item.projectId !== data.projectId) fail('Evidence and work links must match the grant project.');
          if (modelName === 'EvidenceItem' && item.externalUrl) safeFundingUrl(item.externalUrl);
        }
      }
      if (data.dueDate && data.acquittalDueDate && data.acquittalDueDate < data.dueDate) fail('Acquittal due date cannot precede the application due date.');
      if (['awarded', 'contracted', 'acquitting', 'acquitted'].includes(data.status) && data.awardedAmount == null) fail('Record the awarded amount before entering an awarded or delivery stage.');
    }
    // Do not relabel an existing amount when changing currency.
    return project;
  }
  async function writeAudit(req, kind, record, action, reason, transaction, metadata = {}) {
    await audit(req, { entityType: kind === 'grant' ? 'grant' : 'funding_pathway', entityId: record.id, action, metadata: { reason, ...metadata }, transaction });
  }
  function assertVersion(state, version) {
    if (state.version !== version) fail('This record changed since you opened it. Reload it before saving; your edits were not applied.', 409, 'funding_edit_conflict');
  }
  async function mutation(req, kind, operation) {
    await actor(req, true);
    const input = operation === 'create' || operation === 'update' ? validateFundingInput(kind, req.body, operation === 'create') : null;
    if (!input) {
      if (!req.body || Object.keys(req.body).some((key) => !['version', 'updatedAt', 'reason'].includes(key))) fail('Only version, updatedAt and audit reason are allowed.');
      if (!Number.isSafeInteger(req.body.version) || req.body.version < 0) fail('A version is required.', 428, 'funding_version_required');
      if (typeof req.body.updatedAt !== 'string' || !Number.isFinite(Date.parse(req.body.updatedAt))) fail('The last-read updatedAt timestamp is required.', 428, 'funding_version_required');
      text(req.body.reason, 'Audit reason', 500, true);
    }
    return sequelize.transaction(async (transaction) => {
      const organizationId = await actor(req, true, transaction);
      if (operation === 'create') {
        const org = await models.Organization.findOne({ where: { id: organizationId }, attributes: ['id', 'defaultCurrency'], transaction });
        if (!org || !['AUD', 'NZD'].includes(org.defaultCurrency)) fail('Council currency is not configured.', 409);
        const values = { ...input.values, currencyCode: input.values.currencyCode || org.defaultCurrency };
        await validateReferences(kind, values, input.state, organizationId, transaction);
        const record = await models[spec(kind).model].create({ ...values, organizationId, ...(kind === 'grant' ? { isSample: false } : {}) }, { transaction });
        const state = await State.create({ organizationId, entityType: kind, entityId: record.id, version: 1, provenance: 'council_entered', createdBy: req.auth.sub, updatedBy: req.auth.sub, evidenceIds: [], workItemIds: [], ...input.state }, { transaction });
        await writeAudit(req, kind, record, 'created', input.reason, transaction, { version: 1, provenance: 'council_entered' });
        // MySQL DATE may persist seconds while the in-memory Sequelize timestamp
        // contains milliseconds. Return the stored value, not a false stale token.
        await record.reload({ transaction });
        return serializeFunding(kind, record, state);
      }
      const record = await findRecord(kind, req.params.id || req.params.grantId, organizationId, transaction, true);
      if (record.isSample) fail('Sample grant records cannot be changed through the manual lifecycle.', 409);
      const state = await ensureState(kind, record, organizationId, transaction);
      assertVersion(state, input ? input.version : req.body.version);
      if (new Date(record.updatedAt).getTime() !== Date.parse(req.body.updatedAt)) fail('This record changed since you opened it. Reload it before saving; your edits were not applied.', 409, 'funding_edit_conflict');
      if (operation === 'update') {
        if (state.archivedAt) fail('Reactivate the archived record before editing.', 409, 'funding_archived');
        assertTransition(kind, record.status, input.values.status ?? record.status);
        const data = { ...plain(record), ...input.values };
        if (data.currencyCode !== record.currencyCode) {
          const amounts = kind === 'grant' ? ['requestedAmount', 'awardedAmount'] : ['potentialAmount'];
          if (amounts.some((field) => !own(input.values, field))) fail('Changing currency requires explicitly re-entering every amount (or clearing it).');
        }
        const nextState = { ...plain(state), ...input.state };
        await validateReferences(kind, data, nextState, organizationId, transaction, record.id);
        const previous = record.status;
        await record.update(input.values, { transaction });
        await state.update({ ...input.state, version: state.version + 1, updatedBy: req.auth.sub }, { transaction });
        await writeAudit(req, kind, record, previous === record.status ? 'updated' : 'status_changed', input.reason, transaction, { fromStatus: previous, toStatus: record.status, changedFields: [...Object.keys(input.values), ...Object.keys(input.state)], version: state.version });
      } else {
        const archive = operation === 'archive';
        if (archive === Boolean(state.archivedAt)) fail(archive ? 'Record is already archived.' : 'Record is already active.', 409, 'funding_invalid_transition');
        await state.update({ archivedAt: archive ? new Date() : null, updatedBy: req.auth.sub, version: state.version + 1 }, { transaction });
        await writeAudit(req, kind, record, archive ? 'archived' : 'reactivated', req.body.reason.trim(), transaction, { preservedStatus: record.status, version: state.version });
      }
      await record.reload({ transaction });
      return serializeFunding(kind, record, state);
    });
  }
  function listQuery(kind, organizationId, query = {}) {
    const allowed = ['archive', 'limit', 'offset', 'status'];
    if (Object.keys(query).some((key) => !allowed.includes(key))) fail('Unsupported list filter.');
    const archive = query.archive || 'active';
    if (!['active', 'archived', 'all'].includes(archive)) fail('Archive filter must be active, archived or all.');
    const parse = (value, fallback, max) => {
      if (value == null) return fallback;
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) fail('Invalid pagination value.');
      return Number(value);
    };
    const limit = parse(query.limit, 50, 100); const offset = parse(query.offset, 0, 1000000);
    if (limit < 1) fail('Limit must be positive.');
    const where = { organizationId, ...(kind === 'grant' ? { isSample: false } : {}) };
    if (query.status) { if (!own(spec(kind).transitions, query.status)) fail('Unknown lifecycle status filter.'); where.status = query.status; }
    // All SQL identifiers and literals below are fixed server allowlist constants;
    // no user input is interpolated. The parent predicate and correlated org enforce isolation.
    if (kind === 'pathway') where.projectId = { [Op.in]: literal('(SELECT id FROM `CivicProject` AS fp WHERE fp.organization_id = `FundingPathway`.organization_id AND fp.is_sample = 0 AND fp.deleted_at IS NULL)') };
    if (archive !== 'all') {
      const alias = spec(kind).model;
      where.id = { [archive === 'archived' ? Op.in : Op.notIn]: literal(`(SELECT entity_id FROM funding_lifecycle_records AS fl WHERE fl.entity_type = '${kind}' AND fl.organization_id = \`${alias}\`.organization_id AND fl.archived_at IS NOT NULL)`) };
    }
    return { where, limit, offset, order: [['createdAt', 'DESC'], ['id', 'ASC']] };
  }
  async function mergeStates(kind, rows, organizationId) {
    if (!rows.length) return [];
    const states = await State.findAll({ where: { organizationId, entityType: kind, entityId: { [Op.in]: rows.map((row) => row.id) } } });
    const map = new Map(states.map((state) => [state.entityId, state]));
    return rows.map((row) => serializeFunding(kind, row, map.get(row.id)));
  }
  async function linkedDetails(data, organizationId) {
    const result = {};
    for (const [field, modelName, attributes] of [
      ['evidenceIds', 'EvidenceItem', ['id', 'title', 'evidenceType', 'externalUrl', 'isVerified']],
      ['workItemIds', 'WorkItem', ['id', 'title', 'status', 'dueDate']],
    ]) {
      const rows = data[field].length ? await models[modelName].findAll({ where: { organizationId, id: { [Op.in]: data[field] } }, attributes }) : [];
      result[field === 'evidenceIds' ? 'evidence' : 'workItems'] = rows.map((row) => {
        const value = plain(row);
        if (value.externalUrl) { try { value.externalUrl = safeFundingUrl(value.externalUrl); } catch { value.externalUrl = null; } }
        return value;
      });
      result[field === 'evidenceIds' ? 'unavailableEvidenceCount' : 'unavailableWorkCount'] = data[field].length - rows.length;
    }
    return result;
  }
  const handlers = {};
  for (const kind of ['grant', 'pathway']) {
    const suffix = kind === 'grant' ? 'Grant' : 'Pathway';
    handlers[`list${suffix}s`] = endpoint(async (req, res) => {
      const organizationId = await actor(req); const query = listQuery(kind, organizationId, req.query);
      // Also touch the sidecar when empty, so missing migration never looks like an empty workspace.
      await State.findOne({ where: { organizationId, entityType: kind }, attributes: ['id'] });
      const { rows, count } = await models[spec(kind).model].findAndCountAll(query);
      return res.json({ data: await mergeStates(kind, rows, organizationId), meta: { total: count, limit: query.limit, offset: query.offset } });
    });
    handlers[`get${suffix}`] = endpoint(async (req, res) => {
      const organizationId = await actor(req); const record = await findRecord(kind, req.params.id || req.params.grantId, organizationId);
      if (record.isSample) fail('Sample grants are not part of the manual workspace.', 404);
      const state = await findState(kind, record, organizationId);
      const data = serializeFunding(kind, record, state);
      const project = record.projectId ? await models.CivicProject.findOne({ where: { id: record.projectId, organizationId }, attributes: ['id', 'name'] }) : null;
      const owner = kind === 'grant' && record.leadId ? await models.User.findOne({ where: { id: record.leadId, organizationId }, attributes: ['id', 'firstName', 'lastName'] }) : null;
      const pathway = kind === 'grant' && record.fundingPathwayId ? await models.FundingPathway.findOne({ where: { id: record.fundingPathwayId, organizationId }, attributes: ['id', 'sourceName'] }) : null;
      return res.json({ data: { ...data, projectName: project?.name || null, ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null, pathwayName: pathway?.sourceName || null, ...(kind === 'grant' ? await linkedDetails(data, organizationId) : {}) } });
    });
    for (const operation of ['create', 'update', 'archive', 'reactivate']) handlers[`${operation}${suffix}`] = endpoint(async (req, res) => res.status(operation === 'create' ? 201 : 200).json({ data: await mutation(req, kind, operation) }));
    handlers[`export${suffix}s`] = endpoint(async (req, res) => {
      const organizationId = await actor(req);
      if (own(req.query || {}, 'limit') || own(req.query || {}, 'offset')) fail('CSV export does not accept pagination.');
      const query = listQuery(kind, organizationId, req.query);
      await State.findOne({ where: { organizationId, entityType: kind }, attributes: ['id'] });
      const { count, rows } = await models[spec(kind).model].findAndCountAll({ ...query, limit: 1000, offset: 0 });
      if (count > 1000) fail('Export is limited to 1000 records. Filter by lifecycle status or archive state before exporting.', 413, 'funding_export_limit');
      const data = await mergeStates(kind, rows, organizationId);
      res.set('Content-Type', 'text/csv; charset=utf-8'); res.set('Content-Disposition', `attachment; filename="civicpath-${kind}s.csv"`); res.set('Cache-Control', 'no-store');
      return res.send(fundingCsv(kind, data));
    });
  }
  handlers.options = endpoint(async (req, res) => {
    const organizationId = await actor(req);
    const configs = {
      projects: ['CivicProject', ['id', 'name', 'currencyCode'], { isSample: false }, 'name'],
      owners: ['User', ['id', 'firstName', 'lastName'], { status: 'active' }, 'firstName'],
      pathways: ['FundingPathway', ['id', 'sourceName', 'projectId', 'currencyCode'], {}, 'sourceName'],
      evidence: ['EvidenceItem', ['id', 'title', 'projectId', 'grantId'], {}, 'title'],
      work: ['WorkItem', ['id', 'title', 'projectId', 'grantId', 'status'], {}, 'title'],
    };
    if (Object.keys(req.query || {}).some((key) => !['kind', 'q'].includes(key)) || !own(configs, req.query?.kind)) fail('Choose a supported reference kind.');
    const [modelName, attributes, extra, searchField] = configs[req.query.kind];
    const q = req.query.q == null ? '' : text(req.query.q, 'Reference search', 100);
    const where = { organizationId, ...extra };
    if (req.query.kind === 'pathways') {
      where.projectId = { [Op.in]: literal('(SELECT id FROM `CivicProject` AS fp WHERE fp.organization_id = `FundingPathway`.organization_id AND fp.is_sample = 0 AND fp.deleted_at IS NULL)') };
      where.id = { [Op.notIn]: literal("(SELECT entity_id FROM funding_lifecycle_records AS fl WHERE fl.entity_type = 'pathway' AND fl.organization_id = `FundingPathway`.organization_id AND fl.archived_at IS NOT NULL)") };
    }
    if (q) where[searchField] = { [Op.like]: `%${q.replace(/[\\%_]/g, '\\$&')}%` };
    const { rows, count } = await models[modelName].findAndCountAll({ where, attributes, limit: 100, order: [[searchField, 'ASC'], ['id', 'ASC']] });
    return res.json({ data: rows.map(plain), meta: { total: count, limit: 100, truncated: count > 100 } });
  });
  handlers.grantHistory = endpoint(async (req, res) => {
    const organizationId = await actor(req); await findRecord('grant', req.params.id, organizationId);
    const rows = await models.AuditLog.findAll({ where: { organizationId, entityType: 'grant', entityId: req.params.id }, attributes: ['id', 'action', 'metadata', 'createdAt', 'userId'], limit: 100, order: [['createdAt', 'DESC'], ['id', 'DESC']] });
    // Legacy audits may contain unexpected metadata. Return only our known fields.
    return res.json({ data: rows.map((row) => { const value = plain(row); const metadata = value.metadata || {}; return { id: value.id, action: value.action, createdAt: value.createdAt, userId: value.userId, reason: metadata.reason || null, fromStatus: metadata.fromStatus || null, toStatus: metadata.toStatus || null, version: metadata.version ?? null }; }), meta: { limit: 100 } });
  });
  return handlers;
}
