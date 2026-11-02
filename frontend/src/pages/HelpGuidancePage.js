import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getRoleHelp, normalizeHelpQuery, questionLabel, searchRoleHelp } from '../lib/roleHelp';
import { useAuth } from '../features/AuthContext';
import './HelpGuidancePage.css';

function queryFromLocation(search) {
  return new URLSearchParams(search).get('q') || '';
}

export default function HelpGuidancePage() {
  const { user } = useAuth();
  const location = useLocation();
  const help = getRoleHelp(user?.role);
  const [query, setQuery] = useState(() => queryFromLocation(location.search));

  useEffect(() => { setQuery(queryFromLocation(location.search)); }, [location.search]);

  const normalizedQuery = normalizeHelpQuery(query);
  const entries = useMemo(() => searchRoleHelp(user?.role, query), [query, user?.role]);
  const isPlatformAdmin = user?.role === 'platform_admin';
  const returnPath = isPlatformAdmin ? '/admin' : '/settings';
  const returnLabel = isPlatformAdmin ? 'System Admin' : 'Workspace settings';

  return <main className="page-content help-guidance-page">
    <header className="help-guidance-hero">
      <div>
        <p className="card-eyebrow">Help & guidance</p>
        <h2>Your CivicPath guide</h2>
        <p>Practical answers for your current role: <b>{help.label}</b>. This guidance explains the functions you can access; it does not change your permissions or reveal sensitive operational details.</p>
      </div>
      <Link className="secondary-button" to={returnPath}>{returnLabel} <span aria-hidden="true">→</span></Link>
    </header>

    <section className="help-search-card" aria-labelledby="help-search-title">
      <div>
        <h3 id="help-search-title">Find an answer</h3>
        <p>Search the 30 questions prepared for your role.</p>
      </div>
      <label className="help-search-field">
        <span className="visually-hidden">Search role-specific help</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="For example: invite a colleague, import CSV or quarterly report" autoComplete="off" />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear help search">×</button> : null}
      </label>
    </section>

    <section className="help-result-section" aria-live="polite" aria-label="Role-specific help answers">
      <div className="help-result-head"><p><b>{entries.length}</b> {entries.length === 1 ? 'answer' : 'answers'} {normalizedQuery ? 'match your search' : 'available for your role'}</p>{normalizedQuery ? <button type="button" className="text-action" onClick={() => setQuery('')}>Clear search</button> : null}</div>
      {entries.length ? <div className="faq-list">{entries.map((item) => <article className="faq-entry" key={item.id}><span className="faq-number">{String(item.id).padStart(2, '0')}</span><div><h3>{questionLabel(item.question)}</h3><p>{item.answer}</p></div></article>)}</div> : <div className="help-empty"><b>No matching answer yet.</b><p>Try a simpler phrase, or clear the search to view all role-specific questions.</p><button type="button" className="secondary-button" onClick={() => setQuery('')}>Show all answers</button></div>}
    </section>

    <aside className="help-safety-note"><div><b>Still need help?</b><p>{isPlatformAdmin ? 'Use System Admin to review the support desk, delivery records or the security trail. Do not place passwords, MFA or recovery codes, payment details or private access links in operational notes.' : 'Use the protected support form in Workspace settings. Do not include passwords, MFA or recovery codes, payment details or private access links in a support request.'}</p></div><Link className="primary-button" to={returnPath}>{isPlatformAdmin ? 'Open System Admin' : 'Open support'} <span aria-hidden="true">→</span></Link></aside>
  </main>;
}
