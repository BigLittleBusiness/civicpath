import React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { actions, benefitData, fundingVelocity, portfolioProjects, readinessData, stageData } from '../lib/demoData';
import { ChartCard } from '../components/ChartCard';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';

const money = (value) => value >= 1000000 ? `$${(value / 1000000).toFixed(1)}m` : `$${Math.round(value / 1000)}k`;

function Metric({ label, value, detail, signal }) { return <article className="metric-card"><p>{label}</p><strong>{value}</strong><span className={signal || ''}>{detail}</span></article>; }

const stageColours = { concept: '#d8a445', scoping: '#7c9292', business_case: '#49757a', funding_ready: '#178568', delivery: '#234c55' };
const stageLabels = { concept: 'Concept', scoping: 'Scoping', business_case: 'Business case', funding_ready: 'Funding ready', delivery: 'Delivery' };
const readinessPalette = [{ name: 'Funding-ready', color: '#178568' }, { name: 'In development', color: '#7c9292' }, { name: 'Early stage', color: '#d8a445' }];

function formatDate(value) { return value ? new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(new Date(value)) : 'No date'; }

function formatStage(value) { return stageLabels[value] || value?.replace(/_/g, ' ') || 'Unstaged'; }

function toDashboardData(payload) {
  if (!payload) return null;
  const projects = payload.projects.map((project) => ({ id: project.id, name: project.name, priority: 'Linked Council priority', stage: formatStage(project.stage), stageKey: project.stage, readiness: Number(project.readinessScore || 0), cost: Number(project.estimatedCost || 0), target: Number(project.targetFunding || 0), secured: Number(project.securedFunding || 0), risk: Number(project.readinessScore || 0) < 50 ? 'Watch' : 'On track' }));
  const readinessCounts = { 'Funding-ready': 0, 'In development': 0, 'Early stage': 0 };
  projects.forEach((project) => { readinessCounts[project.readiness >= 75 ? 'Funding-ready' : project.readiness >= 50 ? 'In development' : 'Early stage'] += 1; });
  const projectNames = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  return {
    ...payload,
    projects,
    readiness: readinessPalette.map((item) => ({ ...item, value: readinessCounts[item.name] })),
    stages: payload.stageMix.map((item) => ({ stage: stageLabels[item.stage] || item.stage, count: item.count, colour: stageColours[item.stage] || '#7c9292' })),
    benefits: [{ name: 'Jobs', value: payload.summary.expectedJobs }, { name: 'Projects', value: projects.length }, { name: 'Funding ready', value: payload.summary.fundingReadyCount }],
    actions: payload.workItems.map((item) => ({ id: item.id, type: item.workType.replace(/_/g, ' '), title: item.title, project: projectNames[item.projectId] || 'Council portfolio', due: formatDate(item.dueDate), priority: item.priority })),
    fundingSeries: payload.pathways.map((pathway) => ({ month: pathway.sourceName.length > 14 ? `${pathway.sourceName.slice(0, 13)}…` : pathway.sourceName, value: Math.round(Number(pathway.potentialAmount || 0) / 100000) / 10 })),
  };
}

