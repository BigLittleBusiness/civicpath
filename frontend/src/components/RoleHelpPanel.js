import React from 'react';
import { Link } from 'react-router-dom';
import { getRoleHelp, getTopHelp, questionLabel } from '../lib/roleHelp';
import './roleHelp.css';

function helpUrl(query) {
  return `/help?q=${encodeURIComponent(query)}`;
}

export function ContextualHelpLink({ topic, label = 'Need help?' }) {
  return <Link className="contextual-help-link" to={helpUrl(topic)} aria-label={`${label}: ${topic}`}>{label} <span aria-hidden="true">→</span></Link>;
}

export function TopHelpPanel({ role }) {
  const help = getRoleHelp(role);
  const topHelp = getTopHelp(role);

  return <section className="top-help-panel" aria-labelledby="top-help-title">
    <div className="top-help-panel-head">
      <div>
        <p className="card-eyebrow">Help & guidance</p>
        <h2 id="top-help-title">Top help for your role</h2>
        <p>{help.label}: {help.summary}</p>
      </div>
      <Link className="secondary-button" to="/help">Open all 30 answers <span aria-hidden="true">→</span></Link>
    </div>
    <ol className="top-help-list">
      {topHelp.map((item) => <li key={item.id}><Link to={helpUrl(item.question)}><span>{String(item.id).padStart(2, '0')}</span><b>{questionLabel(item.question)}</b><i aria-hidden="true">→</i></Link></li>)}
    </ol>
  </section>;
}
