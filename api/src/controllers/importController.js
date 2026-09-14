import Joi from 'joi';
import { parseCsv } from '../utils/csv.js';
import { CivicProject, Grant, Priority } from '../models/index.js';
import { recordAudit } from '../services/audit.js';

const previewSchema = Joi.object({ entityType: Joi.string().valid('projects', 'grants').required(), csv: Joi.string().max(1024 * 1024).required() });
const commitSchema = Joi.object({ entityType: Joi.string().valid('projects', 'grants').required(), rows: Joi.array().min(1).max(1000).required() });

function asCurrency(value) { const result = Number(String(value || '').replace(/[^0-9.-]/g, '')); return Number.isFinite(result) ? result : null; }

export async function previewImport(req, res, next) {
  try {
    const { value, error } = previewSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    const { headers, rows } = parseCsv(value.csv);
    if (!rows.length) return res.status(422).json({ error: 'The file needs a header row and at least one data row.' });
    const required = value.entityType === 'projects' ? ['name'] : ['title', 'funder'];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) return res.status(422).json({ error: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` });
    return res.json({ data: { entityType: value.entityType, headers, rowCount: rows.length, preview: rows.slice(0, 8) } });
  } catch (error) { return next(error); }
}

export async function commitImport(req, res, next) {
  try {
    const { value, error } = commitSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    let created = 0; const skipped = []; const organizationId = req.tenant.organizationId;
    if (value.entityType === 'projects') {
      for (const [index, row] of value.rows.entries()) {
        if (!row.name) { skipped.push({ row: index + 2, reason: 'A project name is required.' }); continue; }
        let priorityId = null;
        if (row.priority) { const [priority] = await Priority.findOrCreate({ where: { organizationId, title: row.priority }, defaults: { organizationId, title: row.priority, outcomeArea: 'Imported priority' } }); priorityId = priority.id; }
        await CivicProject.create({ organizationId, priorityId, name: row.name, category: row.category || 'other', stage: row.stage || 'concept', estimatedCost: asCurrency(row.estimated_cost), targetFunding: asCurrency(row.target_funding), expectedJobs: Number(row.expected_jobs) || null, targetDate: row.target_date || null, isSample: false });
        created += 1;
      }
    } else {
      for (const [index, row] of value.rows.entries()) {
        if (!row.title || !row.funder) { skipped.push({ row: index + 2, reason: 'A grant title and funder are required.' }); continue; }
        await Grant.create({ organizationId, title: row.title, funder: row.funder, requestedAmount: asCurrency(row.requested_amount), status: row.status || 'identified', dueDate: row.due_date || null, acquittalDueDate: row.acquittal_due_date || null, isSample: false });
        created += 1;
      }
    }
    await recordAudit(req, { entityType: 'import', entityId: null, action: 'committed', metadata: { entityType: value.entityType, created, skipped: skipped.length } });
    return res.status(201).json({ data: { created, skipped, note: 'Imported records are stored only in the active organisation. The demonstration workspace is never copied into a customer organisation.' } });
  } catch (error) { return next(error); }
}

