import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import './PortfolioReadinessPulsePage.css';

const focusOptions = [
  ['economic_growth', 'Economic development and local growth'],
  ['housing_livable_places', 'Housing, liveability and places'],
  ['community_facilities', 'Community facilities and services'],
  ['resilience_risk', 'Resilience, risk and recovery'],
  ['visitor_economy', 'Visitor economy and activation'],
  ['enabling_infrastructure', 'Enabling infrastructure'],
  ['environment_climate', 'Environment and climate action'],
  ['workforce_skills', 'Workforce and skills'],
  ['other', 'Other focus area'],
];

const constraintOptions = [
  ['evidence_data', 'Evidence or data'],
  ['scope_business_case', 'Scope or business case'],
  ['cost_estimate', 'Cost estimate or co-contribution'],
  ['funding_pathway', 'Funding or investment pathway'],
  ['approvals_governance', 'Approvals or governance'],
  ['resourcing_capacity', 'Resourcing or delivery capacity'],
  ['partner_alignment', 'Partner or community alignment'],
  ['land_planning', 'Land, planning or statutory matters'],
  ['other', 'Another material constraint'],
];

const questionGroups = [
  {
    key: 'portfolioVisibilityLocation',
    eyebrow: '03',
    title: 'Where does the working view of your priority initiatives sit today?',
    note: 'Choose the option that best reflects day-to-day practice, rather than the ideal future state.',
    options: [['single_shared_view', 'One shared portfolio view', 'A current view is available to the people who need it.'], ['linked_team_views', 'Connected team views', 'Teams can usually work across linked records or reporting views.'], ['separate_spreadsheets', 'Separate spreadsheets or reports', 'Useful information exists, but is spread across different files or teams.'], ['individual_records', 'Individual project records', 'Information is mainly held in separate project documents or systems.'], ['email_meetings', 'Email, meetings and institutional memory', 'The working view is mostly assembled through conversations.'], ['not_sure', 'Not sure yet', 'It is difficult to see where the current view is held.']],
  },
  {
    key: 'portfolioInformationConsistency',
    eyebrow: '04',
    title: 'How consistently can you see the same essentials for each initiative?',
    note: 'For example: strategic link, delivery stage, owner, next action, cost or constraint.',
    options: [['all_or_almost_all', 'All or almost all', 'The same core information is visible for nearly every initiative.'], ['most', 'Most', 'Most initiatives can be compared using a consistent set of information.'], ['some', 'Some', 'A useful view exists for some initiatives, but not the whole priority set.'], ['few', 'A few', 'Only a small number have comparable information.'], ['not_consistent', 'Not consistently', 'Information is not available in a common way.'], ['not_sure', 'Not sure yet', 'I cannot readily tell.']],
  },
  {
    key: 'strategicConnection',
    eyebrow: '05',
    title: 'How clear is the link from priority initiatives to the outcomes or decisions they support?',
    note: 'This may be a Community Strategic Plan, Long-Term Plan, delivery program, leadership decision or investment priority.',
    options: [['clear_and_recorded', 'Clear and recorded', 'The intended strategic or decision link is visible for the priority initiatives.'], ['clear_but_not_consistent', 'Clear, but not consistently recorded', 'The link is generally understood but not always visible in the working view.'], ['clear_for_some', 'Clear for some initiatives', 'The link is well understood for particular projects only.'], ['usually_implicit', 'Usually implicit', 'People generally know the connection, but it is rarely recorded.'], ['not_clear', 'Not clear', 'The link is difficult to explain or compare.'], ['not_sure', 'Not sure yet', 'I cannot readily tell.']],
  },
  {
    key: 'decisionComparison',
    eyebrow: '06',
    title: 'How easily can decision-makers compare what matters across initiatives?',
    note: 'Think about comparing readiness, strategic fit, need for a decision, key constraint or next action.',
    options: [['easy_consistent_comparison', 'Easy and consistent', 'A decision-maker can compare the priority initiatives without rebuilding the picture.'], ['possible_with_prep', 'Possible with preparation', 'Comparison can be prepared, but needs some manual work.'], ['possible_for_some', 'Possible for some', 'Comparison works for only part of the portfolio.'], ['case_by_case', 'Case by case', 'Each initiative requires a separate explanation.'], ['difficult_to_compare', 'Difficult to compare', 'A shared comparison is not currently practical.'], ['not_sure', 'Not sure yet', 'I cannot readily tell.']],
  },
  {
    key: 'readinessOwnerNextAction',
    eyebrow: '07',
    title: 'For how many priority initiatives is there a clear owner and next action?',
    note: 'An action can be small and practical: confirming evidence, refining scope, scheduling a decision or testing a funding pathway.',
    options: [['almost_all', 'Almost all', 'Owners and next actions are visible for nearly all priority initiatives.'], ['more_than_half', 'More than half', 'Most priority work has a clear next move.'], ['about_half', 'About half', 'The view is mixed.'], ['a_few', 'A few', 'Only a small number have an explicit next action.'], ['none_or_unknown', 'None or unknown', 'Next actions are not consistently visible.']],
  },
  {
    key: 'evidenceVisibility',
    eyebrow: '08',
    title: 'How visible are the evidence gaps or readiness questions that could affect progress?',
    note: 'This might include demand evidence, benefits, cost certainty, partner commitment, approvals or delivery capacity.',
    options: [['visible_and_reviewed', 'Visible and reviewed', 'Material gaps are visible and revisited as work progresses.'], ['visible_not_regularly', 'Visible, but not reviewed regularly', 'Gaps are recorded but not consistently acted on.'], ['visible_for_some', 'Visible for some initiatives', 'Readiness questions are clearer for particular projects.'], ['mostly_known_informally', 'Mostly known informally', 'The relevant people know the gaps, but they are not visible in one place.'], ['not_visible', 'Not visible', 'Gaps usually emerge late or during individual discussions.'], ['not_sure', 'Not sure yet', 'I cannot readily tell.']],
  },
  {
    key: 'constraintActioning',
    eyebrow: '09',
    title: 'When a material constraint appears, how is it normally managed?',
    note: 'A constraint might be a blocker, dependency or risk requiring an owner, decision or next action.',
    options: [['owner_action_due_date', 'Owner, action and review point', 'The constraint is made visible with a practical response and accountability.'], ['owner_or_action', 'Owner or action is usually clear', 'There is a response, but not always a complete follow-through path.'], ['recorded_but_not_managed', 'Recorded, but not actively managed', 'The constraint is visible but movement depends on follow-up.'], ['discussed_informally', 'Discussed informally', 'The issue is known, but not structured as a shared action.'], ['not_consistently_captured', 'Not consistently captured', 'Constraints are not usually made visible early.'], ['not_sure', 'Not sure yet', 'I cannot readily tell.']],
  },
];

