import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from './Icon';

const navItems = [
  ['/dashboard', 'Overview', 'grid'], ['/portfolio', 'Project portfolio', 'folder'], ['/funding', 'Funding pathways', 'fund'], ['/grants', 'Grant lifecycle', 'check'], ['/reports', 'Reports', 'report'],
];

export function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const label = navItems.find(([path]) => location.startsWith(path))?.[1] || 'Overview';
  return <div className={collapsed ? 'app-shell is-collapsed' : 'app-shell'}>
    <aside className="side-rail">
      <div className="rail-brand"><img src="/gate-mark.png" alt=""/><span>CivicPath</span></div>
      <button className="workspace-switcher" type="button"><span className="workspace-mark">CD</span><span><b>Demonstration<br/>Council</b><small>Illustrative sample data</small></span><Icon name="chevron" size={15}/></button>
      <nav className="main-nav" aria-label="Application navigation">{navItems.map(([path, name, icon]) => <NavLink key={path} to={path} className={({ isActive }) => isActive ? 'is-active' : ''}><Icon name={icon}/><span>{name}</span></NavLink>)}</nav>
      <div className="rail-footer"><NavLink to="/settings"><Icon name="settings"/><span>Workspace settings</span></NavLink><button type="button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><span className="collapse-icon">‹</span><span>Collapse</span></button><div className="rail-user"><div>JR</div><span><b>Jordan Reid</b><small>Portfolio Manager</small></span></div></div>
    </aside>
    <div className="application"><header className="app-header"><div><p className="crumb">CivicPath / <span>{label}</span></p><h1>{label}</h1></div><div className="header-actions"><button className="icon-button" type="button" aria-label="Search"><Icon name="search"/></button><button className="icon-button notification" type="button" aria-label="Notifications"><Icon name="bell"/><i /></button><button className="period-select" type="button">This financial year <span>⌄</span></button></div></header>{children}</div>
  </div>;
}
