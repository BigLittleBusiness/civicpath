import React, { useState } from 'react';
import { api } from '../lib/api';
import './PrivilegedActionModal.css';

export function PrivilegedActionModal({ action, onClose }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (!action) return null;
  const submit = async (event) => {
    event.preventDefault(); setMessage(''); setSubmitting(true);
    try {
      await api.post('/auth/step-up', { password, code });
      await action.execute();
      onClose(true);
    } catch (error) { setMessage(error.response?.data?.error || 'The privileged action could not be confirmed.'); }
    finally { setSubmitting(false); }
  };
  return <div className="privileged-backdrop" role="dialog" aria-modal="true" aria-labelledby="privileged-title"><form className="privileged-modal" onSubmit={submit}><p className="card-eyebrow">Fresh security check</p><h3 id="privileged-title">Confirm: {action.label}</h3><p>For customer protection, enter your password and a current authenticator code. This confirmation is valid for ten minutes and is recorded in the security trail.</p><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></label><label>Authenticator or recovery code<input autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required/></label>{message ? <p className="form-message">{message}</p> : null}<div className="privileged-actions"><button className="secondary-button" type="button" onClick={() => onClose(false)}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Confirming…' : 'Confirm action'} <span>→</span></button></div></form></div>;
}
