import React, { useState } from 'react';
import { PeopleAccessPanel } from '../components/PeopleAccessPanel';
import { SupportContactPanel } from '../components/SupportContactPanel';
import { SubscriptionPanel } from '../components/SubscriptionPanel';
import { DataImportPanel, WorkspaceProfilePanel } from '../components/WorkspaceSetupPanel';
import { ContextualHelpLink } from '../components/RoleHelpPanel';
import { useAuth } from '../features/AuthContext';
import { getWorkspaceSettingsSections } from '../lib/workspaceSettings';

export default function SettingsPage() {
  const [section, setSection] = useState('general');
  const { user } = useAuth();
  const canManage = ['org_admin', 'portfolio_manager'].includes(user?.role);
  const isOrgAdmin = user?.role === 'org_admin';
  const nav = getWorkspaceSettingsSections(user?.role);

  return <main className="page-content settings-page"><section className="settings-header"><div><p className="page-intro">Set up the workspace in the way your Council already works. CivicPath can start small and remain clear; each section below is a functional control rather than a placeholder.</p><h2>Workspace settings</h2></div><ContextualHelpLink topic="workspace settings" label="Help with workspace setup"/></section><section className="settings-layout"><aside className="settings-nav" aria-label="Workspace settings sections">{nav.map(({ id, label }) => <button className={section === id ? 'selected' : ''} type="button" key={id} onClick={() => setSection(id)}>{label}</button>)}</aside><div className="settings-content">{section === 'general' && <><WorkspaceProfilePanel user={user}/><section className="settings-card integration-card"><div><p className="card-eyebrow">Product boundary</p><h3>GrantMaestro integration</h3><p className="card-copy">CivicPath is a standalone Council workspace. A GrantMaestro connection will only be introduced through a documented, Council-approved API boundary; no data is currently shared.</p></div><span className="integration-status">Not connected</span></section></>}{section === 'people' && isOrgAdmin && <PeopleAccessPanel/>}{section === 'imports' && <DataImportPanel canManage={canManage}/>} {section === 'billing' && <SubscriptionPanel/>}{section === 'support' && <SupportContactPanel/>}</div></section></main>;
}
