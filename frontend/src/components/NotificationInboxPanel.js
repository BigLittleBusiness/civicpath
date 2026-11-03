import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './notificationReliability.css';

const dateLabel = (value) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable'; };
export function NotificationInboxPanel({ role = 'executive', client = api }) {
  const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [busyId, setBusyId] = useState(null); const [announcement, setAnnouncement] = useState('');
  const canWrite = ['org_admin', 'portfolio_manager', 'contributor'].includes(role);
  const load = async (append = false) => {
    setLoading(true); setError('');
    try {
      const response = await client.get('/notifications/inbox', { params: { limit: 20, ...(append && cursor ? { cursor } : {}) } });
      const data = response.data.data;
      setItems((previous) => append ? [...previous, ...data.items.filter((item) => !previous.some((existing) => existing.id === item.id))] : data.items);
      setCursor(data.nextCursor);
    } catch { setError('Your notification inbox could not be loaded. Try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    client.get('/notifications/inbox', { params: { limit: 20 } }).then((response) => { if (active) { setItems(response.data.data.items); setCursor(response.data.data.nextCursor); } }).catch(() => { if (active) setError('Your notification inbox could not be loaded. Try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);
  const markRead = async (id) => {
    setBusyId(id); setError('');
    try { const response = await client.patch(`/notifications/inbox/${id}/read`, {}); setItems((previous) => previous.map((item) => item.id === id ? { ...item, readAt: response.data.data.readAt } : item)); setAnnouncement('Notification marked as read.'); }
    catch { setError('This notification could not be marked as read. It may have expired or your access may have changed. Refresh the inbox.'); }
    finally { setBusyId(null); }
  };
  return <section className="notification-panel" aria-labelledby="notification-inbox-title">
    <div className="notification-heading"><h2 id="notification-inbox-title">Notification inbox</h2><button type="button" disabled={loading} onClick={() => load(false)}>Refresh inbox</button></div>
    <p>Generic reminders only. Open your collaboration workspace to review current information; stale or withdrawn records are not shown. Email acceptance does not guarantee inbox delivery.</p>
    {!canWrite ? <p>Your account has read-only inbox access.</p> : null}
    {loading ? <p role="status">Loading notifications…</p> : null}
    {announcement ? <p role="status">{announcement}</p> : null}
    {error ? <div><p role="alert">{error}</p><button type="button" onClick={() => load(false)}>Retry inbox</button></div> : null}
    {!loading && !error && !items.length ? <p>No current notifications. You are up to date.</p> : null}
    <ul className="notification-list">{items.map((item) => <li key={item.id} className={item.readAt ? 'notification-read' : ''}>
      <article><h3>{item.title}</h3><p>{item.text}</p><p><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time> · {item.readAt ? 'Read' : 'Unread'}</p>
      {canWrite && !item.readAt ? <button type="button" disabled={busyId === item.id} onClick={() => markRead(item.id)} aria-label={`Mark ${item.title} as read`}>{busyId === item.id ? 'Saving…' : 'Mark as read'}</button> : null}</article>
    </li>)}</ul>
    {cursor ? <button type="button" disabled={loading} onClick={() => load(true)}>Load more notifications</button> : null}
  </section>;
}
export default NotificationInboxPanel;
