import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { AltchaVerification } from '../components/AltchaVerification';
import './AccountLifecyclePage.css';

const categories = [['sales', 'Council plans and CivicPath'], ['council_proof', 'Council Proof'], ['general', 'General enquiry']];
const initial = { firstName: '', lastName: '', email: '', councilName: '', role: '', enquiryType: 'sales', message: '', privacyAcknowledged: false, honeypot: '' };

export default function PublicContactPage() {
  const [form, setForm] = useState(initial); const [altcha, setAltcha] = useState(''); const [challengeKey, setChallengeKey] = useState(0); const [submitted, setSubmitted] = useState(false); const [error, setError] = useState(''); const [sending, setSending] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!altcha) return setError('Please complete the verification check before sending your enquiry.');
    setSending(true);
    try {
      await api.post('/public/contact-enquiries', { ...form, altcha, sourceUrl: window.location.href, referrer: document.referrer || null });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Your enquiry could not be sent. Please try again.');
      setAltcha(''); setChallengeKey((current) => current + 1);
    } finally { setSending(false); }
  };
  const label = categories.find(([value]) => value === form.enquiryType)?.[1] || 'enquiry';
  return <main className="account-page account-page-simple"><section className="account-content"><div className="account-form-wrap narrow public-contact-wrap"><Link className="account-mobile-brand legal-brand" to="/login"><img src="/civicpath-quartermark.png" alt="CivicPath"/> CivicPath</Link><p className="card-eyebrow">Protected contact</p><h1>Start a useful conversation.</h1>{submitted ? <div className="account-success"><b>Enquiry received</b><p>Thank you. CivicPath has recorded your {label.toLowerCase()} enquiry and routed it to the appropriate team. A confirmation is sent when outbound email is configured; there is no need to submit again.</p><Link className="primary-button" to="/login">Return to sign in</Link></div> : <><p className="account-lead">Use this form for plans, Council Proof and general questions. Do not include passwords, access codes or payment details.</p><form className="account-form" onSubmit={submit} noValidate><div className="account-grid two"><label>First name<input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required/></label><label>Last name<input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required/></label></div><label>Work email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required/></label><label>Council or organisation<input value={form.councilName} onChange={set('councilName')} autoComplete="organization"/></label><div className="account-grid two"><label>Role or title<input value={form.role} onChange={set('role')} autoComplete="organization-title"/></label><label>What can CivicPath help with?<select value={form.enquiryType} onChange={set('enquiryType')}>{categories.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label></div><label>Tell us what would be useful<textarea value={form.message} onChange={set('message')} minLength="10" maxLength="3000" required placeholder="For example: a portfolio, strategy or funding workflow your Council wants to make clearer."/></label><label className="account-consent"><input type="checkbox" checked={form.privacyAcknowledged} onChange={set('privacyAcknowledged')} required/><span>I acknowledge the <Link to="/privacy" target="_blank" rel="noreferrer">CivicPath privacy notice</Link> and request a response to this enquiry.</span></label><input className="account-honeypot" tabIndex="-1" autoComplete="off" value={form.honeypot} onChange={set('honeypot')} aria-hidden="true"/><AltchaVerification key={challengeKey} challengeUrl={`/v1/public/contact-challenge?purpose=${form.enquiryType}`} onVerified={setAltcha}/>{error ? <p className="form-message">{error}</p> : null}<button className="primary-button account-submit" type="submit" disabled={sending || !altcha}>{sending ? <><i className="inline-spinner"/> Sending securely…</> : 'Send protected enquiry'}</button></form></>}</div></section></main>;
}
