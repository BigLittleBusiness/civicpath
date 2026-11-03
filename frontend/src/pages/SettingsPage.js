import React, { useState } from 'react';
import { PeopleAccessPanel } from '../components/PeopleAccessPanel';
import { SupportContactPanel } from '../components/SupportContactPanel';
import { SubscriptionPanel } from '../components/SubscriptionPanel';
import { DataImportPanel, WorkspaceProfilePanel } from '../components/WorkspaceSetupPanel';
import { NotificationPreferencesPanel } from '../components/NotificationPreferencesPanel';
import { NotificationInboxPanel } from '../components/NotificationInboxPanel';
import { ReliableNotificationDeliveryPanel } from '../components/ReliableNotificationDeliveryPanel';
import { TenantDataPanel } from '../components/TenantDataPanel';
import { ArchiveRecoveryPanel } from '../components/ArchiveRecoveryPanel';
import { ContextualHelpLink } from '../components/RoleHelpPanel';
import { useAuth } from '../features/AuthContext';
import { getWorkspaceSettingsSections } from '../lib/workspaceSettings';

export default function SettingsPage() {
  const [section, setSection] = useState('general');
  const { user } = useAuth();
  const canManage = ['org_admin', 'portfolio_manager'].includes(user?.role);
  const isOrgAdmin = user?.role === 'org_admin';
  const nav = getWorkspaceSettingsSections(user?.role);
  const current = nav.some(({ id }) => id === section) ? section : nav[0]?.id;
  if (!nav.length) return null;
  return <main className="page-content settings-page"><section className="settings-header"><div><p className="page-intro">Set up the workspace in the way your Council already works. Each section below uses recorded Council data and authorised controls.</p><h2>Workspace settings</h2></div><ContextualHelpLink topic="workspace settings" label="Help with workspace setup"/></section><section className="settings-layout"><aside className="settings-nav" aria-label="Workspace settings sections">{nav.map(({ id, label }) => <button className={current === id ? 'selected' : ''} type="button" key={id} onClick={() => setSection(id)}>{label}</button>)}</aside><div className="settings-content">
    {current === 'general' && <><WorkspaceProfilePanel user={user}/><section className="settings-card integration-card"><div><p className="card-eyebrow">Product boundary</p><h3>GrantMaestro integration</h3><p className="card-copy">A connection requires a documented, Council-approved API boundary. This settings panel does not connect or share Council data with GrantMaestro.</p></div></section></>}
    {current === 'people' && isOrgAdmin && <PeopleAccessPanel/>}
    {current === 'imports' && <DataImportPanel canManage={canManage}/>}
    {current === 'billing' && <SubscriptionPanel/>}
    {current === 'support' && <SupportContactPanel/>}
    {current === 'notifications' && <><NotificationInboxPanel role={user.role}/><NotificationPreferencesPanel role={user.role}/>{isOrgAdmin && <ReliableNotificationDeliveryPanel/>}</>}
    {current === 'data' && ['org_admin', 'executive'].includes(user.role) && <TenantDataPanel role={user.role}/>}
    {current === 'archive' && <ArchiveRecoveryPanel role={user.role}/>}
  </div></section></main>;
}
