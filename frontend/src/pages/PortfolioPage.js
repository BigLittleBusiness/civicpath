/* CivicPath product UI — civic field manual: calm, accountable, decision-ready. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Icon } from '../components/Icon';
import { CurrencyInput, MultiSelectConstraints, SearchableSelect } from '../components/CouncilProofInputs';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
import { addCreatedProject, assessmentDimensions, canManageProjects, initialDataState, isDemoWorkspace, isRecordId, readinessDimensions, requireRows, rowsForWorkspace, saveReadiness, toProject, workspaceKey } from '../lib/trustData.mjs';

const filters = ['All projects', 'Funding ready', 'Business case', 'Delivery', 'Needs attention'];
const formatMoney = (value) => value === null ? 'Not recorded' : value >= 1000000 ? `$${(value / 1000000).toFixed(1)}m` : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
const readinessLabel = (project) => project.readiness === null ? 'Not assessed' : `${project.readiness}%`;

function useDialog(close) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const panel = ref.current;
    const focusable = () => [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
    focusable()[0]?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const controls = focusable(); const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    panel.addEventListener('keydown', keyboard);
    return () => { panel.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [close]);
  return ref;
}

function NewProjectModal({ close, onCreated, priorities, catalogue, loadingCatalogue }) {
  const { user } = useAuth();
  const dialogRef = useDialog(close);
  const [form, setForm] = useState({ name: '', categoryOptionId: null, categoryOther: '', stageOptionId: null, priorityIds: [], estimatedCost: '', targetFunding: '', expectedJobs: '', expectedBenefit: '', constraintSelections: [] });
  const [priorityChoice, setPriorityChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const categorySet = catalogue?.selectorSets?.project_category; const stageSet = catalogue?.selectorSets?.project_delivery_stage; const constraintSet = catalogue?.selectorSets?.project_constraint; const severitySet = catalogue?.selectorSets?.constraint_severity; const statusSet = catalogue?.selectorSets?.constraint_status; const currencyCode = catalogue?.currencyCode || 'AUD';
  const selectedCategory = categorySet?.options?.find((option) => option.id === form.categoryOptionId);
  const addPriority = () => { if (priorityChoice && !form.priorityIds.includes(priorityChoice)) setForm((current) => ({ ...current, priorityIds: [...current.priorityIds, priorityChoice] })); setPriorityChoice(null); };
  const removePriority = (priorityId) => setForm((current) => ({ ...current, priorityIds: current.priorityIds.filter((id) => id !== priorityId) }));
  const submit = async (event) => { event.preventDefault(); if (saving || !canManageProjects(user?.role) || !user?.organizationId || !categorySet || !stageSet) return; setSaving(true); try { const payload = { name: form.name, estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null, targetFunding: form.targetFunding ? Number(form.targetFunding) : null, expectedJobs: form.expectedJobs ? Number(form.expectedJobs) : null, expectedBenefit: form.expectedBenefit || null, currencyCode, priorityIds: form.priorityIds, categorySelection: { optionId: form.categoryOptionId, otherValue: selectedCategory?.isOther ? form.categoryOther : null }, stageSelection: { optionId: form.stageOptionId }, constraintSelections: form.constraintSelections }; const response = await api.post('/projects', payload); if (!isRecordId(response.data.data?.id) || response.data.data.organizationId !== user.organizationId) throw new Error('Unverified project response'); onCreated(toProject(response.data.data)); toast.success('Project added to this workspace.'); close(); } catch (error) { toast.error(error.response?.data?.error || 'The project could not be confirmed. Refresh the register before trying again.'); } finally { setSaving(false); } };
  return <div className="modal-backdrop" role="presentation"><form ref={dialogRef} className="modal-panel council-proof-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={submit}><div className="modal-head"><div><p className="card-eyebrow">Council Proof baseline</p><h2 id="new-project-title">Add a project</h2></div><button type="button" className="modal-close" onClick={close} aria-label="Close">×</button></div><p className="modal-intro">Start with the smallest useful picture: the initiative, its strategic links, delivery position, funding need and barriers to progress.</p>{loadingCatalogue ? <p className="catalogue-loading">Loading your council’s controlled choices…</p> : <><div className="modal-grid"><label>Project name<input autoFocus required value={form.name} onChange={update('name')} placeholder="e.g. Regional workforce housing pathway"/></label><SearchableSelect label="Project type" required options={categorySet?.options} value={form.categoryOptionId} onChange={(categoryOptionId) => setForm((current) => ({ ...current, categoryOptionId, categoryOther: '' }))} placeholder="Search project types" /><SearchableSelect label="Current delivery stage" required options={stageSet?.options} value={form.stageOptionId} onChange={(stageOptionId) => setForm((current) => ({ ...current, stageOptionId }))} placeholder="Search delivery stages" />{selectedCategory?.isOther && <label>Describe project type<input required value={form.categoryOther} onChange={update('categoryOther')} placeholder="Describe the local project type"/></label>}<CurrencyInput label="Estimated total cost" currencyCode={currencyCode} value={form.estimatedCost} onChange={(estimatedCost) => setForm((current) => ({ ...current, estimatedCost }))} /><CurrencyInput label="Target external funding" currencyCode={currencyCode} value={form.targetFunding} onChange={(targetFunding) => setForm((current) => ({ ...current, targetFunding }))} /><label>Expected jobs supported<input inputMode="numeric" value={form.expectedJobs} onChange={update('expectedJobs')} placeholder="Optional"/></label><label className="modal-full">Expected public benefit<textarea value={form.expectedBenefit} onChange={update('expectedBenefit')} maxLength={240} placeholder="What will this project make possible for the community?"/></label></div><section className="priority-picker"><div className="constraint-label"><span>Strategic priorities</span><small>Link one or more existing council priorities. The first link is treated as primary.</small></div><div className="constraint-adder"><SearchableSelect label="Add a priority" options={priorities.filter((priority) => !form.priorityIds.includes(priority.id))} value={priorityChoice} onChange={setPriorityChoice} placeholder="Search council priorities" /><button type="button" className="secondary-button" disabled={!priorityChoice} onClick={addPriority}>Add</button></div>{form.priorityIds.length > 0 && <div className="selected-chips">{form.priorityIds.map((priorityId) => { const priority = priorities.find((item) => item.id === priorityId); return <span key={priorityId}>{priority?.title}<button type="button" aria-label={`Remove ${priority?.title}`} onClick={() => removePriority(priorityId)}>×</button></span>; })}</div>}</section><MultiSelectConstraints options={constraintSet?.options} severityOptions={severitySet?.options} statusOptions={statusSet?.options} value={form.constraintSelections} onChange={(constraintSelections) => setForm((current) => ({ ...current, constraintSelections }))} /></>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button" disabled={saving || loadingCatalogue || !form.categoryOptionId || !form.stageOptionId}>{saving ? 'Saving…' : 'Add project'} <Icon name="arrow" size={15}/></button></div></form></div>;
}

function ReadinessModal({ project, user, close, onSaved }) {
  const dialogRef = useDialog(close);
  const editable = canManageProjects(user?.role) && isRecordId(project.id) && project.organizationId === user?.organizationId;
  const [form, setForm] = useState(() => Object.fromEntries([...readinessDimensions.map(([key]) => [key, project.assessment?.[key] ?? '']), ['assessmentNote', '']]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); if (saving || !editable) return;
    setError(''); setSaving(true);
    try {
      const assessment = await saveReadiness({ client: api, user, project, form });
      onSaved(project.id, assessment); toast.success('Readiness assessment recorded.'); close();
    } catch (failure) { setError(failure.response?.data?.error || failure.message || 'The assessment could not be recorded.'); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><form ref={dialogRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="readiness-title" onSubmit={submit}>
    <div className="modal-head"><div><p className="card-eyebrow">Recorded readiness assessment</p><h2 id="readiness-title">{project.name}</h2></div><button type="button" className="modal-close" onClick={close} aria-label="Close readiness assessment">×</button></div>
    <p className="modal-intro">{project.assessment ? `Latest recorded overall score: ${readinessLabel(project)}.` : 'No readiness assessment is recorded.'} Dimension scores below are actual recorded values on the API’s 0–5 scale, not estimates derived from the total.</p>
    {project.assessment?.assessmentNote && <p><b>Latest evidence note:</b> {project.assessment.assessmentNote}</p>}
    {editable ? <><p className="card-copy">Record an evidence-based assessment. 0 is the lowest score and 5 the highest; an unselected score is not a zero. Saving creates a new assessment, not a change to project stage.</p><div className="modal-grid">{readinessDimensions.map(([key, label]) => <label key={key}>{label}<select required value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}><option value="">Choose recorded score</option>{[0, 1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} / 5</option>)}</select></label>)}<label className="modal-full">Evidence and assessment note<textarea required minLength={10} maxLength={8000} value={form.assessmentNote} onChange={(event) => setForm((current) => ({ ...current, assessmentNote: event.target.value }))} placeholder="Record sources, gaps and reasons supporting these scores."/></label></div></> : <><div className="check-progress">{assessmentDimensions(project.assessment).map((dimension) => <React.Fragment key={dimension.key}><span>{dimension.label}</span><span>{dimension.score === null ? 'Not recorded' : `${dimension.score} / 5`}</span></React.Fragment>)}</div><p className="settings-readonly-note">Read-only. An Organisation Administrator or Portfolio Manager can record a new assessment.</p></>}
    {error && <p role="alert" className="form-message">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Close</button>{editable && <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Recording…' : 'Record assessment'}</button>}</div>
  </form></div>;
}

// Area 2 can supply renderProjectMaintenance({ project, user, onUpdated }) without a second detail panel.
export default function PortfolioPage({ renderProjectMaintenance }) {
  const { user } = useAuth(); const key = workspaceKey(user); const isDemo = isDemoWorkspace(user);
  const currentKey = useRef(key); currentKey.current = key;
  const [filter, setFilter] = useState(filters[0]); const [query, setQuery] = useState('');
  const [state, setState] = useState(() => initialDataState(key)); const [workState, setWorkState] = useState(() => initialDataState(key));
  const [selectedId, setSelectedId] = useState(null); const [modal, setModal] = useState(null); const [reload, setReload] = useState(0);
  const [choices, setChoices] = useState({ key: null, status: 'loading', priorities: [], catalogue: null });
  const closeModal = React.useCallback(() => setModal(null), []);
  useEffect(() => {
    let mounted = true; setState(initialDataState(key)); setWorkState(initialDataState(key)); setSelectedId(null); setModal(null);
    if (!key) return () => { mounted = false; };
    api.get('/projects').then((response) => {
      const rows = requireRows(response.data.data);
      if (rows.some((project) => project.organizationId !== user.organizationId)) throw new Error('Workspace boundary mismatch');
      if (mounted) setState({ key, status: 'success', rows: rows.map(toProject) });
    }).catch(() => { if (mounted) setState({ key, status: 'error', rows: [] }); });
    api.get('/work-items').then((response) => {
      const rows = requireRows(response.data.data);
      if (rows.some((item) => item.organizationId !== user.organizationId)) throw new Error('Workspace boundary mismatch');
      if (mounted) setWorkState({ key, status: 'success', rows });
    }).catch(() => { if (mounted) setWorkState({ key, status: 'error', rows: [] }); });
    return () => { mounted = false; };
  }, [key, reload, user?.organizationId]);
  useEffect(() => {
    let mounted = true; setChoices({ key, status: 'loading', priorities: [], catalogue: null });
    if (!key || !canManageProjects(user?.role)) return () => { mounted = false; };
    Promise.all([api.get('/priorities'), api.get('/council-proof/selectors')]).then(([priorities, catalogue]) => {
      const records = requireRows(priorities.data.data);
      if (records.some((priority) => priority.organizationId !== user.organizationId)) throw new Error('Workspace boundary mismatch');
      if (!catalogue.data.data?.selectorSets?.project_category || !catalogue.data.data?.selectorSets?.project_delivery_stage) throw new Error('Missing selector catalogue');
      if (mounted) setChoices({ key, status: 'success', priorities: records.map((priority) => ({ ...priority, label: priority.title })), catalogue: catalogue.data.data });
    }).catch(() => { if (mounted) setChoices({ key, status: 'error', priorities: [], catalogue: null }); });
    return () => { mounted = false; };
  }, [key, reload, user?.role, user?.organizationId]);
  const projects = rowsForWorkspace(state, key);
  const visibleProjects = useMemo(() => projects.filter((project) => {
    const text = query.toLowerCase();
    return (project.name.toLowerCase().includes(text) || project.priority.toLowerCase().includes(text)) &&
      (filter === 'All projects' || (filter === 'Needs attention' ? ['High', 'Unassessed'].includes(project.risk) : project.stage === filter));
  }), [filter, query, projects]);
  const selectedProject = visibleProjects.find((project) => project.id === selectedId) || visibleProjects[0] || null;
  const status = state.key === key ? state.status : 'loading';
  const openWork = rowsForWorkspace(workState, key).filter((item) => item.projectId === selectedProject?.id && item.status !== 'complete');
  const handleCreated = (project) => { if (currentKey.current !== key) return; setState((current) => addCreatedProject(current, key, project)); setSelectedId(project.id); setFilter('All projects'); setQuery(''); };
  const handleAssessment = (projectId, assessment) => { if (currentKey.current !== key) return; setState((current) => current.key !== key ? current : { ...current, rows: current.rows.map((project) => project.id === projectId ? toProject({ ...project, stage: project.stageKey, ReadinessAssessments: [assessment] }) : project) }); };
  const onUpdated = () => setReload((value) => value + 1);
  return <main className="page-content portfolio-page">
    <div className="demo-banner"><span>{isDemo ? 'Demonstration workspace · illustrative records' : 'Council workspace · live records'}</span><p>{isDemo ? 'This is an explicitly designated demo tenant. Records and any changes are confined to this demonstration workspace.' : 'Only records returned for this Council are shown. Empty or unavailable data is never replaced with examples.'}</p></div>
    <div className="page-toolbar"><div className="segmented-control" aria-label="Project filters">{filters.map((item) => <button key={item} aria-pressed={filter === item} className={filter === item ? 'is-selected' : ''} type="button" onClick={() => setFilter(item)}>{item}</button>)}</div><div className="toolbar-actions"><label className="search-field"><Icon name="search"/><input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects"/></label>{canManageProjects(user?.role) && <button className="primary-button" type="button" disabled={status !== 'success' || choices.key !== key || choices.status !== 'success'} onClick={() => setModal('new')}><Icon name="plus" size={16}/> Add project</button>}</div></div>
    {canManageProjects(user?.role) && choices.key === key && choices.status === 'error' && <p role="alert" className="data-note">Project choices could not be loaded. Creation is disabled until they are available. <button type="button" className="secondary-button" onClick={onUpdated}>Retry</button></p>}
    <section className="portfolio-layout"><div className="project-list-panel"><div className="list-summary"><p><b>{status === 'success' ? visibleProjects.length : '—'}</b> {isDemo ? 'demonstration' : 'recorded'} projects</p><span>Latest recorded assessments</span></div>
      {status === 'loading' && <p role="status" className="card-copy">Loading this workspace’s project register…</p>}
      {status === 'error' && <div role="alert"><p className="card-copy">The project register is unavailable. No demonstration records are being shown.</p><button type="button" className="secondary-button" onClick={onUpdated}>Retry loading projects</button></div>}
      {status === 'success' && !projects.length && <p role="status" className="card-copy">No projects are recorded yet. {canManageProjects(user?.role) ? 'Add the first project above, or import a register in Workspace settings.' : 'Ask an Organisation Administrator or Portfolio Manager to add or import projects.'}</p>}
      {status === 'success' && projects.length > 0 && !visibleProjects.length && <p role="status" className="card-copy">No projects match this search or filter.</p>}
      <div className="portfolio-list">{visibleProjects.map((project) => <button className={selectedProject?.id === project.id ? 'portfolio-row selected' : 'portfolio-row'} type="button" key={project.id} aria-pressed={selectedProject?.id === project.id} onClick={() => setSelectedId(project.id)}><div className="portfolio-row-top"><span className="stage-pill">{project.stage}</span><span className={`status-mark ${project.risk.toLowerCase()}`} aria-label={`${project.risk} readiness signal`}/></div><h3>{project.name}</h3><p>{project.priority}</p><div className="portfolio-row-bottom"><span>Readiness <b>{readinessLabel(project)}</b></span>{project.readiness !== null && <i aria-hidden="true"><b style={{ width: `${project.readiness}%` }}/></i>}</div></button>)}</div></div>
      {selectedProject && <aside className="project-detail"><div className="detail-overline"><span className="stage-pill">{selectedProject.stage}</span><button className="secondary-button" type="button" aria-label={`Open readiness assessment for ${selectedProject.name}`} onClick={() => setModal('readiness')}>Assessment</button></div><h2>{selectedProject.name}</h2><p className="detail-priority">{selectedProject.priority}</p><p className="detail-summary">{selectedProject.expectedBenefit}</p><div className="detail-stats"><div><span>Recorded readiness</span><b>{readinessLabel(selectedProject)}</b>{selectedProject.readiness !== null && <i aria-hidden="true"><em style={{ width: `${selectedProject.readiness}%` }}/></i>}</div><div><span>Estimated cost ({selectedProject.currencyCode})</span><b>{formatMoney(selectedProject.cost)}</b></div><div><span>Funding target ({selectedProject.currencyCode})</span><b>{formatMoney(selectedProject.target)}</b></div><div><span>Expected jobs</span><b>{selectedProject.jobs ?? 'Not recorded'}</b></div></div>
        <section className="readiness-check"><p className="card-eyebrow">Readiness assessment</p><h3>Recorded dimension scores</h3><p className="card-copy">These are recorded 0–5 assessments, not calculated offsets or confirmation of project approvals.</p><div className="check-progress">{assessmentDimensions(selectedProject.assessment).map((dimension) => <React.Fragment key={dimension.key}><span>{dimension.label}</span>{dimension.percent === null ? <span>Not recorded</span> : <div><span>{dimension.score} / 5</span><i aria-hidden="true"><b style={{ width: `${dimension.percent}%` }}/></i></div>}</React.Fragment>)}</div><button className="secondary-button full" type="button" onClick={() => setModal('readiness')}>{canManageProjects(user?.role) ? 'Review / record readiness assessment' : 'View readiness assessment'} <Icon name="arrow" size={15}/></button></section>
        <section className="detail-work"><div className="subsection-heading"><h3>Open work</h3><span>{workState.key === key && workState.status === 'success' ? `${openWork.length} items` : 'Unavailable'}</span></div>{workState.key !== key || workState.status === 'loading' ? <p role="status">Loading work items…</p> : workState.status === 'error' ? <p role="alert">Open work could not be loaded. Retry the register to verify it.</p> : !openWork.length ? <p className="card-copy">No open work items are recorded for this project.</p> : openWork.slice(0, 10).map((item) => <div className="mini-work" key={item.id}><span className="type-chip">{item.workType?.replace(/_/g, ' ') || 'Work item'}</span><p>{item.title}<small>{item.status?.replace(/_/g, ' ')} · {item.dueDate ? `Due ${item.dueDate}` : 'No due date recorded'}</small></p></div>)}</section>
        {renderProjectMaintenance?.({ project: selectedProject, user, onUpdated })}
      </aside>}
    </section>
    {modal === 'new' && canManageProjects(user?.role) && choices.key === key && choices.status === 'success' && <NewProjectModal key={key} close={closeModal} onCreated={handleCreated} priorities={choices.priorities} catalogue={choices.catalogue} loadingCatalogue={false}/>}
    {modal === 'readiness' && selectedProject && <ReadinessModal key={`${key}:${selectedProject.id}`} project={selectedProject} user={user} close={closeModal} onSaved={handleAssessment}/>}
  </main>;
}
