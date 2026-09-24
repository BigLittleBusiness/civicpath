import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import { AltchaVerification } from './AltchaVerification';

const categories = [
  ['access', 'Access or account'],
  ['portfolio', 'Portfolio or project workflow'],
  ['grant_lifecycle', 'Grant lifecycle'],
  ['data', 'Data or import'],
  ['billing', 'Billing'],
  ['technical', 'Technical issue'],
  ['other', 'Another support matter'],
];

export function SupportContactPanel() {
  const [form, setForm] = useState({ category: 'portfolio', subject: '', message: '', altcha: '', honeypot: '' });
  const [verificationKey, setVerificationKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.altcha) return toast('Please complete the verification check before sending your support enquiry.');
    setSubmitting(true);
    try {
      await api.post('/support/contact-enquiries', form);
      toast.success('Your support enquiry has been recorded.');
      setForm({ category: 'portfolio', subject: '', message: '', altcha: '', honeypot: '' });
      setVerificationKey((value) => value + 1);
    } catch (error) {
      toast.error(error.response?.data?.details?.[0] || error.response?.data?.error || 'Your support enquiry could not be sent. Please try again.');
    } finally { setSubmitting(false); }
  };

  return <section className="settings-card support-contact-card"><div><p className="card-eyebrow">Support</p><h3>Send a support enquiry</h3><p className="card-copy">Use this protected form to request help. Your enquiry is recorded in your CivicPath workspace and securely routed to the support team.</p></div><form className="support-contact-form" onSubmit={submit} noValidate><div className="field-grid"><label>Category<select value={form.category} onChange={update('category')}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Subject<input value={form.subject} onChange={update('subject')} minLength="3" maxLength="240" required placeholder="What do you need help with?"/></label><label className="support-message">What happened, and what were you trying to do?<textarea value={form.message} onChange={update('message')} minLength="10" maxLength="3000" required placeholder="Include enough context for a useful response. Do not include passwords, access codes or payment details."/></label><label className="support-honeypot" aria-hidden="true">Leave this field blank<input tabIndex="-1" autoComplete="off" value={form.honeypot} onChange={update('honeypot')}/></label></div><AltchaVerification key={verificationKey} challengeUrl="/v1/support/contact-challenge" onVerified={(value) => setForm((current) => ({ ...current, altcha: value }))}/><div className="support-contact-actions"><small>Every support enquiry requires a verification check and remains visible in the platform support queue.</small><button className="primary-button" type="submit" disabled={submitting || !form.altcha}>{submitting ? 'Sending…' : 'Send support enquiry'}</button></div></form></section>;
}
