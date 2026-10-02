import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const submit = async (event) => { event.preventDefault(); setMessage(''); setSubmitting(true); try { const result = await signIn({ email, password }); navigate(result?.mfaRequired ? '/mfa' : '/dashboard'); } catch (error) { setMessage(error.response?.data?.error || 'Unable to sign in. Please check your details and try again.'); } finally { setSubmitting(false); } };
  return <main className="login-page"><section className="login-aside"><div className="login-brand"><img src="/civicpath-quartermark.png" alt=""/><span>CivicPath</span></div><div className="login-note"><p className="card-eyebrow">A clearer route forward</p><h1>See what needs to move next.</h1><p>CivicPath connects Council priorities to project readiness, funding pathways, decisions and delivery.</p><div><span>Priority</span><i/><span>Readiness</span><i/><span>Funding</span><i/><span>Delivery</span></div></div><small>Secure Council workspace</small></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><Link to="/" className="login-mobile-brand"><img src="/civicpath-quartermark.png" alt=""/> CivicPath</Link><p className="card-eyebrow">Welcome to CivicPath</p><h2>Sign in to your workspace</h2><p className="form-lead">System Administrators are prompted to verify an authenticator app after their password.</p><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required/></label>{message && <p className="form-message">{message}</p>}<button className="primary-button login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <span>→</span></>}</button><Link className="forgot-link" to="/forgot-password">Forgot password?</Link><p className="login-help">Need a CivicPath workspace? <Link to="/register">Create an account and choose your plan</Link></p></form></section></main>;
}
