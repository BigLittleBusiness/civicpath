export const councilRoles = ['org_admin', 'portfolio_manager', 'contributor', 'executive'];
export function getWorkspaceSettingsSections(role) {
  if (!councilRoles.includes(role)) return [];
  const sections = [{ id: 'general', label: 'General' }];
  if (role === 'org_admin') sections.push({ id: 'people', label: 'People & access' });
  sections.push({ id: 'notifications', label: 'Notifications' }, { id: 'archive', label: 'Archived records' });
  if (['org_admin', 'executive'].includes(role)) sections.push({ id: 'data', label: 'Data ownership & recovery' });
  sections.push({ id: 'imports', label: 'Data imports' }, { id: 'billing', label: 'Billing' }, { id: 'support', label: 'Support' });
  return sections;
}
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// URL IDs are hints only. Membership in the authenticated API register is mandatory.
export function authorisedStrategyLink(search, strategies, actions, selectedStrategyId) {
  const params = new URLSearchParams(search);
  const strategyId = params.get('strategyId'); const actionId = params.get('actionId');
  const strategy = uuid(strategyId) && strategies.some((item) => item.id === strategyId) ? strategyId : null;
  const action = uuid(actionId) && (!strategyId || strategy === selectedStrategyId) && actions.some((item) => item.id === actionId && (!item.strategyId || item.strategyId === selectedStrategyId)) ? actionId : null;
  return { strategyId: strategy, actionId: action };
}
export function quarterlyDraft(action, period) {
  const update = (action?.QuarterlyActionUpdates || []).find((item) => item.reportingPeriodId === period?.id);
  if (update && (!Number.isInteger(update.version) || update.version < 1)) throw new Error('Reload this update to obtain a valid recorded version before editing.');
  return { actionId: action.id, periodId: period.id, periodLabel: period.label,
    expectedVersion: update ? update.version : 0,
    status: update?.status || action.status, movement: update?.movement || 'no_change',
    ...Object.fromEntries(['achievements', 'evidenceSummary', 'riskSummary', 'decisionsRequired', 'nextQuarterCommitments'].map((field) => [field, update?.[field] || ''])) };
}
