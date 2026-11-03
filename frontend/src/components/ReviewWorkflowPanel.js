import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
import './collaboration.css';

const managers = ['org_admin', 'portfolio_manager'];
const writers = [...managers, 'contributor'];
const words = (value) => String(value || '').replace(/_/g, ' ');
const name = (user) => user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Council user';
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const date = (value) => value ? new Date(value).toLocaleDateString('en-AU') : 'No date';

function useMutation(onChanged) {
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const send = async (method, path, body) => {
    if (busy) return false;
    setBusy(true); setNotice('');
    try {
      await api[method](path, body);
      setNotice('Saved.');
      if (onChanged) await onChanged();
      return true;
    } catch (error) {
      const message = error.response?.data?.error || 'Could not save. Check your connection and try again.';
      setNotice(error.response?.status === 409 ? `${message} Your entered text is retained. Refresh and compare before trying again.` : message);
      return false;
    } finally { setBusy(false); }
  };
  return { busy, notice, send };
}
const Notice = ({ children }) => children ? <p role="status" aria-live="polite" className="collaboration-notice">{children}</p> : null;

export function ContributionRequestControls({ request, onChanged }) {
  const { user } = useAuth(); const [response, setResponse] = useState('');
  const { busy, notice, send } = useMutation(onChanged);
  const manager = managers.includes(user?.role); const writable = writers.includes(user?.role);
  const canRespond = writable && (manager || request.requestedFromUserId === user.id) && ['open', 'changes_requested'].includes(request.status);
  const canAccept = writable && (manager || request.requestedByUserId === user.id) && request.status === 'submitted';
  return <div><p>{request.prompt}</p>{request.response && <blockquote>{request.response}</blockquote>}
    {(canRespond || canAccept) && <div className="compact-form stacked"><label>Response or changes required<textarea maxLength={6000} value={response} onChange={(e) => setResponse(e.target.value)}/></label><div className="strategy-link-actions">
      {canRespond && <><button type="button" disabled={busy || !response.trim()} onClick={() => send('patch', `/collaboration/requests/${request.id}`, { status: 'submitted', response })}>Submit response</button><button type="button" disabled={busy} onClick={() => send('patch', `/collaboration/requests/${request.id}`, { status: 'declined', response })}>Decline request</button></>}
      {canAccept && <><button type="button" disabled={busy} onClick={() => send('patch', `/collaboration/requests/${request.id}`, { status: 'complete' })}>Accept response</button><button type="button" disabled={busy || !response.trim()} onClick={() => send('patch', `/collaboration/requests/${request.id}`, { status: 'changes_requested', response })}>Request changes</button></>}
    </div></div>}<Notice>{notice}</Notice></div>;
}

export function DependencyHandoverControls({ dependency, team = [], onChanged }) {
  const { user } = useAuth(); const [recipient, setRecipient] = useState(''); const [response, setResponse] = useState(''); const [due, setDue] = useState('');
  const { busy, notice, send } = useMutation(onChanged);
  const writable = writers.includes(user?.role); const manager = managers.includes(user?.role);
  const requesting = writable && (manager || dependency.ownerId === user.id) && ['not_requested', 'clarification_requested', 'revised_date_proposed', 'declined'].includes(dependency.handoverStatus || 'not_requested');
  const receiving = writable && (manager || dependency.handoverRequestedTo === user.id) && dependency.handoverStatus === 'requested';
  const respond = (handoverStatus) => send('patch', `/strategy-dependencies/${dependency.id}/handover`, { handoverStatus, response, proposedDueDate: due || null });
  return <div><p>{dependency.detail || dependency.dependencyType}</p><small>Handover: {words(dependency.handoverStatus || 'not_requested')} · due {date(dependency.dueDate)}</small>{dependency.handoverResponse && <blockquote>{dependency.handoverResponse}</blockquote>}{dependency.proposedDueDate && <p>Proposed date: {date(dependency.proposedDueDate)}</p>}
    {(requesting || receiving) && <div className="compact-form stacked">
      {requesting && <label>Receiving owner<select value={recipient} onChange={(e) => setRecipient(e.target.value)}><option value="">Choose an active Council colleague</option>{team.filter((member) => writers.includes(member.role) && member.id !== user.id).map((member) => <option key={member.id} value={member.id}>{name(member)}</option>)}</select></label>}
      <label>Handover detail or response<textarea maxLength={8000} value={response} onChange={(e) => setResponse(e.target.value)}/></label><label>{receiving ? 'Proposed revised date' : 'Due date'}<input type="date" value={due} onChange={(e) => setDue(e.target.value)}/></label>
      <div className="strategy-link-actions">{requesting && <button type="button" disabled={busy || !recipient} onClick={() => send('post', `/strategy-dependencies/${dependency.id}/handover`, { requestedToUserId: recipient, detail: response, dueDate: due || null })}>Request handover</button>}{receiving && <><button type="button" disabled={busy} onClick={() => respond('accepted')}>Accept ownership</button><button type="button" disabled={busy || !response.trim()} onClick={() => respond('clarification_requested')}>Ask for clarification</button><button type="button" disabled={busy || !due || !response.trim()} onClick={() => respond('revised_date_proposed')}>Propose revised date</button><button type="button" disabled={busy || !response.trim()} onClick={() => respond('declined')}>Decline handover</button></>}</div>
    </div>}<Notice>{notice}</Notice></div>;
}

