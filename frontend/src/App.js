/* CivicPath routes — platform operations never inherit Council entitlement. */
import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppShell } from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import PortfolioPage from './pages/PortfolioPage';
import FundingPage from './pages/FundingPage';
import GrantsPage from './pages/GrantsPage';
import ReportsPage from './pages/ReportsPage';
import StrategyDeliveryPage from './pages/StrategyDeliveryPage';
import CollaborationPage from './pages/CollaborationPage';
import SettingsPage from './pages/SettingsPage';
import SystemAdminPage from './pages/SystemAdminPage';
import HelpGuidancePage from './pages/HelpGuidancePage';
import LoginPage from './pages/LoginPage';
import MfaPage from './pages/MfaPage';
import PortfolioReadinessPulsePage from './pages/PortfolioReadinessPulsePage';
import PulsePrivacyNoticePage from './pages/PulsePrivacyNoticePage';
import RegistrationPage from './pages/RegistrationPage';
import { ForgotPasswordPage, RegistrationSuccessPage, ResetPasswordPage } from './pages/PasswordRecoveryPages';
import InvitationAcceptancePage from './pages/InvitationAcceptancePage';
import PublicContactPage from './pages/PublicContactPage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
import { RouteAnnouncer } from './components/AccessibilityAids';
import { ProjectMaintenancePanel } from './components/ProjectMaintenancePanel';
import { ArchiveRecoveryPanel } from './components/ArchiveRecoveryPanel';
import { SubscriptionPanel } from './components/SubscriptionPanel';
import { TenantDataPanel } from './components/TenantDataPanel';
import { AuthProvider, useAuth } from './features/AuthContext';

export function Workspace({ children, platformOnly = false, allowPlatform = false }) {
  const { state, user, signOut } = useAuth();
  if (state === 'loading') return <div className="boot-screen"><img src="/civicpath-quartermark.png" alt=""/><span>Opening CivicPath workspace…</span></div>;
  if (state === 'mfa_pending') return <Navigate to="/mfa" replace/>;
  if (state !== 'authenticated') return <Navigate to="/login" replace/>;
  const platform = user?.role === 'platform_admin';
  if (platformOnly && !platform) return <Navigate to="/dashboard" replace/>;
  if (platform && !platformOnly && !allowPlatform) return <Navigate to="/admin" replace/>;
  if (!platform && ((!['org_admin', 'portfolio_manager', 'contributor', 'executive'].includes(user?.role)) || (user?.status && user.status !== 'active') || (user?.organisationStatus && !['trial', 'active'].includes(user.organisationStatus)))) {
    return <main className="page-content"><h1>Workspace access unavailable</h1><p>This account or Council workspace is not active. Subscription recovery cannot bypass suspension. Contact CivicPath through the public contact form.</p><a href="/contact">Contact CivicPath</a><button type="button" onClick={signOut}>Sign out</button></main>;
  }
  const ended = !platform && user?.accessActive === false;
  return <AppShell key={`${user?.organizationId}:${user?.id}:${user?.role}`}><RouteAnnouncer/>{ended ? <main className="page-content settings-page"><h2>Workspace subscription access has ended</h2><p>The active register is unavailable. Your organisation administrator can manage billing and recover Council data while the Council remains unsuspended.</p><SubscriptionPanel/>{user.role === 'org_admin' && <TenantDataPanel role={user.role}/>}</main> : children}</AppShell>;
}

function PortfolioWorkspace() {
  const { user } = useAuth();
  const [revision, setRevision] = React.useState(0);
  return <><PortfolioPage key={revision} renderProjectMaintenance={({ project, onUpdated }) => <ProjectMaintenancePanel key={project.id} project={project} enabled onChanged={onUpdated}/>}/><div className="page-content"><ArchiveRecoveryPanel role={user?.role} onRestored={() => setRevision((current) => current + 1)}/></div></>;
}

export default function App() {
  return <AuthProvider><BrowserRouter><Toaster position="top-right"/><Routes>
    <Route path="/portfolio-readiness-pulse" element={<PortfolioReadinessPulsePage/>}/><Route path="/portfolio-readiness-pulse/privacy" element={<PulsePrivacyNoticePage/>}/><Route path="/contact" element={<PublicContactPage/>}/><Route path="/terms" element={<TermsPage/>}/><Route path="/privacy" element={<PrivacyPage/>}/><Route path="/register" element={<RegistrationPage/>}/><Route path="/registration/success" element={<RegistrationSuccessPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/accept-invitation" element={<InvitationAcceptancePage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/mfa" element={<MfaPage/>}/>
    <Route path="/dashboard" element={<Workspace><DashboardPage/></Workspace>}/><Route path="/strategy-delivery" element={<Workspace><StrategyDeliveryPage/></Workspace>}/><Route path="/collaboration" element={<Workspace><CollaborationPage/></Workspace>}/><Route path="/portfolio" element={<Workspace><PortfolioWorkspace/></Workspace>}/><Route path="/funding" element={<Workspace><FundingPage/></Workspace>}/><Route path="/grants" element={<Workspace><GrantsPage/></Workspace>}/><Route path="/reports" element={<Workspace><ReportsPage/></Workspace>}/><Route path="/settings" element={<Workspace><SettingsPage/></Workspace>}/><Route path="/help" element={<Workspace allowPlatform><HelpGuidancePage/></Workspace>}/><Route path="/admin" element={<Workspace platformOnly><SystemAdminPage/></Workspace>}/><Route path="/system-admin" element={<Navigate to="/admin" replace/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/>
  </Routes></BrowserRouter></AuthProvider>;
}
