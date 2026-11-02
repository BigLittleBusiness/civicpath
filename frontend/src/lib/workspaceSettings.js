export function getWorkspaceSettingsSections(role) {
  const sections = [
    { id: 'general', label: 'General' },
  ];

  if (role === 'org_admin') {
    sections.push({ id: 'people', label: 'People & access' });
  }

  sections.push(
    { id: 'imports', label: 'Data imports' },
    { id: 'billing', label: 'Billing' },
    { id: 'support', label: 'Support' },
  );

  return sections;
}