export function QuarterlyUpdateWorkflow({ update, action = update.StrategyAction || {}, team = [], onChanged }) {
  const { user } = useAuth(); const [reviewer, setReviewer] = useState(''); const [comment, setComment] = useState('');
  const { busy, notice, send } = useMutation(onChanged);
  const writable = writers.includes(user?.role); const manager = managers.includes(user?.role);
  const author = writable && (manager || update.submittedBy === user.id || action.ownerId === user.id);
  const canReview = writable && (manager || update.reviewRequestedFromUserId === user.id);
  const move = (workflowStatus) => send('patch', `/quarterly-action-updates/${update.id}/workflow`, { expectedVersion: update.version, workflowStatus, ...(workflowStatus === 'submitted_for_review' ? { reviewRequestedFromUserId: reviewer } : {}), reviewComment: comment || null });
  return <section aria-label="Quarterly update review"><h4>{action.title || 'Quarterly update'}</h4><p><b>{words(update.workflowStatus)}</b> · version {update.version} · {words(update.status)}</p>
    {['achievements', 'evidenceSummary', 'riskSummary', 'decisionsRequired', 'nextQuarterCommitments'].map((field) => update[field] ? <p key={field}><b>{words(field.replace(/([A-Z])/g, ' $1'))}: </b>{update[field]}</p> : null)}
    {update.reviewComment && <blockquote>Review: {update.reviewComment}</blockquote>}
    {writable && <div className="compact-form stacked">
      {author && ['draft', 'changes_requested'].includes(update.workflowStatus) && <label>Independent reviewer<select value={reviewer} onChange={(e) => setReviewer(e.target.value)}><option value="">Choose an active reviewer</option>{team.filter((member) => writers.includes(member.role) && member.id !== update.submittedBy).map((member) => <option key={member.id} value={member.id}>{name(member)} · {words(member.role)}</option>)}</select></label>}
      {canReview && update.workflowStatus === 'submitted_for_review' && <label>Review comment<textarea maxLength={6000} value={comment} onChange={(e) => setComment(e.target.value)}/></label>}
      <div className="strategy-link-actions">{author && ['draft', 'changes_requested'].includes(update.workflowStatus) && <button type="button" disabled={busy || !reviewer} onClick={() => move('submitted_for_review')}>Submit for review</button>}
        {canReview && update.workflowStatus === 'submitted_for_review' && <><button type="button" disabled={busy || !comment.trim()} onClick={() => move('changes_requested')}>Request changes</button>{update.submittedBy !== user.id && <button type="button" disabled={busy} onClick={() => move('endorsed')}>Endorse narrative</button>}</>}
        {manager && update.workflowStatus === 'endorsed' && <button type="button" disabled={busy} onClick={() => move('included_in_report')}>Include in report</button>}
        {author && update.workflowStatus !== 'draft' && <button type="button" disabled={busy} onClick={() => move('draft')}>Withdraw to draft and clear approval</button>}
      </div></div>}<Notice>{notice}</Notice>
  </section>;
}

