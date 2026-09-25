import React, { useMemo, useRef, useState } from 'react';
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

const acceptedExtensions = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx'];
const maxFiles = 3;
const maxFileBytes = 10 * 1024 * 1024;
const categoryLabel = (value) => categories.find(([category]) => category === value)?.[1] || 'Support enquiry';

function validateField(key, value, { altcha } = {}) {
  if (key === 'subject') return value.trim().length < 3 ? 'Please add a short subject of at least 3 characters.' : '';
  if (key === 'message') return value.trim().length < 10 ? 'Please add at least 10 characters so the support team has useful context.' : '';
  if (key === 'altcha') return altcha ? '' : 'Please complete the verification check before sending your support enquiry.';
  return '';
}

function fileIssue(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!acceptedExtensions.includes(extension)) return `${file.name}: use PNG, JPEG, WebP, PDF, TXT, Word or Excel files only.`;
  if (file.size > maxFileBytes) return `${file.name}: files must be 10 MB or smaller.`;
  return '';
}

export function SupportContactPanel() {
  const [form, setForm] = useState({ category: 'portfolio', subject: '', message: '', altcha: '', honeypot: '' });
  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [verificationKey, setVerificationKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const attachmentInputRef = useRef(null);

  const update = (key) => (event) => {
    const value = event.target.value;
    setSuccessMessage('');
    setForm((current) => ({ ...current, [key]: value }));
    if (touched[key]) setErrors((current) => ({ ...current, [key]: validateField(key, value, { altcha: key === 'altcha' ? value : form.altcha }) }));
  };
  const touch = (key) => () => {
    setTouched((current) => ({ ...current, [key]: true }));
    setErrors((current) => ({ ...current, [key]: validateField(key, form[key], { altcha: form.altcha }) }));
  };

  const attachmentSummary = useMemo(() => attachments.reduce((total, file) => total + file.size, 0), [attachments]);
  const selectAttachments = (event) => {
    const selected = Array.from(event.target.files || []);
    const combined = [...attachments, ...selected].slice(0, maxFiles);
    const issues = [...attachments, ...selected].length > maxFiles ? [`Attach up to ${maxFiles} files per support enquiry.`] : combined.map(fileIssue).filter(Boolean);
    if (issues.length) {
      setErrors((current) => ({ ...current, attachments: issues[0] }));
      event.target.value = '';
      return;
    }
    setErrors((current) => ({ ...current, attachments: '' }));
    setAttachments(combined);
    event.target.value = '';
  };
  const removeAttachment = (index) => setAttachments((current) => current.filter((_file, fileIndex) => fileIndex !== index));

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {
      subject: validateField('subject', form.subject),
      message: validateField('message', form.message),
      altcha: validateField('altcha', form.altcha, { altcha: form.altcha }),
      attachments: attachments.map(fileIssue).find(Boolean) || '',
    };
    setTouched({ subject: true, message: true, altcha: true });
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setSubmitting(true);
    setSuccessMessage('');
    const selectedCategory = categoryLabel(form.category);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      attachments.forEach((file) => payload.append('attachments', file));
      await api.post('/support/contact-enquiries', payload);
      setSuccessMessage(`Your ${selectedCategory.toLowerCase()} enquiry has been recorded and securely routed to CivicPath support.`);
      setForm({ category: 'portfolio', subject: '', message: '', altcha: '', honeypot: '' });
      setAttachments([]);
      setTouched({});
      setErrors({});
      setVerificationKey((value) => value + 1);
    } catch (error) {
      toast.error(error.response?.data?.details?.[0] || error.response?.data?.error || 'Your support enquiry could not be sent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const subjectPreview = `CivicPath - Support enquiry - ${categoryLabel(form.category)}`;
  const fieldClass = (key) => touched[key] && errors[key] ? 'is-invalid' : touched[key] ? 'is-valid' : '';

  return <section className="settings-card support-contact-card"><div><p className="card-eyebrow">Support</p><h3>Send a support enquiry</h3><p className="card-copy">Use this protected form to request help. Your enquiry is recorded in your CivicPath workspace and securely routed to the support team.</p></div><form className="support-contact-form" onSubmit={submit} noValidate aria-busy={submitting}><div className="field-grid"><label>Category<select value={form.category} onChange={update('category')} disabled={submitting}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small className="support-subject-preview">Email subject: {subjectPreview}</small></label><label>Subject<input className={fieldClass('subject')} value={form.subject} onChange={update('subject')} onBlur={touch('subject')} minLength="3" maxLength="240" required placeholder="What do you need help with?" disabled={submitting} aria-invalid={Boolean(touched.subject && errors.subject)} aria-describedby="support-subject-error"/>{touched.subject && errors.subject && <small id="support-subject-error" className="inline-field-error" role="alert">{errors.subject}</small>}</label><label className="support-message">What happened, and what were you trying to do?<textarea className={fieldClass('message')} value={form.message} onChange={update('message')} onBlur={touch('message')} minLength="10" maxLength="3000" required placeholder="Include enough context for a useful response. Do not include passwords, access codes or payment details." disabled={submitting} aria-invalid={Boolean(touched.message && errors.message)} aria-describedby="support-message-error"/>{touched.message && errors.message && <small id="support-message-error" className="inline-field-error" role="alert">{errors.message}</small>}</label><label className="support-attachments">Helpful attachment <small>Optional · up to 3 files · 10 MB each</small><input ref={attachmentInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx" multiple onChange={selectAttachments} disabled={submitting}/><span>Choose screenshots or documents</span></label><p className="support-attachment-note">Files are kept private and are only available to authorised CivicPath support staff. Please do not upload passwords, access codes or payment details.</p>{errors.attachments && <p className="inline-field-error attachment-error" role="alert">{errors.attachments}</p>}{attachments.length > 0 && <div className="support-attachment-list" aria-label="Selected attachments">{attachments.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(file.size >= 1024 * 1024 ? 1 : 2)} MB</small></span><button type="button" onClick={() => removeAttachment(index)} disabled={submitting} aria-label={`Remove ${file.name}`}>×</button></div>)}<small>{attachments.length}/{maxFiles} selected · {(attachmentSummary / 1024 / 1024).toFixed(1)} MB total</small></div>}<label className="support-honeypot" aria-hidden="true">Leave this field blank<input tabIndex="-1" autoComplete="off" value={form.honeypot} onChange={update('honeypot')}/></label></div><AltchaVerification key={verificationKey} challengeUrl="/v1/support/contact-challenge" onVerified={(value) => { setForm((current) => ({ ...current, altcha: value })); setTouched((current) => ({ ...current, altcha: true })); setErrors((current) => ({ ...current, altcha: value ? '' : validateField('altcha', value, { altcha: value }) })); }}/>{touched.altcha && errors.altcha && <p className="inline-field-error" role="alert">{errors.altcha}</p>}{successMessage && <div className="support-submission-success" role="status" aria-live="polite"><span aria-hidden="true">✓</span><div><b>Support enquiry recorded</b><p>{successMessage}</p></div></div>}<div className="support-contact-actions"><small>Every support enquiry requires a verification check and remains visible in the platform support queue.</small><div className="support-submit-stack">{submitting && <span className="support-submitting-status" role="status" aria-live="polite"><i aria-hidden="true"/>Sending securely…</span>}<button className="primary-button" type="submit" disabled={submitting || !form.altcha}>{submitting ? <><i className="button-spinner" aria-hidden="true"/>Sending enquiry…</> : 'Send support enquiry'}</button></div></div></form></section>;
}