const roles = [['economic_development', 'Economic development'], ['strategic_planning', 'Strategic planning'], ['grants_funding', 'Grants or funding'], ['infrastructure_projects', 'Infrastructure or projects'], ['executive_leadership', 'Executive or leadership'], ['community_place', 'Community, place or engagement'], ['other', 'Other council role']];
const useCases = [['executive_briefing', 'Prepare a clearer executive or councillor conversation'], ['planning_alignment', 'Connect priority projects to strategic planning'], ['funding_pipeline', 'Strengthen the funding and investment pipeline'], ['cross_team_coordination', 'Coordinate work across teams or partners'], ['portfolio_prioritisation', 'Prioritise where attention is needed'], ['delivery_follow_through', 'Keep priority initiatives moving between decisions'], ['other', 'Another practical outcome']];
const regions = { AU: ['Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia'], NZ: ['Northland', 'Auckland', 'Waikato', 'Bay of Plenty', 'Gisborne', "Hawke's Bay", 'Taranaki', 'Manawatū-Whanganui', 'Wellington', 'Tasman', 'Nelson', 'Marlborough', 'West Coast', 'Canterbury', 'Otago', 'Southland'] };
const steps = ['Context', 'Current view', 'Decision readiness', 'Snapshot'];

function newSessionId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function MultiChoice({ label, note, options, values, onChange, max = 4 }) {
  const toggle = (code) => {
    if (values.includes(code)) return onChange(values.filter((item) => item !== code));
    if (values.length >= max) return toast(`Choose up to ${max} areas for this snapshot.`);
    onChange([...values, code]);
  };
  return <fieldset className="pulse-fieldset"><legend>{label}</legend>{note && <p>{note}</p>}<div className="pulse-choice-grid pulse-multi-grid">{options.map(([code, title]) => <button type="button" key={code} className={values.includes(code) ? 'is-selected' : ''} onClick={() => toggle(code)} aria-pressed={values.includes(code)}><span className="pulse-check">{values.includes(code) ? '✓' : ''}</span><b>{title}</b></button>)}</div></fieldset>;
}