const narrativeFields = ['achievements', 'evidenceSummary', 'riskSummary', 'decisionsRequired', 'nextQuarterCommitments'];
export function QuarterlyNarrativeEditor({ action, update, periodId, statuses = [], onChanged }) {
  const { user } = useAuth(); const { busy, notice, send } = useMutation(onChanged);
  const initial = () => ({ status: update?.status || action.status || 'not_started', movement: update?.movement || 'advanced', ...Object.fromEntries(narrativeFields.map((field) => [field, update?.[field] || ''])) });
  const [form, setForm] = useState(initial); const [baseVersion, setBaseVersion] = useState(update?.version || 0);
  // Never silently overwrite dirty text when a parent refresh observes a competing save.
  const reload = () => { setForm(initial()); setBaseVersion(update?.version || 0); };
  const allowed = writers.includes(user?.role) && (managers.includes(user.role) || update?.submittedBy === user.id || action.ownerId === user.id);
  if (!allowed) return null;
  return <details><summary>Edit quarterly narrative</summary><p>Saving returns this update to draft and clears reviewer, endorsement and report inclusion. Existing immutable report snapshots are unchanged.</p>
    {baseVersion !== (update?.version || 0) && <p role="alert">A newer version is available. Compare your text before using “Load latest narrative”.</p>}
    <button type="button" disabled={busy} onClick={reload}>Load latest narrative</button>
    <form className="compact-form stacked" onSubmit={async (event) => { event.preventDefault(); if (await send('post', `/strategy-reporting-periods/${periodId}/action-updates`, { ...form, actionId: action.id, expectedVersion: baseVersion })) setBaseVersion(baseVersion + 1); }}>
      <label>Action status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{(statuses.length ? statuses : [{ code: form.status, label: words(form.status) }]).map((status) => <option key={status.code} value={status.code}>{status.label}</option>)}</select></label>
      <label>Movement<select value={form.movement} onChange={(e) => setForm({ ...form, movement: e.target.value })}>{['advanced', 'no_change', 'slipped', 'completed', 'new_risk'].map((value) => <option key={value} value={value}>{words(value)}</option>)}</select></label>
      {narrativeFields.map((field) => <label key={field}>{words(field.replace(/([A-Z])/g, ' $1'))}<textarea maxLength={12000} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })}/></label>)}
      <button type="submit" disabled={busy || !periodId}>Save narrative as draft (version {baseVersion})</button>
    </form><Notice>{notice}</Notice>
  </details>;
}

export function SafeOutcomeLink({ item }) {
  const source = item.sourcePreview;
  if (!source || !uuid(item.resourceId)) return <small>Linked source unavailable in this Council workspace.</small>;
  const actionId = item.resourceType === 'action' ? item.resourceId : source.actionId;
  if (!uuid(actionId)) return <small>{source.title || source.name || source.sourceName || words(item.resourceType)} · inspect in the delivery register</small>;
  const params = new URLSearchParams({ actionId });
  if (uuid(source.strategyId)) params.set('strategyId', source.strategyId);
  return <a href={`/strategy-delivery?${params.toString()}`}>Open linked action in delivery register</a>;
}

function QuestionAnswer({ question, packId, canAnswer, onChanged }) {
  const [response, setResponse] = useState(''); const { busy, notice, send } = useMutation(onChanged);
  return <article><b>{question.question}</b>{question.respondedAt ? <p>{question.response} · answered by {name(question.questionResponder)}</p> : canAnswer ? <form className="compact-form stacked" onSubmit={(event) => { event.preventDefault(); send('patch', `/review-packs/${packId}/questions/${question.id}`, { response }); }}><label>Answer<textarea required maxLength={12000} value={response} onChange={(e) => setResponse(e.target.value)}/></label><button type="submit" disabled={busy || !response.trim()}>Record answer</button></form> : <p>Awaiting answer.</p>}<Notice>{notice}</Notice></article>;
}

