import { getWorkspaceSettingsSections, authorisedStrategyLink, quarterlyDraft } from './workspaceSettings';
const strategy = '11111111-1111-4111-8111-111111111111'; const action = '22222222-2222-4222-8222-222222222222'; const foreign = '33333333-3333-4333-8333-333333333333';
describe('Workspace settings role navigation', () => {
  const roles = ['org_admin', 'portfolio_manager', 'contributor', 'executive'];
  test.each(roles)('%s receives only authorised settings sections', (role) => {
    const sections = getWorkspaceSettingsSections(role).map((section) => section.id);
    expect(sections.includes('people')).toBe(role === 'org_admin');
    expect(sections.includes('data')).toBe(['org_admin', 'executive'].includes(role));
    expect(sections).toEqual(expect.arrayContaining(['general', 'imports', 'billing', 'support', 'notifications', 'archive']));
  });
  test.each(['platform_admin', 'unknown', undefined])('%s never receives Council settings', (role) => expect(getWorkspaceSettingsSections(role)).toEqual([]));
});
test('deep links require real UUIDs and membership in authenticated strategy/action choices', () => {
  const strategies = [{ id: strategy }]; const actions = [{ id: action, strategyId: strategy }];
  expect(authorisedStrategyLink(`?strategyId=${strategy}&actionId=${action}`, strategies, actions, strategy)).toEqual({ strategyId: strategy, actionId: action });
  expect(authorisedStrategyLink(`?strategyId=${foreign}&actionId=${action}`, strategies, actions, strategy)).toEqual({ strategyId: null, actionId: null });
  expect(authorisedStrategyLink(`?actionId=${foreign}`, strategies, actions, strategy).actionId).toBeNull();
  expect(authorisedStrategyLink('?strategyId=sample&actionId=sample', strategies, actions, strategy)).toEqual({ strategyId: null, actionId: null });
});
test('quarterly draft distinguishes strict zero new version and original recorded edit version', () => {
  const period = { id: strategy, label: 'Recorded quarter' }; const row = { id: action, status: 'on_track' };
  expect(quarterlyDraft(row, period).expectedVersion).toBe(0);
  const update = { reportingPeriodId: strategy, version: 7, achievements: 'Original evidence', status: 'complete' };
  expect(quarterlyDraft({ ...row, QuarterlyActionUpdates: [update] }, period)).toEqual(expect.objectContaining({ expectedVersion: 7, achievements: 'Original evidence', status: 'complete' }));
  expect(() => quarterlyDraft({ ...row, QuarterlyActionUpdates: [{ ...update, version: '7' }] }, period)).toThrow(/valid recorded version/);
});
