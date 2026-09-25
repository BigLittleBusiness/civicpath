import { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { AltchaVerification } from "../components/AltchaVerification";
import "./Contact.css";

const gateLogo = "/assets/civicpath-gate.webp";
const apiBase = (import.meta.env.VITE_CIVICPATH_API_BASE_URL || "https://app.civicpath.com.au/v1").replace(/\/$/, "");

type EnquiryType = "council_proof" | "sales" | "general";
type FieldKey = "firstName" | "lastName" | "email" | "message" | "privacyAcknowledged" | "altcha";
type EnquiryOption = { value: EnquiryType; label: string; subject: string; description: string };

const options: EnquiryOption[] = [
  { value: "council_proof", label: "Council Proof", subject: "Council Proof enquiry", description: "Talk through a focused 60-day starting point for one live portfolio." },
  { value: "sales", label: "CivicPath for your Council", subject: "Sales enquiry", description: "Explore whether CivicPath fits the way your team plans, prioritises and progresses projects." },
  { value: "general", label: "A general question", subject: "General enquiry", description: "Ask a practical question about CivicPath, implementation or fit." },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", councilName: "", role: "", enquiryType: "council_proof" as EnquiryType, message: "", privacyAcknowledged: false, altcha: "", honeypot: "" });
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const selectedOption = options.find((option) => option.value === form.enquiryType) || options[0];
  const verificationKey = useMemo(() => `${form.enquiryType}-${submitted ? "complete" : "active"}`, [form.enquiryType, submitted]);

  const validateField = (key: FieldKey, value = form[key]) => {
    if (key === "firstName") return String(value).trim() ? "" : "Please enter your first name.";
    if (key === "lastName") return String(value).trim() ? "" : "Please enter your last name.";
    if (key === "email") return emailPattern.test(String(value).trim()) ? "" : "Enter a valid work email address, for example name@council.gov.au.";
    if (key === "message") return String(value).trim().length >= 10 ? "" : "Please add at least 10 characters so we have useful context.";
    if (key === "privacyAcknowledged") return value ? "" : "Please acknowledge the Privacy Notice before sending your enquiry.";
    if (key === "altcha") return value ? "" : "Please complete the verification check before sending your enquiry.";
    return "";
  };

  const update = (key: keyof typeof form, value: string | boolean) => {
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
    if ((key as FieldKey) in touched && touched[key as FieldKey]) setFieldErrors((current) => ({ ...current, [key]: validateField(key as FieldKey, value) }));
  };
  const touch = (key: FieldKey) => () => {
    setTouched((current) => ({ ...current, [key]: true }));
    setFieldErrors((current) => ({ ...current, [key]: validateField(key) }));
  };
  const selectEnquiryType = (value: EnquiryType) => setForm((current) => ({ ...current, enquiryType: value, altcha: "" }));
  const classFor = (key: FieldKey) => touched[key] && fieldErrors[key] ? "is-invalid" : touched[key] ? "is-valid" : "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const requiredFields: FieldKey[] = ["firstName", "lastName", "email", "message", "privacyAcknowledged", "altcha"];
    const nextErrors = Object.fromEntries(requiredFields.map((key) => [key, validateField(key)])) as Partial<Record<FieldKey, string>>;
    setTouched(Object.fromEntries(requiredFields.map((key) => [key, true])));
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/public/contact-enquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, sourceUrl: window.location.href, referrer: document.referrer || "" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.details?.[0] || body.error || "Your enquiry could not be sent. Please try again.");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Your enquiry could not be sent. Please try again.");
    } finally { setSubmitting(false); }
  };

  if (submitted) return <main className="contact-page"><header className="contact-header"><Link href="/" className="contact-brand"><img src={gateLogo} alt="" /><span>CivicPath</span></Link></header><section className="contact-complete" aria-labelledby="contact-success-heading"><div className="contact-success-mark" aria-hidden="true">✓</div><p className="contact-kicker">Enquiry recorded</p><h1 id="contact-success-heading">Thank you. Your enquiry has been sent.</h1><p>Your <strong>{selectedOption.label}</strong> enquiry has been recorded and securely routed to the CivicPath team. We will respond through the contact details you supplied.</p><div className="contact-success-note"><span aria-hidden="true">✓</span><div><b>What happens next</b><p>We will review the context you shared and come back with the most useful next practical step.</p></div></div><Link href="/" className="contact-button">Return to CivicPath <span>→</span></Link></section></main>;

  return <main className="contact-page"><header className="contact-header"><Link href="/" className="contact-brand"><img src={gateLogo} alt="CivicPath" /><span>CivicPath</span></Link><Link href="/" className="contact-back">← Back to CivicPath</Link></header><section className="contact-shell"><div className="contact-intro"><p className="contact-kicker">Start a practical conversation</p><h1>What would make your next project conversation more useful?</h1><p>Tell us a little about the outcome your Council is working toward. The first conversation is about fit and the next practical step—not a generic software demonstration.</p><aside><b>For regional council teams</b><span>Economic development · strategy · infrastructure · grants · executive leadership</span></aside></div><form className="contact-form" onSubmit={submit} noValidate aria-busy={submitting}><div className="contact-form-head"><p className="contact-kicker">Contact CivicPath</p><h2>Choose the conversation you need.</h2></div><div className="contact-inquiry-select"><label htmlFor="contact-enquiry-type">What would you like to discuss?</label><select id="contact-enquiry-type" value={form.enquiryType} onChange={(event) => selectEnquiryType(event.target.value as EnquiryType)} disabled={submitting}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><p><b>CivicPath - {selectedOption.subject}</b><span>{selectedOption.description}</span></p></div><div className="contact-fields"><label>First name<input className={classFor("firstName")} value={form.firstName} onChange={(event) => update("firstName", event.target.value)} onBlur={touch("firstName")} autoComplete="given-name" required disabled={submitting} aria-invalid={Boolean(touched.firstName && fieldErrors.firstName)} aria-describedby="contact-first-name-error"/>{touched.firstName && fieldErrors.firstName && <small id="contact-first-name-error" className="inline-field-error" role="alert">{fieldErrors.firstName}</small>}</label><label>Last name<input className={classFor("lastName")} value={form.lastName} onChange={(event) => update("lastName", event.target.value)} onBlur={touch("lastName")} autoComplete="family-name" required disabled={submitting} aria-invalid={Boolean(touched.lastName && fieldErrors.lastName)} aria-describedby="contact-last-name-error"/>{touched.lastName && fieldErrors.lastName && <small id="contact-last-name-error" className="inline-field-error" role="alert">{fieldErrors.lastName}</small>}</label><label className="contact-full">Council work email<input className={classFor("email")} type="email" value={form.email} onChange={(event) => update("email", event.target.value)} onBlur={touch("email")} autoComplete="email" placeholder="name@council.gov.au" required disabled={submitting} aria-invalid={Boolean(touched.email && fieldErrors.email)} aria-describedby="contact-email-error"/>{touched.email && fieldErrors.email && <small id="contact-email-error" className="inline-field-error" role="alert">{fieldErrors.email}</small>}</label><label>Council or organisation <small>Optional</small><input value={form.councilName} onChange={(event) => update("councilName", event.target.value)} autoComplete="organization" placeholder="e.g. Example Regional Council" disabled={submitting} /></label><label>Your role <small>Optional</small><input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="e.g. Economic Development Manager" disabled={submitting} /></label><label className="contact-full">What would you like to make easier?<textarea className={classFor("message")} value={form.message} onChange={(event) => update("message", event.target.value)} onBlur={touch("message")} minLength={10} maxLength={3000} placeholder="For example: making a group of priority initiatives easier to compare before an Executive, planning or funding discussion." required disabled={submitting} aria-invalid={Boolean(touched.message && fieldErrors.message)} aria-describedby="contact-message-error"/><small className="contact-count">{form.message.length}/3000</small>{touched.message && fieldErrors.message && <small id="contact-message-error" className="inline-field-error" role="alert">{fieldErrors.message}</small>}</label><label className="contact-honeypot" aria-hidden="true">Leave this field blank<input tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(event) => update("honeypot", event.target.value)} /></label></div><AltchaVerification key={verificationKey} challengeUrl={`${apiBase}/public/contact-challenge?purpose=${form.enquiryType === "council_proof" ? "council_proof" : form.enquiryType}`} onVerified={(payload) => { update("altcha", payload); setTouched((current) => ({ ...current, altcha: true })); }}/>{touched.altcha && fieldErrors.altcha && <p className="inline-field-error contact-verification-error" role="alert">{fieldErrors.altcha}</p>}<label className="contact-consent"><input type="checkbox" checked={form.privacyAcknowledged} onChange={(event) => update("privacyAcknowledged", event.target.checked)} onBlur={touch("privacyAcknowledged")} disabled={submitting} aria-invalid={Boolean(touched.privacyAcknowledged && fieldErrors.privacyAcknowledged)}/><span>I understand CivicPath will use these details to respond to this enquiry and manage it in accordance with its Privacy Notice.</span></label>{touched.privacyAcknowledged && fieldErrors.privacyAcknowledged && <p className="inline-field-error contact-consent-error" role="alert">{fieldErrors.privacyAcknowledged}</p>}{error && <p className="contact-error" role="alert">{error}</p>}{submitting && <p className="contact-submission-status" role="status" aria-live="polite"><span className="contact-spinner" aria-hidden="true" />Sending your enquiry securely…</p>}<button type="submit" className="contact-button" disabled={submitting || !form.altcha || !form.privacyAcknowledged}>{submitting ? <><span className="contact-spinner" aria-hidden="true" />Sending enquiry…</> : <>Send enquiry <span>→</span></>}</button><p className="contact-note">CivicPath will never ask for passwords, access codes or payment details through this form.</p></form></section></main>;
}
