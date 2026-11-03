import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './notificationReliability.css';
export function ReliableNotificationDeliveryPanel({ client = api }) {
  const [rows, setRows] = useState([]); const [state, setState] = useState('loading');
  const load = async () => { setState('loading'); try { const response = await client.get('/notifications/delivery', { params: { limit: 25 } }); setRows(response.data.data); setState('ready'); } catch { setState('error'); } };
  useEffect(() => { let active = true; client.get('/notifications/delivery', { params: { limit: 25 } }).then((response) => { if (active) { setRows(response.data.data); setState('ready'); } }).catch(() => { if (active) setState('error'); }); return () => { active = false; }; }, [client]);
  return <section className="notification-panel" aria-labelledby="reliable-delivery-title"><h2 id="reliable-delivery-title">Notification delivery outcomes</h2>
    <p>Organisation administrators only. Accepted means SES accepted a message, not that it reached an inbox. Delivered means a cryptographically verified provider delivery event, not that a person read it. Uncertain outcomes are never automatically replayed; regenerate security links only through their original flow.</p>
    {state === 'loading' ? <p role="status">Loading outcomes…</p> : null}
    {state === 'error' ? <><p role="alert">Outcomes could not be loaded. Check administrator access and try again.</p><button type="button" onClick={load}>Retry outcomes</button></> : null}
    {state === 'ready' && !rows.length ? <p>No delivery outcomes yet.</p> : null}
    <ul className="notification-list">{rows.map((row) => <li key={row.id}><b>{row.category.replace(/_/g, ' ')}</b><p>{row.status} · Attempt {row.attempt} {row.errorCode ? `· ${row.errorCode}` : ''}</p></li>)}</ul>
  </section>;
}
export default ReliableNotificationDeliveryPanel;