export function ReviewPackDetail({ packId, team = [], onChanged, onClose }) {
  const { user } = useAuth(); const [pack, setPack] = useState(null); const [loadError, setLoadError] = useState(''); const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState(''); const [outcome, setOutcome] = useState({ outcomeType: 'follow_up', outcome: '', ownerId: '', dueDate: '', linked: '' });
  const load = async () => { setLoading(true); setLoadError(''); try { const response = await api.get(`/review-packs/${packId}`); setPack(response.data.data); } catch (error) { setLoadError(error.response?.data?.error || 'Review Pack could not be loaded.'); } finally { setLoading(false); } };
  useEffect(() => { let active = true; setPack(null); setLoading(true); api.get(`/review-packs/${packId}`).then((response) => { if (active) setPack(response.data.data); }).catch((error) => { if (active) setLoadError(error.response?.data?.error || 'Review Pack could not be loaded.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [packId]);
  const { busy, notice, send } = useMutation(async () => { await load(); if (onChanged) await onChanged(); });
  const writable = writers.includes(user?.role); const manager = managers.includes(user?.role);
  const owner = pack && writable && (manager || pack.ownerId === user.id); const open = ['draft', 'ready'].includes(pack?.status);
  const next = { draft: ['ready', 'Mark ready'], ready: ['completed', 'Close meeting'], completed: ['archived', 'Archive pack'] }[pack?.status];
  return <section className="collaboration-card collaboration-wide" aria-label="Review Pack detail"><div className="subsection-heading"><h3>{pack?.title || 'Review Pack'}</h3>{onClose && <button type="button" onClick={onClose}>Close detail</button>}</div>
    {loading && <p role="status">Loading Review Pack…</p>}{loadError && <p role="alert">{loadError}</p>}<button type="button" disabled={loading || busy} onClick={load}>Refresh detail</button>
    {pack && <><p><b>{words(pack.status)}</b> · internal only · owner {name(pack.reviewPackOwner)}</p><p>{pack.purpose}</p><p><b>Desired outcome:</b> {pack.desiredOutcome}</p><p>{pack.executiveSummary}</p><p role="note"><b>Live preview — not a frozen snapshot.</b> {pack.sourceNotice}</p>
      <h4>Source records (live)</h4>{pack.ReviewPackItems?.length ? pack.ReviewPackItems.map((item) => <article key={item.id}><b>{item.category || words(item.resourceType)} · {item.sourcePreview?.title || item.sourcePreview?.name || item.sourcePreview?.sourceName || 'Delivery source'}</b><p>{item.note}</p><p>{item.sourcePreview?.achievements || item.sourcePreview?.detail || item.sourcePreview?.contribution}</p><SafeOutcomeLink item={item}/></article>) : <p>No source records attached.</p>}
      <h4>Questions and recorded answers</h4>{pack.ReviewPackQuestions?.length ? pack.ReviewPackQuestions.map((item) => <QuestionAnswer key={item.id} question={item} packId={pack.id} canAnswer={owner && open} onChanged={load}/>) : <p>No pre-reading questions.</p>}
      {writable && open && <form className="compact-form stacked" onSubmit={async (event) => { event.preventDefault(); if (await send('post', `/review-packs/${pack.id}/questions`, { question })) setQuestion(''); }}><label>Pre-reading question<textarea required maxLength={6000} value={question} onChange={(e) => setQuestion(e.target.value)}/></label><button type="submit" disabled={busy || !question.trim()}>Ask question</button></form>}
      <h4>Decisions and owned follow-ups</h4>{pack.ReviewPackOutcomes?.length ? pack.ReviewPackOutcomes.map((item) => <article key={item.id}><b>{words(item.outcomeType)}: {item.outcome}</b><p>Owner: {name(item.outcomeOwner)} · due {date(item.dueDate)}</p>{item.resourceId && <SafeOutcomeLink item={item}/>}</article>) : <p>No meeting outcomes recorded.</p>}
      {owner && pack.status === 'ready' && <form className="compact-form stacked" onSubmit={async (event) => { event.preventDefault(); const item = pack.ReviewPackItems?.find((row) => row.id === outcome.linked); const payload = { outcomeType: outcome.outcomeType, outcome: outcome.outcome, ownerId: outcome.ownerId || null, dueDate: outcome.dueDate || null, resourceType: item?.resourceType || null, resourceId: item?.resourceId || null }; if (await send('post', `/review-packs/${pack.id}/outcomes`, payload)) setOutcome({ ...outcome, outcome: '', linked: '' }); }}>
        <label>Outcome type<select value={outcome.outcomeType} onChange={(e) => setOutcome({ ...outcome, outcomeType: e.target.value })}>{['decision', 'follow_up', 'note'].map((type) => <option key={type} value={type}>{words(type)}</option>)}</select></label>
        <label>Outcome<textarea required maxLength={12000} value={outcome.outcome} onChange={(e) => setOutcome({ ...outcome, outcome: e.target.value })}/></label>
        <label>Active owner<select required={outcome.outcomeType !== 'note'} value={outcome.ownerId} onChange={(e) => setOutcome({ ...outcome, ownerId: e.target.value })}><option value="">Select owner</option>{team.filter((member) => writers.includes(member.role)).map((member) => <option key={member.id} value={member.id}>{name(member)}</option>)}</select></label>
        <label>Due date<input required={outcome.outcomeType === 'follow_up'} type="date" value={outcome.dueDate} onChange={(e) => setOutcome({ ...outcome, dueDate: e.target.value })}/></label>
        <label>Link to a pack record<select value={outcome.linked} onChange={(e) => setOutcome({ ...outcome, linked: e.target.value })}><option value="">No linked source</option>{pack.ReviewPackItems?.filter((item) => item.resourceType !== 'quarterly_update' && item.sourcePreview).map((item) => <option key={item.id} value={item.id}>{item.sourcePreview.title || item.sourcePreview.name || words(item.resourceType)}</option>)}</select></label><button type="submit" disabled={busy}>Record owned outcome</button>
      </form>}
      {owner && next && <button type="button" disabled={busy} onClick={() => send('patch', `/review-packs/${pack.id}/status`, { status: next[0] })}>{next[1]}</button>}{!open && <p>This meeting trail is closed and read-only. Source previews remain live.</p>}
    </>}<Notice>{notice}</Notice>
  </section>;
}

export function ReviewWorkflowPanel({ action, team = [], refreshAction, reportingPeriods = [], statuses = [] }) {
  const [periodId, setPeriodId] = useState('');
  if (!action) return null;
  const updates = action.QuarterlyActionUpdates || [];
  const eligible = reportingPeriods.filter((period) => ['preparing', 'open'].includes(period.status));
  const selectedPeriod = periodId || eligible.find((period) => period.status === 'open')?.id || eligible[0]?.id;
  const selectedUpdate = updates.find((update) => update.reportingPeriodId === selectedPeriod);
  return <section className="collaboration-panel" aria-label="Review and handover workflow"><h3>Review, handover and accountable outcomes</h3><p>Only assigned reviewers or managers can endorse; narrative authors cannot self-endorse. Report inclusion is manager-only.</p>
    <div className="collaboration-grid">{updates.map((update) => <article className="collaboration-card" key={update.id}><QuarterlyUpdateWorkflow update={update} action={action} team={team} onChanged={refreshAction}/>{!reportingPeriods.length && <QuarterlyNarrativeEditor key={update.id} action={action} update={update} periodId={update.reportingPeriodId} statuses={statuses} onChanged={refreshAction}/>}</article>)}</div>
    {eligible.length > 0 && <section className="collaboration-card"><label>Reporting period<select value={selectedPeriod || ''} onChange={(e) => setPeriodId(e.target.value)}>{eligible.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select></label><QuarterlyNarrativeEditor key={selectedPeriod} action={action} update={selectedUpdate} periodId={selectedPeriod} statuses={statuses} onChanged={refreshAction}/></section>}
    <h4>Dependency handovers</h4>{action.dependencies?.length ? action.dependencies.map((dependency) => <article className="collaboration-card" key={dependency.id}><DependencyHandoverControls dependency={dependency} team={team} onChanged={refreshAction}/></article>) : <p>No dependency handovers for this action.</p>}
  </section>;
}
export default ReviewWorkflowPanel;
