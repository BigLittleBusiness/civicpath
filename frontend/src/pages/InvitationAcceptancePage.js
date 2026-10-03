import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import './AccountLifecyclePage.css';

const roleLabel = (role) => String(role || '').split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
function Brand() { return <Link className="account-mobile-brand" to="/login"><img src="/civicpath-quartermark.png" alt=""/> CivicPath</Link>; }

export default function InvitationAcceptancePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (token.length < 20) { if (active) { setError('This invitation link is incomplete. Ask a Council administrator to send a new invitation.'); setLoading(false); } return; }
      try {
        const response = await api.get('/auth/invitations/accept', { params: { token } });
        if (active) setInvitation(response.data.data);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.error || 'This invitation link is invalid or has expired. Ask a Council administrator to send a new invitation.');
      } finally { if (active) setLoading(false); }
    };
    load(); return () => { active = false; };
  }, [token]);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (password !== confirmPassword) return setError('The two password entries do not match.');
    setSubmitting(true);
    try { await api.post('/auth/invitations/accept', { token, password }); setAccepted(true); }
    catch (requestError) { setError(requestError.response?.data?.error || 'This invitation could not be accepted. Ask a Council administrator to send a new one.'); }
    finally { setSubmitting(false); }
  };

  return <main className="account-page account-page-simple"><section className="account-content"><div className="account-form-wrap narrow"><Brand/><p className="card-eyebrow">Council workspace invitation</p><h2>{accepted ? 'Your access is ready' : 'Join your CivicPath workspace'}</h2>{loading ? <p className="account-lead">Checking your secure invitation…</p> : error && !invitation ? <div className="account-notice">{error}<p className="account-signin"><Link to="/login">Return to sign in</Link></p></div> : accepted ? <div className="account-success"><b>Account created</b><p>Your password has been set for {invitation?.organizationName || 'your Council workspace'}. Sign in with your work email to start using CivicPath.</p><Link className="primary-button" to="/login">Sign in to CivicPath</Link></div> : <><p className="account-lead">Welcome, {invitation?.firstName}. You are joining <strong>{invitation?.organizationName}</strong> as <strong>{roleLabel(invitation?.role)}</strong>. Set a password to activate your access.</p><form className="account-form" onSubmit={submit}><label>Work email<input value={invitation?.email || ''} disabled readOnly/></label><label>Choose a password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength="12" required/></label><label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength="12" required/></label><small className="account-hint">Use at least 12 characters. Your invitation is one-time and becomes invalid after acceptance.</small>{error ? <p className="form-message">{error}</p> : null}<button className="primary-button account-submit" disabled={submitting} type="submit">{submitting ? <><i className="inline-spinner"/> Activating access…</> : 'Set password and join'}</button></form></>}</div></section></main>;
}
