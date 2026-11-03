export const GRANT_STATUSES = ['identified', 'assessing', 'preparing', 'submitted', 'awarded', 'contracted', 'acquitting', 'acquitted', 'not_successful', 'withdrawn'];
export const PATHWAY_STATUSES = ['watching', 'preparing', 'submitted', 'awarded', 'not_successful', 'closed'];
export const label = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
export const provenanceLabel = (value) => value === 'council_entered' ? 'Manually entered by Council' : 'Legacy record — origin not verified';
export function formatFundingAmount(value, currencyCode) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (!['AUD', 'NZD'].includes(currencyCode) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return 'Amount or currency unavailable';
  const [units, fraction = ''] = String(value).split('.');
  return `${currencyCode} $${units.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}
export function formatFundingDate(value) {
  if (!value) return 'Not recorded';
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'Date unavailable';
}
export function fundingPayload(kind, form, existing) {
  const fields = kind === 'grant'
    ? ['title', 'funder', 'projectId', 'fundingPathwayId', 'leadId', 'requestedAmount', 'awardedAmount', 'currencyCode', 'dueDate', 'acquittalDueDate', 'notes']
    : ['sourceName', 'sourceType', 'projectId', 'fit', 'potentialAmount', 'currencyCode', 'dueDate', 'note'];
  const optional = new Set(['projectId', 'fundingPathwayId', 'leadId', 'requestedAmount', 'awardedAmount', 'potentialAmount', 'dueDate', 'acquittalDueDate', 'sourceUrl']);
  const result = Object.fromEntries([...fields, 'sourceUrl', 'reason'].map((key) => [key, optional.has(key) && !form[key] ? null : form[key]]));
  if (existing) { result.version = existing.version; result.updatedAt = existing.updatedAt; result.status = form.status; }
  if (kind === 'grant') { result.evidenceIds = form.evidenceIds || []; result.workItemIds = form.workItemIds || []; }
  return result;
}
export function initialFundingForm(kind, currencyCode, record) {
  return {
    title: '', funder: '', sourceName: '', sourceType: 'grant', fit: 'possible', projectId: '', fundingPathwayId: '', leadId: '',
    requestedAmount: '', awardedAmount: '', potentialAmount: '', currencyCode, status: kind === 'grant' ? 'identified' : 'watching',
    dueDate: '', acquittalDueDate: '', notes: '', note: '', sourceUrl: '', evidenceIds: [], workItemIds: [],
    ...(record ? Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value == null ? '' : value])) : {}), reason: '',
  };
}
// Defense in depth for existing/manual links; API uses the stronger hostname allowlist.
export function safeReferenceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || /\s|\\/.test(value)) return null;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|lan|home|onion)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
