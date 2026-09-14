/* CivicPath routes — System Admin is explicitly restricted to platform administrators. */
import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppShell } from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import PortfolioPage from './pages/PortfolioPage';
import FundingPage from './pages/FundingPage';
import GrantsPage from './pages/GrantsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import SystemAdminPage from './pages/SystemAdminPage';
import LoginPage from './pages/LoginPage';
import MfaPage from './pages/MfaPage';
import { AuthProvider, useAuth } from './features/AuthContext';

function Workspace({ children, platformOnly = false }) { const { state, user } = useAuth(); if (state === 'loading') return <div className="boot-screen"><img src="/gate-mark.png" alt=""/><span>Opening CivicPath workspace…</span></div>; if (state === 'mfa_pending') return <Navigate to="/mfa" replace/>; if (state !== 'authenticated') return <Navigate to="/login" replace/>; if (platformOnly && user?.role !== 'platform_admin') return <Navigate to="/dashboard" replace/>; return <AppShell>{children}</AppShell>; }

export default function App() { return <AuthProvider><BrowserRouter><Toaster position="top-right"/><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/mfa" element={<MfaPage/>}/><Route path="/dashboard" element={<Workspace><DashboardPage/></Workspace>}/><Route path="/portfolio" element={<Workspace><PortfolioPage/></Workspace>}/><Route path="/funding" element={<Workspace><FundingPage/></Workspace>}/><Route path="/grants" element={<Workspace><GrantsPage/></Workspace>}/><Route path="/reports" element={<Workspace><ReportsPage/></Workspace>}/><Route path="/settings" element={<Workspace><SettingsPage/></Workspace>}/><Route path="/admin" element={<Workspace platformOnly><SystemAdminPage/></Workspace>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></BrowserRouter></AuthProvider>; }
