import { REPORT_BYTE_LIMIT, serializeReport, serializeSnapshot, reportCsv, reportHtml } from '../services/reportMetrics.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_ROLES = new Set(['org_admin', 'portfolio_manager', 'executive']);
const WRITE_ROLES = new Set(['org_admin', 'portfolio_manager']);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function boundedInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value) || Number(value) < 1 || Number(value) > max) fail(422, `Use a whole number between 1 and ${max}.`);
  return Number(value);
}
const id = (value) => { if (typeof value !== 'string' || !UUID.test(value)) fail(422, 'A valid record identifier is required.'); return value; };
const allowQuery = (query, keys) => { if (Object.keys(query || {}).some((key) => !keys.includes(key))) fail(422, 'Unsupported report query parameter.'); };

// No database imports: all security and transaction paths can run in Node tests without a DB.
export function createReportSnapshotController({ repository, transaction, audit, authorizeActor }) {
  async function access(req, write = false) {
    if (!req.auth?.sub || !req.auth?.organizationId || !req.tenant?.organizationId) fail(401, 'Authentication is required.');
    if (req.auth.organizationId !== req.tenant.organizationId) fail(403, 'Council access could not be confirmed.');
    const actor = await authorizeActor(req);
    if (!actor || actor.status !== 'active' || actor.id !== req.auth.sub || actor.organizationId !== req.tenant.organizationId) fail(401, 'Your session is no longer valid. Please sign in again.');
    if (!(write ? WRITE_ROLES : READ_ROLES).has(actor.role)) fail(403, 'You do not have permission to complete this report action.');
    return req.tenant.organizationId;
  }
  const handle = (fn) => async (req, res) => {
    try { res.set?.('Cache-Control', 'no-store'); await fn(req, res); }
    catch (error) {
      if (error.status && [401, 403, 404, 422, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
      // Do not forward Sequelize errors containing SQL/model values to the generic logger.
      return res.status(503).json({ error: 'Reporting is temporarily unavailable. No snapshot change was committed if its transaction failed. Refresh snapshot history before retrying a save; contact your administrator if this continues.' });
    }
  };
  async function scopePeriod(organizationId, periodId, tx, lock = false) {
    const period = await repository.period(organizationId, id(periodId), tx, lock);
    if (!period) fail(404, 'Reporting period not found.');
    const strategy = await repository.strategy(organizationId, period.strategyId, tx);
    if (!strategy) fail(404, 'Strategy not found.');
    return { period, strategy };
  }
  async function snapshot(req, organizationId) {
    const row = await repository.snapshot(organizationId, id(req.params.snapshotId));
    if (!row) fail(404, 'Report snapshot not found.');
    return row;
  }
  return {
    listStrategies: handle(async (req, res) => {
      const org = await access(req); allowQuery(req.query, ['limit', 'offset']);
      const limit = boundedInteger(req.query.limit, 50, 100); const offset = req.query.offset === undefined || req.query.offset === '0' ? 0 : boundedInteger(req.query.offset, 0, 10000);
      const result = await repository.strategies(org, limit + 1, offset);
      res.json({ data: result.slice(0, limit).map((s) => ({ id: s.id, name: s.name, status: s.status, reference: s.reference, version: s.version })), pagination: { limit, offset, hasMore: result.length > limit } });
    }),
    listPeriods: handle(async (req, res) => {
      const org = await access(req); allowQuery(req.query, ['limit', 'offset']);
      const strategy = await repository.strategy(org, id(req.params.strategyId)); if (!strategy) fail(404, 'Strategy not found.');
      const limit = boundedInteger(req.query.limit, 50, 100); const offset = req.query.offset === undefined || req.query.offset === '0' ? 0 : boundedInteger(req.query.offset, 0, 10000);
      const result = await repository.periods(org, strategy.id, limit + 1, offset);
      res.json({ data: result.slice(0, limit).map((p) => ({ id: p.id, strategyId: p.strategyId, label: p.label, startsOn: p.startsOn, endsOn: p.endsOn, status: p.status, financialYear: p.financialYear, quarter: p.quarter })), pagination: { limit, offset, hasMore: result.length > limit } });
    }),
    getLiveReport: handle(async (req, res) => {
      const org = await access(req); allowQuery(req.query, []);
      const report = await transaction(async (tx) => { const scope = await scopePeriod(org, req.params.periodId, tx); return repository.report(org, scope, tx); });
      res.json({ data: serializeReport(report) });
    }),
    listSnapshots: handle(async (req, res) => {
      const org = await access(req); allowQuery(req.query, ['limit', 'beforeVersion']);
      const { period } = await scopePeriod(org, req.params.periodId);
      const limit = boundedInteger(req.query.limit, 20, 50); const beforeVersion = req.query.beforeVersion === undefined ? undefined : boundedInteger(req.query.beforeVersion, undefined, 2147483647);
      const result = await repository.snapshots(org, period, limit + 1, beforeVersion);
      const page = result.slice(0, limit);
      res.json({ data: page.map((r) => serializeSnapshot(r)), pagination: { limit, hasMore: result.length > limit, nextBeforeVersion: result.length > limit ? page[page.length - 1]?.version : null } });
    }),
    createSnapshot: handle(async (req, res) => {
      const org = await access(req, true); allowQuery(req.query, []);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some((key) => key !== 'status') || (req.body.status !== undefined && req.body.status !== 'draft')) fail(422, 'Only a recorded draft snapshot may be created. Review and approval are not supported.');
      id(req.params.periodId);
      const result = await transaction(async (tx) => {
        // Period row lock serializes all snapshot writers for this period, including version allocation.
        const scope = await scopePeriod(org, req.params.periodId, tx, true);
        const content = serializeReport(await repository.report(org, scope, tx));
        if (Buffer.byteLength(JSON.stringify(content), 'utf8') > REPORT_BYTE_LIMIT) fail(422, 'Report exceeds the 2 MiB safe snapshot limit.');
        const lastVersion = await repository.maxVersion(org, scope.period, tx);
        const version = Number(lastVersion || 0) + 1;
        if (!Number.isSafeInteger(version) || version > 2147483647) fail(422, 'Snapshot version limit reached.');
        const row = await repository.createSnapshot({ organizationId: org, strategyId: scope.strategy.id, reportingPeriodId: scope.period.id, preparedBy: req.auth.sub, reportType: 'quarterly', version, status: 'draft', content, narrative: content.narrative }, tx);
        await audit(req, { entityType: 'strategy_report_snapshot', entityId: row.id, action: 'created', metadata: { periodId: scope.period.id, version, schemaVersion: 1 }, transaction: tx });
        return serializeSnapshot(row, true);
      });
      res.status(201).json({ data: result });
    }),
    getSnapshot: handle(async (req, res) => { const org = await access(req); allowQuery(req.query, []); res.json({ data: serializeSnapshot(await snapshot(req, org), true) }); }),
    downloadSnapshot: handle(async (req, res) => {
      const org = await access(req); allowQuery(req.query, ['format']);
      const format = req.query.format || 'json'; if (!['json', 'csv', 'html'].includes(format)) fail(422, 'Choose JSON, CSV or HTML. Use browser print to save HTML as PDF.');
      const result = serializeSnapshot(await snapshot(req, org), true);
      const filename = `civicpath-report-${result.id}-v${result.version}.${format}`;
      res.set('Content-Disposition', `attachment; filename="${filename}"`); res.set('X-Content-Type-Options', 'nosniff');
      if (format === 'json') return res.type('application/json').send(JSON.stringify(result, null, 2));
      if (format === 'csv') return res.type('text/csv; charset=utf-8').send(reportCsv(result.content, result));
      // Downloaded HTML is self-contained, text escaped and has no network resources.
      return res.type('text/html; charset=utf-8').send(reportHtml(result.content, result));
    }),
  };
}