function RadioQuestion({ question, value, onChange }) {
  return <section className="pulse-question-card"><div className="pulse-question-head"><span>{question.eyebrow}</span><div><h2>{question.title}</h2><p>{question.note}</p></div></div><div className="pulse-answer-list">{question.options.map(([code, title, note]) => <label key={code} className={value === code ? 'is-selected' : ''}><input type="radio" name={question.key} value={code} checked={value === code} onChange={(event) => onChange(event.target.value)}/><span className="pulse-radio"/><span><b>{title}</b><small>{note}</small></span></label>)}</div></section>;
}

function ScoreBar({ dimension }) {
  return <article className="pulse-score-row"><div><span>{dimension.label}</span><b>{dimension.score}<small>/100</small></b></div><i><em style={{ width: `${dimension.score}%` }}/></i><p>{dimension.status}</p></article>;
}

export default function PortfolioReadinessPulsePage() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ sessionId: newSessionId(), country: 'AU', portfolioFocus: [], constraintThemes: [], marketingConsent: false, resourceAcknowledged: false, honeypot: '', sourceUrl: window.location.href, referrer: document.referrer || '' });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const currentQuestions = useMemo(() => step === 1 ? questionGroups.slice(0, 4) : step === 2 ? questionGroups.slice(4) : [], [step]);
  const questionComplete = (questions) => questions.every((question) => Boolean(form[question.key]));
  const contextComplete = Boolean(form.portfolioFocus?.length && form.councilName && form.country && form.stateRegion && form.role && (form.role !== 'other' || form.roleOther) && form.decisionUseCase && (form.decisionUseCase !== 'other' || form.decisionUseCaseOther));
  const readinessComplete = questionComplete(questionGroups.slice(4)) && Boolean(form.constraintThemes?.length) && (!form.constraintThemes?.includes('other') || form.constraintThemesOther);
  const currentComplete = step === 0 ? contextComplete : step === 1 ? questionComplete(questionGroups.slice(0, 4)) : step === 2 ? readinessComplete : Boolean(form.firstName && form.lastName && form.email && form.resourceAcknowledged);
  const advance = () => { if (!currentComplete) return toast('Please complete the required selections before continuing.'); setStep((current) => Math.min(current + 1, 3)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const back = () => { setStep((current) => Math.max(current - 1, 0)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const submit = async (event) => {
    event.preventDefault();
    if (!currentComplete) return toast('Please add your contact details and acknowledge the requested snapshot.');
    setSubmitting(true);
    try {
      const response = await api.post('/public/portfolio-readiness-pulse', form);
      setResult(response.data.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const detail = error.response?.data?.details?.[0] || error.response?.data?.error || 'Your snapshot could not be recorded. Please review the form and try again.';
      toast.error(detail.replace(/"/g, ''));
    } finally { setSubmitting(false); }
  };

  if (result) return <main className="pulse-page"><section className="pulse-result-shell"><div className="pulse-result-top"><p className="pulse-eyebrow">Your CivicPath snapshot</p><a href="https://www.civicpath.com.au" className="pulse-wordmark"><span>C</span> CivicPath</a></div><div className="pulse-result-intro"><span className="pulse-result-kicker">{result.result.bandLabel}</span><h1>A clearer starting point for your priority initiatives.</h1><p>{result.result.summary}</p>{result.emailDelivery === 'sent' ? <div className="pulse-email-state is-sent">A copy of this snapshot has been sent to {result.email}.</div> : <div className="pulse-email-state">Your snapshot has been safely recorded. An email copy will follow once delivery is confirmed.</div>}</div><div className="pulse-score-grid">{result.result.dimensions.map((dimension) => <ScoreBar dimension={dimension} key={dimension.key}/>)}</div><section className="pulse-actions"><p className="pulse-eyebrow">Your three practical next actions</p><h2>What to strengthen first</h2><ol>{result.result.actions.map((action) => <li key={action.title}><span>{action.title}</span><p>{action.text}</p></li>)}</ol></section><aside className="pulse-result-note"><b>A useful starting point, not a promise.</b><p>This snapshot reflects the selections you made. It is not an audit, a funding assessment or a guarantee of results.</p></aside><button type="button" className="pulse-text-link" onClick={() => { setResult(null); setStep(0); setForm({ sessionId: newSessionId(), country: 'AU', portfolioFocus: [], constraintThemes: [], marketingConsent: false, resourceAcknowledged: false, honeypot: '', sourceUrl: window.location.href, referrer: document.referrer || '' }); }}>Start another snapshot</button></section></main>;

  return <main className="pulse-page"><section className="pulse-hero"><nav className="pulse-nav"><a href="https://www.civicpath.com.au" className="pulse-wordmark"><span>C</span> CivicPath</a><a href="#pulse-assessment" className="pulse-nav-link">Five-minute readiness pulse <i>↓</i></a></nav><div className="pulse-hero-grid"><div><p className="pulse-eyebrow">For Australian and New Zealand councils</p><h1>Can your priority initiatives be understood in one decision-ready view?</h1><p className="pulse-lead">Take a practical five-minute pulse of the working view behind your council’s priority initiatives. Leave with a clear baseline and three next actions—before any sales conversation.</p><div className="pulse-hero-actions"><a href="#pulse-assessment" className="pulse-primary-cta">Get your readiness snapshot <i>→</i></a><span>No project data required</span></div></div><aside className="pulse-hero-card"><p>What you will receive</p><ul><li><b>Three readiness dimensions</b><span>Visibility, strategic connection and decision readiness.</span></li><li><b>A practical starting point</b><span>Three sensible actions shaped by the selections you make.</span></li><li><b>A copy by email</b><span>Useful for a working discussion with colleagues.</span></li></ul><small>Not a funding assessment. No claims about your projects are made.</small></aside></div></section><section id="pulse-assessment" className="pulse-assessment"><div className="pulse-progress"><div><p className="pulse-eyebrow">Council Portfolio Readiness Pulse</p><h2>Build your snapshot</h2></div><ol>{steps.map((name, index) => <li className={index === step ? 'is-current' : index < step ? 'is-complete' : ''} key={name}><i>{index < step ? '✓' : index + 1}</i><span>{name}</span></li>)}</ol></div><form onSubmit={submit} noValidate><div className="pulse-step-meta"><span>Step {step + 1} of 4</span><b>About five minutes</b></div>{step === 0 && <section className="pulse-form-panel"><div className="pulse-panel-heading"><p className="pulse-eyebrow">Set the context</p><h2>Tell us what you want to make easier.</h2><p>We start with the outcome you are trying to support—not a generic diagnostic.</p></div><div className="pulse-form-grid"><label className="pulse-full">Council or regional organisation<input value={form.councilName || ''} onChange={(event) => update('councilName', event.target.value)} placeholder="e.g. Example Regional Council" required/></label><label>Country<select value={form.country} onChange={(event) => { update('country', event.target.value); update('stateRegion', ''); }}><option value="AU">Australia</option><option value="NZ">New Zealand</option></select></label><label>State or region<select value={form.stateRegion || ''} onChange={(event) => update('stateRegion', event.target.value)}><option value="">Choose your state or region</option>{regions[form.country].map((region) => <option key={region} value={region}>{region}</option>)}</select></label><label>Your role<select value={form.role || ''} onChange={(event) => update('role', event.target.value)}><option value="">Choose your role</option>{roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>{form.role === 'other' && <label>Describe your role<input value={form.roleOther || ''} onChange={(event) => update('roleOther', event.target.value)} placeholder="Your council role"/></label>}<label className={form.role === 'other' ? '' : 'pulse-full'}>What would make the greatest practical difference right now?<select value={form.decisionUseCase || ''} onChange={(event) => update('decisionUseCase', event.target.value)}><option value="">Choose the outcome you need</option>{useCases.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>{form.decisionUseCase === 'other' && <label className="pulse-full">Describe the practical outcome<input value={form.decisionUseCaseOther || ''} onChange={(event) => update('decisionUseCaseOther', event.target.value)} placeholder="What would you like to make easier?"/></label>}</div><MultiChoice label="Which portfolio themes are most relevant?" note="Choose up to four. This gives your result useful context without asking for project-level data." options={focusOptions} values={form.portfolioFocus} onChange={(value) => update('portfolioFocus', value)}/>{form.portfolioFocus.includes('other') && <label className="pulse-other-input">Other portfolio focus<input value={form.portfolioFocusOther || ''} onChange={(event) => update('portfolioFocusOther', event.target.value)} placeholder="Describe the focus area"/></label>}</section>}{step === 1 && <section className="pulse-question-stack">{currentQuestions.map((question) => <RadioQuestion key={question.key} question={question} value={form[question.key]} onChange={(value) => update(question.key, value)}/>)}</section>}{step === 2 && <section className="pulse-question-stack">{currentQuestions.map((question) => <RadioQuestion key={question.key} question={question} value={form[question.key]} onChange={(value) => update(question.key, value)}/>) }<section className="pulse-form-panel"><MultiChoice label="Which constraint themes are most likely to slow progress?" note="Choose up to five. You are selecting themes only—no confidential project details are needed." options={constraintOptions} values={form.constraintThemes} onChange={(value) => update('constraintThemes', value)} max={5}/>{form.constraintThemes.includes('other') && <label className="pulse-other-input">Other material constraint<input value={form.constraintThemesOther || ''} onChange={(event) => update('constraintThemesOther', event.target.value)} placeholder="Describe the constraint"/></label>}<label className="pulse-request-note">Optional context for your snapshot<textarea value={form.requestNote || ''} onChange={(event) => update('requestNote', event.target.value)} placeholder="For example: a leadership meeting, planning milestone or funding discussion coming up." maxLength="320"/><small>{(form.requestNote || '').length}/320</small></label></section></section>}{step === 3 && <section className="pulse-form-panel pulse-capture-panel"><div className="pulse-panel-heading"><p className="pulse-eyebrow">Send the snapshot</p><h2>Where should the result go?</h2><p>Your answers are first calculated into a concise, useful snapshot. Add your details to receive a copy and support the follow-up you have requested.</p></div><div className="pulse-form-grid"><label>First name<input value={form.firstName || ''} onChange={(event) => update('firstName', event.target.value)} autoComplete="given-name" required/></label><label>Last name<input value={form.lastName || ''} onChange={(event) => update('lastName', event.target.value)} autoComplete="family-name" required/></label><label className="pulse-full">Council work email<input type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} placeholder="name@council.gov.au" autoComplete="email" required/></label><label className="pulse-honeypot" aria-hidden="true">Leave this field blank<input tabIndex="-1" autoComplete="off" value={form.honeypot || ''} onChange={(event) => update('honeypot', event.target.value)}/></label></div><label className="pulse-consent"><input type="checkbox" checked={Boolean(form.resourceAcknowledged)} onChange={(event) => update('resourceAcknowledged', event.target.checked)}/><span>I request this Portfolio Readiness Snapshot and understand CivicPath will use these details to send it and manage this enquiry in accordance with the <a href="/portfolio-readiness-pulse/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.</span></label><label className="pulse-consent"><input type="checkbox" checked={Boolean(form.marketingConsent)} onChange={(event) => update('marketingConsent', event.target.checked)}/><span>Yes, send me occasional practical CivicPath updates for Australian and New Zealand council teams. I can unsubscribe at any time.</span></label><p className="pulse-privacy-note">Marketing consent is optional and is not required to receive your requested snapshot. CivicPath stores public assessment leads separately from council tenant and project data.</p></section>}<div className="pulse-step-actions">{step > 0 ? <button type="button" className="pulse-secondary-cta" onClick={back}>Back</button> : <span/>}{step < 3 ? <button type="button" className="pulse-primary-cta" onClick={advance}>Continue <i>→</i></button> : <button type="submit" className="pulse-primary-cta" disabled={submitting}>{submitting ? 'Creating your snapshot…' : 'Create my readiness snapshot'} <i>→</i></button>}</div></form></section><section className="pulse-proof"><p>Designed for practical council conversations</p><div><span>5–15 priority initiatives</span><span>Structured choices first</span><span>Clear next actions</span><span>No funding guarantees</span></div></section></main>;
}
