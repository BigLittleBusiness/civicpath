import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './notificationReliability.css';

export const notificationDefaults = { emailEnabled: false, frequency: 'daily', quietStart: '20:00', quietEnd: '08:00', timezone: 'UTC' };
export function NotificationPreferencesPanel({ role = 'executive', client = api }) {
  const [preferences, setPreferences] = useState(notificationDefaults);
  const [policy, setPolicy] = useState({ emailEnabled: false, digestsEnabled: true, remindersEnabled: true });
  const [state, setState] = useState('loading'); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [canEdit, setCanEdit] = useState(false); const [configured, setConfigured] = useState(false); const [saving, setSaving] = useState(false);
  const load = async () => {
    setState('loading'); setError('');
    try {
      const response = await client.get('/notifications/preferences');
      setPreferences(response.data.data.preferences); setPolicy(response.data.data.policy);
      setCanEdit(response.data.data.canEdit); setConfigured(response.data.data.providerConfigured); setState('ready');
    } catch { setError('Notification preferences could not be loaded. Try again.'); setState('error'); }
  };
  useEffect(() => { let active = true; client.get('/notifications/preferences').then((response) => { if (!active) return; setPreferences(response.data.data.preferences); setPolicy(response.data.data.policy); setCanEdit(response.data.data.canEdit); setConfigured(response.data.data.providerConfigured); setState('ready'); }).catch(() => { if (active) { setError('Notification preferences could not be loaded. Try again.'); setState('error'); } }); return () => { active = false; }; }, [client]);
  const save = async (event, organisation = false) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      await client.put(organisation ? '/notifications/policy' : '/notifications/preferences', organisation ? policy : preferences);
      setMessage(organisation ? 'Organisation policy saved. Individual email opt-in is still required.' : 'Notification preferences saved.');
    } catch { setError('Preferences were not saved. Check your access and try again.'); }
    finally { setSaving(false); }
  };
  return <section className="notification-panel" aria-labelledby="notification-preferences-title">
    <h2 id="notification-preferences-title">Notification preferences</h2>
    <p>In-app notifications are available in your inbox. Optional collaboration email is off by default and requires both your consent and organisation approval. Security and account messages follow their original secure flows, not these optional preferences.</p>
    {state === 'loading' ? <p role="status">Loading notification preferences…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {state === 'error' ? <button type="button" onClick={load}>Retry loading preferences</button> : null}
    {message ? <p role="status">{message}</p> : null}
    {state === 'ready' ? <>
      {!canEdit ? <p>This account has read-only access to notification preferences.</p> : null}
      <p className="notification-notice">{configured ? 'SES is configured; provider acceptance does not guarantee inbox delivery.' : 'Email delivery is not configured. Saving consent does not send email.'} {!policy.emailEnabled ? 'Your organisation currently disables optional email.' : ''}</p>
      <form onSubmit={(event) => save(event)}>
        <fieldset disabled={!canEdit || saving}>
          <legend>Your optional collaboration emails</legend>
          <label className="notification-checkbox"><input type="checkbox" checked={preferences.emailEnabled} onChange={(event) => setPreferences({ ...preferences, emailEnabled: event.target.checked })}/> I opt in to generic collaboration digests and request reminders</label>
          <div className="notification-fields">
            <label>Frequency<select value={preferences.frequency} onChange={(event) => setPreferences({ ...preferences, frequency: event.target.value })}><option value="daily">At most daily per category</option><option value="weekly">At most weekly per category</option></select></label>
            <label>Quiet hours start<input type="time" required value={preferences.quietStart} onChange={(event) => setPreferences({ ...preferences, quietStart: event.target.value })}/></label>
            <label>Quiet hours end<input type="time" required value={preferences.quietEnd} onChange={(event) => setPreferences({ ...preferences, quietEnd: event.target.value })}/></label>
            <label>IANA timezone<input type="text" required maxLength={80} value={preferences.timezone} placeholder="Australia/Sydney" onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })}/></label>
          </div>
          <p>Use an IANA timezone such as Australia/Sydney, Pacific/Auckland or UTC. Equal quiet-hour boundaries turn the quiet window off. Quiet hours defer email only. Email contains no private collaboration text or security links.</p>
          <button type="submit">{saving ? 'Saving…' : 'Save my preferences'}</button>
        </fieldset>
      </form>
      {role === 'org_admin' && canEdit ? <form onSubmit={(event) => save(event, true)}>
        <fieldset disabled={saving}><legend>Organisation optional email policy</legend>
          <label className="notification-checkbox"><input type="checkbox" checked={policy.emailEnabled} onChange={(event) => setPolicy({ ...policy, emailEnabled: event.target.checked })}/> Allow optional collaboration email for opted-in members</label>
          <label className="notification-checkbox"><input type="checkbox" checked={policy.digestsEnabled} onChange={(event) => setPolicy({ ...policy, digestsEnabled: event.target.checked })}/> Allow generic digests</label>
          <label className="notification-checkbox"><input type="checkbox" checked={policy.remindersEnabled} onChange={(event) => setPolicy({ ...policy, remindersEnabled: event.target.checked })}/> Allow generic request reminders</label>
          <button type="submit">Save organisation policy</button>
        </fieldset>
      </form> : null}
    </> : null}
  </section>;
}
export default NotificationPreferencesPanel;
