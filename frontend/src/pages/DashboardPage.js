import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { ChartCard } from '../components/ChartCard';
import { Icon } from '../components/Icon';
import { SetupChecklist } from '../components/WorkspaceSetupPanel';
import { TopHelpPanel } from '../components/RoleHelpPanel';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
import { dashboardData, isDemoWorkspace, requireRows, workspaceKey } from '../lib/trustData.mjs';

const money = (value) => value === null || value === undefined ? 'Unavailable' : value >= 1000000 ? `$${(value / 1000000).toFixed(1)}m` : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
function Metric({ label, value, detail }) { return <article className="metric-card"><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>; }
function EmptyChart({ children }) { return <p className="card-copy" role="status">{children}</p>; }
function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : 'No date recorded';
}

export default function DashboardPage() {
  const { user } = useAuth(); const key = workspaceKey(user); const isDemo = isDemoWorkspace(user);
  const [state, setState] = useState({ key: null, status: 'loading', dashboard: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let mounted = true; setState({ key, status: 'loading', dashboard: null });
    if (!key) return () => { mounted = false; };
    // Overview currently caps projects at 8 and maps absent assessments to 0. Use the
    // complete project register for metrics and genuine latest-assessment provenance.
    Promise.all([api.get('/dashboard/overview'), api.get('/projects')]).then(([overview, projectResponse]) => {
      const records = requireRows(projectResponse.data.data);
      if (records.some((project) => project.organizationId !== user.organizationId)) throw new Error('Workspace boundary mismatch');
      const dashboard = dashboardData(overview.data.data, records);
      if (mounted) setState({ key, status: 'success', dashboard });
    }).catch(() => { if (mounted) setState({ key, status: 'error', dashboard: null }); });
    return () => { mounted = false; };
  }, [key, reload, user?.organizationId]);
  const status = state.key === key ? state.status : 'loading';
  const dashboard = state.key === key && status === 'success' ? state.dashboard : null;
  const projects = dashboard?.projects || [];
  const summary = dashboard?.summary;
  const fundingTarget = summary?.fundingTarget ?? null;
  const secured = summary?.securedFunding ?? null;
  const emptyMessage = status === 'error' ? 'Workspace data unavailable. Retry loading to verify this chart.' : status === 'loading' ? 'Loading workspace data…' : 'No project records yet. Add or import a project to populate this view.';
  return <main className="page-content dashboard-page">
    <div className="demo-banner"><span>{isDemo ? 'Demonstration workspace · illustrative records' : status === 'success' ? 'Connected Council workspace' : status === 'loading' ? 'Loading Council workspace' : 'Council workspace unavailable'}</span><p>{isDemo ? 'This tenant is explicitly designated as a demonstration. Figures come only from its stored records, not substituted examples.' : 'Only this Council’s saved records are used. Empty and unavailable data is never replaced with demonstration figures.'}</p><Link to="/settings">Workspace settings <Icon name="arrow" size={15}/></Link></div>
    {status === 'error' && <div role="alert"><p className="card-copy">The dashboard could not be verified. Figures and charts are unavailable, not zero and not examples.</p><button className="secondary-button" type="button" onClick={() => setReload((value) => value + 1)}>Retry loading dashboard</button></div>}
    {status === 'loading' && <p role="status" className="card-copy">Loading the current workspace…</p>}
    <SetupChecklist projectCount={dashboard ? projects.length : null} strategyCount={summary?.strategyCount ?? null}/>
    <TopHelpPanel role={user?.role}/>
    <section className="metric-grid"><Metric label={isDemo ? 'Demo portfolio value' : 'Recorded portfolio value'} value={money(summary?.livePortfolioValue)} detail={dashboard ? `${projects.length} recorded projects · known estimates only` : 'Project totals not verified'}/><Metric label="Funding sought" value={money(fundingTarget)} detail={dashboard ? `${dashboard.pathways.length} recorded funding pathways` : 'Funding pathways not verified'}/><Metric label="Funding secured" value={money(secured)} detail={dashboard ? fundingTarget > 0 ? `${Math.round(secured / fundingTarget * 100)}% of recorded target` : 'No funding target recorded' : 'Funding not verified'}/><Metric label="Average assessed readiness" value={summary?.averageReadiness !== null && summary?.averageReadiness !== undefined ? `${Math.round(summary.averageReadiness)}%` : dashboard ? 'Not assessed' : 'Unavailable'} detail={dashboard ? `${dashboard.assessedCount} assessed of ${projects.length} projects` : 'Assessments not verified'}/></section>
    {dashboard?.missingAmounts && <p className="data-note">Totals include recorded amounts only. Some cost, funding or expected-jobs fields are not recorded; a total of $0 is not a confirmation that every amount has been supplied.</p>}
    {dashboard && !projects.length && <p role="status" className="card-copy">No projects are recorded. Portfolio totals are $0; readiness has not been assessed. Start with the project register or import in Workspace settings.</p>}
    <section className="dashboard-grid dashboard-grid-top">
      <ChartCard eyebrow="Recorded funding snapshot" title="Funding position" action={<Link className="quiet-link" to="/funding">View pathways <Icon name="arrow" size={15}/></Link>}>
        <div className="funding-summary"><div><span className="funding-dot sought"/><p>Funding sought</p><strong>{money(fundingTarget)}</strong></div><div><span className="funding-dot secured"/><p>Funding secured</p><strong>{money(secured)}</strong></div><div className="funding-gap"><p>Remaining target gap</p><strong>{money(summary?.fundingGap)}</strong><small>Recorded target less secured funding</small></div></div>
        {dashboard?.fundingSeries.length ? <><p className="data-note">Potential amount by funding source ($m). This is a current snapshot, not an award history or monthly trend.</p><div className="chart-box funding-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.fundingSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}><CartesianGrid stroke="#D8E2DF" strokeDasharray="2 4" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#60716D', fontSize: 11 }}/><YAxis tickFormatter={(value) => `$${value}m`} axisLine={false} tickLine={false}/><Tooltip formatter={(value) => [`$${value}m`, 'Recorded potential amount']}/><Bar dataKey="value" fill="#0D6A55" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div></> : <EmptyChart>{dashboard ? 'No funding pathways with a recorded potential amount. No funding history is available.' : emptyMessage}</EmptyChart>}
      </ChartCard>
      <ChartCard eyebrow="Recorded readiness mix" title="Where projects sit today" action={<Link className="quiet-link" to="/portfolio">Portfolio view <Icon name="arrow" size={15}/></Link>}>
        {projects.length ? <div className="donut-layout"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboard.readiness} dataKey="value" innerRadius={61} outerRadius={84} paddingAngle={3} stroke="none">{dashboard.readiness.map((item) => <Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="donut-centre"><strong>{projects.length}</strong><span>projects</span></div></div><div className="chart-legend">{dashboard.readiness.map((item) => <p key={item.name}><i style={{ background: item.color }}/><span>{item.name}</span><b>{item.value}</b></p>)}</div></div> : <EmptyChart>{emptyMessage}</EmptyChart>}
      </ChartCard>
    </section>
    <section className="dashboard-grid dashboard-grid-middle">
      <ChartCard eyebrow="Portfolio stages" title="Projects by delivery stage">{projects.length ? <div className="chart-box stage-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.stages} margin={{ top: 12, right: 10, left: -24, bottom: 0 }}><CartesianGrid stroke="#D8E2DF" strokeDasharray="2 4" vertical={false}/><XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: '#60716D', fontSize: 11 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="count" fill="#0D6A55" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div> : <EmptyChart>{emptyMessage}</EmptyChart>}</ChartCard>
      <ChartCard eyebrow="Recorded expected benefit" title="Portfolio outcomes"><div className="outcome-list"><div><span className="outcome-icon jobs">↗</span><p><b>{summary?.expectedJobs ?? 'Unavailable'}</b><span>recorded expected jobs</span></p></div><div><span className="outcome-icon funding">$</span><p><b>{money(fundingTarget)}</b><span>recorded funding target</span></p></div><div><span className="outcome-icon ready">✓</span><p><b>{summary?.fundingReadyCount ?? 'Unavailable'}</b><span>projects in funding-ready stage</span></p></div></div>{projects.length ? <div className="benefit-chart"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={dashboard.benefits} margin={{ top: 6, right: 10, left: -10, bottom: 4 }}><XAxis type="number" allowDecimals={false} hide/><YAxis dataKey="name" type="category" width={92} axisLine={false} tickLine={false} tick={{ fill: '#60716D', fontSize: 11 }}/><Tooltip/><Bar dataKey="value" fill="#163133" radius={[0, 5, 5, 0]}/></BarChart></ResponsiveContainer></div> : <EmptyChart>{emptyMessage}</EmptyChart>}</ChartCard>
      <ChartCard eyebrow="Recorded decision signal" title="Overdue work that needs attention" action={<Link className="quiet-link" to="/portfolio">Project work <Icon name="arrow" size={15}/></Link>}><div className="attention-list">{dashboard?.actions.length ? dashboard.actions.slice(0, 3).map((item) => <div className="attention-row" key={item.id}><span className="type-chip">{item.type}</span><div><b>{item.title}</b><small>{item.project} · Due {formatDate(item.dueDate)}</small></div><span className={`priority-dot ${['low', 'medium', 'high', 'critical'].includes(item.priority) ? item.priority : 'medium'}`} /></div>) : <EmptyChart>{dashboard ? 'No overdue open work returned by the workspace overview.' : emptyMessage}</EmptyChart>}</div></ChartCard>
    </section>
    <section className="projects-panel"><div className="panel-heading"><div><p className="card-eyebrow">{isDemo ? 'Demonstration project register' : 'Recorded project register'}</p><h2>A clear route to the next move</h2></div><Link className="secondary-button" to="/portfolio">Open project portfolio <Icon name="arrow" size={16}/></Link></div><p className="data-note">{dashboard ? `Showing ${Math.min(4, projects.length)} of ${projects.length} projects. Readiness uses the latest recorded assessment, not an inferred risk rating.` : 'Project register not yet verified.'}</p><div className="project-table"><div className="project-table-head"><span>Project</span><span>Stage</span><span>Readiness</span><span>Funding position</span><span>Assessment signal</span></div>{projects.slice(0, 4).map((project) => <div className="project-table-row" key={project.id}><div><b>{project.name}</b><small>{project.priority}</small></div><span className="stage-pill">{project.stage}</span><div className="readiness-cell">{project.readiness !== null && <span aria-hidden="true"><i style={{ width: `${project.readiness}%` }}/></span>}<b>{project.readiness === null ? 'Not assessed' : `${project.readiness}%`}</b></div><div><b>{project.secured === null ? 'Secured not recorded' : `${money(project.secured)} secured`}</b><small>{project.target === null ? 'Target not recorded' : `${money(project.target)} target`}</small></div><div className="risk-cell"><span>{project.readiness === null ? 'Needs assessment' : 'Recorded assessment'}</span></div></div>)}</div>{!projects.length && <EmptyChart>{emptyMessage}</EmptyChart>}</section>
  </main>;
}