export default function DashboardPage() {
  const [remoteData, setRemoteData] = useState(null);
  const [source, setSource] = useState('loading');
  useEffect(() => { let mounted = true; api.get('/dashboard/overview').then((response) => { if (mounted) { setRemoteData(response.data.data); setSource('live'); } }).catch(() => { if (mounted) setSource('sample'); }); return () => { mounted = false; }; }, []);
  const dashboard = useMemo(() => toDashboardData(remoteData), [remoteData]);
  const isLive = Boolean(dashboard);
  const projects = dashboard?.projects || portfolioProjects;
  const liveValue = dashboard?.summary.livePortfolioValue ?? portfolioProjects.reduce((total, project) => total + project.cost, 0);
  const fundingTarget = dashboard?.summary.fundingTarget ?? portfolioProjects.reduce((total, project) => total + project.target, 0);
  const fundingSecured = dashboard?.summary.securedFunding ?? 4200000;
  const fundingGap = dashboard?.summary.fundingGap ?? 3950000;
  const averageReadiness = dashboard?.summary.averageReadiness ?? 68;
  const fundingReadyCount = dashboard?.summary.fundingReadyCount ?? 2;
  const dashboardReadiness = dashboard?.readiness || readinessData;
  const dashboardStages = dashboard?.stages || stageData;
  const dashboardBenefits = dashboard?.benefits || benefitData;
  const dashboardActions = dashboard?.actions || actions;
  const dashboardFundingSeries = dashboard?.fundingSeries?.length ? dashboard.fundingSeries : fundingVelocity;
  return <main className="page-content dashboard-page">
    <div className="demo-banner"><span>{isLive ? 'Connected workspace' : source === 'loading' ? 'Loading workspace' : 'Demonstration workspace'}</span><p>{isLive ? 'Portfolio figures are drawn from this workspace. Demonstration records remain clearly marked until Council data is imported.' : 'All information shown is illustrative and can be replaced through data import or connection.'}</p><Link to="/settings">Workspace settings <Icon name="arrow" size={15}/></Link></div>
    <section className="metric-grid"><Metric label="Live portfolio value" value={money(liveValue)} detail={`${projects.length} priority projects`}/><Metric label="Funding sought" value={money(fundingTarget)} detail={`${dashboard?.pathways?.length || 4} active funding pathways`}/><Metric label="Funding secured" value={money(fundingSecured)} detail={`${fundingTarget ? Math.round((fundingSecured / fundingTarget) * 100) : 0}% of target portfolio`} signal="positive"/><Metric label="Average readiness" value={`${Math.round(averageReadiness)}%`} detail={`${fundingReadyCount} projects funding-ready`} signal="positive"/></section>
    <section className="dashboard-grid dashboard-grid-top"><ChartCard eyebrow="Portfolio signal" title="Funding position" action={<Link className="quiet-link" to="/funding">View pathways <Icon name="arrow" size={15}/></Link>}><div className="funding-summary"><div><span className="funding-dot sought"/><p>Funding sought</p><strong>{money(fundingTarget)}</strong></div><div><span className="funding-dot secured"/><p>Funding secured</p><strong>{money(fundingSecured)}</strong></div><div className="funding-gap"><p>Remaining pathway gap</p><strong>{money(fundingGap)}</strong><small>Across current project portfolio</small></div></div><div className="chart-box funding-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboardFundingSeries} margin={{ top: 10, right: 10, left: -24, bottom: 0 }}><defs><linearGradient id="funding" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#178568" stopOpacity={.33}/><stop offset="100%" stopColor="#178568" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#dce4e0" strokeDasharray="2 4" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#778581', fontSize: 11 }}/><YAxis tickFormatter={(v) => `$${v}m`} axisLine={false} tickLine={false} tick={{ fill: '#778581', fontSize: 11 }}/><Tooltip formatter={(v) => [`$${v}m`, 'Pathway value']} contentStyle={{ border: '1px solid #dce4e0', borderRadius: 7 }}/><Area type="monotone" dataKey="value" stroke="#178568" strokeWidth={2.5} fill="url(#funding)"/></AreaChart></ResponsiveContainer></div></ChartCard>
      <ChartCard eyebrow="Readiness mix" title="Where projects sit today" action={<Link className="quiet-link" to="/portfolio">Portfolio view <Icon name="arrow" size={15}/></Link>}><div className="donut-layout"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboardReadiness} dataKey="value" innerRadius={61} outerRadius={84} paddingAngle={3} stroke="none">{dashboardReadiness.map((item) => <Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="donut-centre"><strong>{projects.length}</strong><span>projects</span></div></div><div className="chart-legend">{dashboardReadiness.map((item) => <p key={item.name}><i style={{ background: item.color }}/><span>{item.name}</span><b>{item.value}</b></p>)}</div></div></ChartCard></section>
    <section className="dashboard-grid dashboard-grid-middle"><ChartCard eyebrow="Portfolio health" title="Projects by delivery stage"><div className="chart-box stage-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboardStages} margin={{ top: 12, right: 10, left: -24, bottom: 0 }}><CartesianGrid stroke="#dce4e0" strokeDasharray="2 4" vertical={false}/><XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: '#778581', fontSize: 11 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#778581', fontSize: 11 }}/><Tooltip cursor={{ fill: '#f2f5f3' }}/><Bar dataKey="count" radius={[5,5,0,0]}>{dashboardStages.map((item) => <Cell key={item.stage} fill={item.colour}/>)}</Bar></BarChart></ResponsiveContainer></div></ChartCard>
      <ChartCard eyebrow="Expected benefit" title="Portfolio outcomes"><div className="outcome-list"><div><span className="outcome-icon jobs">↗</span><p><b>{dashboard?.summary.expectedJobs ?? 85}</b><span>expected jobs supported</span></p></div><div><span className="outcome-icon funding">$</span><p><b>{money(fundingTarget)}</b><span>funding targeted</span></p></div><div><span className="outcome-icon ready">✓</span><p><b>{fundingReadyCount}</b><span>projects funding-ready</span></p></div></div><div className="benefit-chart"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={dashboardBenefits} margin={{ top: 6, right: 10, left: -10, bottom: 4 }}><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={92} axisLine={false} tickLine={false} tick={{ fill: '#778581', fontSize: 11 }}/><Tooltip/><Bar dataKey="value" fill="#234c55" radius={[0,5,5,0]} /></BarChart></ResponsiveContainer></div></ChartCard>
      <ChartCard eyebrow="Decision signal" title="Work that needs attention" action={<Link className="quiet-link" to="/portfolio">All actions <Icon name="arrow" size={15}/></Link>}><div className="attention-list">{dashboardActions.slice(0, 3).map((item) => <div className="attention-row" key={item.id}><span className={`type-chip ${item.type.toLowerCase().replace(' ', '-')}`}>{item.type}</span><div><b>{item.title}</b><small>{item.project} · Due {item.due}</small></div><span className={`priority-dot ${item.priority.toLowerCase()}`} /></div>)}</div></ChartCard></section>
    <section className="projects-panel"><div className="panel-heading"><div><p className="card-eyebrow">Live project register</p><h2>A clear route to the next move</h2></div><Link className="secondary-button" to="/portfolio">Open project portfolio <Icon name="arrow" size={16}/></Link></div><div className="project-table"><div className="project-table-head"><span>Project</span><span>Stage</span><span>Readiness</span><span>Funding position</span><span>Next signal</span></div>{projects.slice(0, 4).map((project) => <div className="project-table-row" key={project.id}><div><b>{project.name}</b><small>{project.priority}</small></div><span className="stage-pill">{project.stage}</span><div className="readiness-cell"><span><i style={{ width: `${project.readiness}%` }}/></span><b>{project.readiness}%</b></div><div><b>{money(project.secured)} secured</b><small>{money(project.target)} target</small></div><div className="risk-cell"><i className={project.risk.toLowerCase()}/><span>{project.risk} signal</span></div></div>)}</div></section>
  </main>;
}
