import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
import './MfaPage.css';

export default function MfaPage() {
  const navigate = useNavigate();
  const { completeMfa } = useAuth();
  const [purpose, setPurpose] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const pending = await api.get('/auth/mfa/pending');
        setPurpose(pending.data.data.purpose);
        if (pending.data.data.purpose === 'setup') {
          const response = await api.post('/auth/mfa/setup');
          setSetup(response.data.data);
        }
      } catch { navigate('/login', { replace: true }); }
    })();
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault(); setMessage(''); setSubmitting(true);
    try {
      const result = await completeMfa(purpose === 'setup' ? '/auth/mfa/setup/verify' : '/auth/mfa/verify-login', { code });
      if (purpose === 'setup') { setRecoveryCodes(result.recoveryCodes || []); return; }
      navigate('/admin', { replace: true });
    } catch (error) { setMessage(error.response?.data?.error || 'The code could not be verified.'); }
    finally { setSubmitting(false); }
  };

  if (recoveryCodes.length) return <main className="mfa-page"><section className="mfa-card recovery-card"><img src="/gate-mark.png" alt="CivicPath"/><p className="card-eyebrow">Authenticator confirmed</p><h1>Save your recovery codes.</h1><p>Store these codes in a secure password manager. Each code works once if you lose access to your authenticator app.</p><div className="recovery-grid">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div><button className="primary-button" type="button" onClick={() => navigate('/admin', { replace: true })}>I have saved these codes <span>→</span></button></section></main>;
  return <main className="mfa-page"><section className="mfa-card"><img src="/gate-mark.png" alt="CivicPath"/><p className="card-eyebrow">System Administrator security</p><h1>{purpose === 'setup' ? 'Set up your authenticator app.' : 'Confirm your authenticator code.'}</h1><p>{purpose === 'setup' ? 'Scan this QR code with a standard authenticator app, such as 1Password, Authy, Google Authenticator or Microsoft Authenticator. Then enter the six-digit code it shows.' : 'Enter a current six-digit authenticator code, or one of your recovery codes.'}</p>{purpose === 'setup' && setup ? <div className="mfa-setup"><img src={setup.qrCodeDataUrl} alt="Authenticator setup QR code"/><details><summary>Can’t scan the code?</summary><code>{setup.manualKey}</code></details></div> : null}<form onSubmit={submit}><label>Authenticator or recovery code<input autoFocus autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456"/></label>{message ? <p className="form-message">{message}</p> : null}<button className="primary-button" type="submit" disabled={submitting || !purpose || (purpose === 'setup' && !setup)}>{submitting ? 'Verifying…' : purpose === 'setup' ? 'Verify and secure account' : 'Verify and continue'} <span>→</span></button></form><button className="forgot-link" type="button" onClick={() => navigate('/login')}>Return to sign in</button></section></main>;
}
