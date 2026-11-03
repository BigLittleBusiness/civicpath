import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
import { ContributionRequestControls, DependencyHandoverControls, QuarterlyUpdateWorkflow, ReviewPackDetail } from '../components/ReviewWorkflowPanel';
import '../components/collaboration.css';

const date = (value) => value ? new Date(value).toLocaleDateString('en-AU') : 'No date';
const words = (value) => String(value || '').replace(/_/g, ' ');

export default function CollaborationPage() {
  const { user } = useAuth(); const canManage = ['org_admin', 'portfolio_manager'].includes(user?.role);
  const [work, setWork] = useState(null); const [workspace, setWorkspace] = useState(null); const [packs, setPacks] = useState([]);
  const [busy, setBusy] = useState(false); const [errorMessage, setErrorMessage] = useState(''); const [selectedPack, setSelectedPack] = useState(null);
  const load = useCallback(async () => {
    setBusy(true); setErrorMessage('');
    try {
      const [workResponse, workspaceResponse] = await Promise.all([api.get('/collaboration/my-work'), api.get('/strategy-workspace')]);
      const nextWorkspace = workspaceResponse.data.data; setWork(workResponse.data.data); setWorkspace(nextWorkspace);
      const packResponse = await api.get(`/review-packs${nextWorkspace.selectedStrategy?.id ? `?strategyId=${nextWorkspace.selectedStrategy.id}` : ''}`); setPacks(packResponse.data.data);
    } catch (error) { setErrorMessage(error.response?.data?.error || 'Could not load collaboration. Refresh to retry.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const createPack = async (template) => {
    const strategy = workspace?.selectedStrategy; if (!strategy || busy) return;
    setBusy(true);
    const report = workspace.report || {};
    const sourceRows = [
      ...(report.decisions || []).map((item) => ({ resourceType: 'decision', resourceId: item.id, category: 'Decision required' })),
      ...(report.criticalDependencies || []).map((item) => ({ resourceType: 'dependency', resourceId: item.id, category: 'Critical dependency' })),
      ...(report.risks || []).map((item) => ({ resourceType: 'risk', resourceId: item.id, category: 'Risk or issue' })),
      ...(report.updates || []).map((item) => ({ resourceType: 'quarterly_update', resourceId: item.id, category: 'Included update' })),
    ].slice(0, 60);
    try {
      const result = await api.post('/review-packs', { strategyId: strategy.id, reportingPeriodId: workspace.reportingPeriods?.find((item) => item.status === 'open')?.id || null, ownerId: user.id, template, title: `${words(template)} review · ${strategy.name}`, purpose: 'Review delivery position, evidence and decisions.', desiredOutcome: 'Confirm decisions and owned follow-up actions.', executiveSummary: report.narrative || null, audience: 'Internal Council delivery and leadership team', items: sourceRows });
      toast.success('Internal Review Pack created.'); setSelectedPack(result.data.data.id); await load();
    } catch (error) { toast.error(error.response?.data?.error || 'Review Pack could not be created.'); }
    finally { setBusy(false); }
  };
  const team = workspace?.teamMembers || [];
  const updates = [...new Map([...(work?.reviews || []), ...(work?.authoredUpdates || [])].map((update) => [update.id, update])).values()];
  return <main className="page-content collaboration-page">
    <section className="settings-header"><div><p className="page-intro">Internal Council requests, review and accountable follow-through. No public sharing or external partner access is created.</p><h2>My collaboration</h2></div><button className="secondary-button" type="button" disabled={busy} onClick={load}>{busy ? 'Loading…' : 'Refresh'}</button></section>
    {errorMessage && <p role="alert">{errorMessage}</p>}{user?.role === 'executive' && <p>Executive access is read-only. You can inspect meeting trails, but cannot respond, endorse or include updates.</p>}
    <section className="collaboration-grid">
      <section className="collaboration-card"><h3>Requests and acceptance</h3>{work?.requests?.length ? work.requests.map((item) => <article key={item.id}><b>{item.title}</b><small>{words(item.requestType)} · {words(item.status)} · due {date(item.dueDate)}</small><ContributionRequestControls request={item} onChanged={load}/></article>) : <p>No actionable requests.</p>}</section>
      <section className="collaboration-card"><h3>Dependency handovers</h3>{work?.handovers?.length ? work.handovers.map((item) => <article key={item.id}><DependencyHandoverControls dependency={item} team={team} onChanged={load}/></article>) : <p>No handovers awaiting your response.</p>}</section>
    </section>
    <section className="collaboration-card collaboration-wide"><h3>Quarterly submission, review and inclusion</h3><p>Approval applies to an exact narrative version. Editing or withdrawing clears approval and report inclusion; immutable snapshots remain unchanged.</p><div className="collaboration-grid">{updates.length ? updates.map((item) => <article key={item.id}><QuarterlyUpdateWorkflow update={item} team={team} onChanged={load}/></article>) : <p>No authored updates or assigned reviews.</p>}</div></section>
    <section className="collaboration-card collaboration-wide"><h3>My owned meeting outcomes</h3>{work?.ownedOutcomes?.length ? work.ownedOutcomes.map((item) => <article key={item.id}><b>{item.outcome}</b><p>{words(item.outcomeType)} · due {date(item.dueDate)} · {item.ReviewPack?.title}</p><button type="button" onClick={() => setSelectedPack(item.reviewPackId)}>Inspect outcome and source in Review Pack</button></article>) : <p>No meeting outcomes assigned to you.</p>}</section>
    <section className="collaboration-card collaboration-wide"><div className="subsection-heading"><div><h3>Internal Review Packs</h3><p>Sources are explicitly live previews, not frozen meeting snapshots. Questions and owned outcomes preserve the meeting trail.</p></div>{canManage && <div className="strategy-link-actions">{['weekly_delivery', 'monthly_leadership', 'quarterly_executive'].map((template) => <button key={template} type="button" disabled={busy || !workspace?.selectedStrategy} onClick={() => createPack(template)}>+ {words(template)}</button>)}</div>}</div>
      <div className="collaboration-list">{packs.length ? packs.map((item) => <article key={item.id}><b>{item.title}</b><small>{words(item.status)} · internal only · {item.ReviewPackItems?.length || 0} live sources</small><button type="button" onClick={() => setSelectedPack(item.id)}>Open Review Pack</button></article>) : <p>No Review Packs for this strategy.</p>}</div>
    </section>
    {selectedPack && <ReviewPackDetail key={selectedPack} packId={selectedPack} team={team} onChanged={load} onClose={() => setSelectedPack(null)}/>}
    <section className="collaboration-grid"><section className="collaboration-card"><h3>My watch list</h3>{work?.watches?.length ? work.watches.map((item) => <p key={item.id}>{words(item.resourceType)} · {words(item.deliveryPreference)}</p>) : <p>No watched records.</p>}</section><section className="collaboration-card"><h3>Recent internal notifications</h3>{work?.notifications?.length ? work.notifications.slice(0, 10).map((item) => <article key={item.id}><b>{item.title}</b><p>{item.detail} · {date(item.createdAt)}</p></article>) : <p>No notifications.</p>}</section></section>
  </main>;
}
