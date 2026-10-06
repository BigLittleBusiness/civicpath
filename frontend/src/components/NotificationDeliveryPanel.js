import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

const date = (value) => value ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

export function NotificationDeliveryPanel() {
  const [records, setRecords] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/notification-delivery').then((response) => setRecords(response.data.data)).catch((requestError) => setError(requestError.response?.data?.error || 'Message delivery records could not be loaded.')).finally(() => setLoading(false)); }, []);
  return <section className="admin-section"><div className="admin-card delivery-monitor"><div className="admin-card-head"><div><p className="card-eyebrow">Transactional email operations</p><h3>Message delivery monitor</h3><p className="admin-copy">Only outcome data is retained: no email body, password-reset token or invitation link is stored here. Failed security links should be regenerated through their original flow, never resent from historical content.</p></div></div>{loading ? <div className="admin-loading">Loading message outcomes…</div> : error ? <p className="form-message">{error}</p> : records.length ? <div className="delivery-list">{records.map((record) => <article key={record.id}><span className={`delivery-state ${record.status}`}>{record.status}</span><div><b>{record.subject}</b><p>{record.category.replace(/_/g, ' ')} · {record.Organization?.name || 'Platform notification'} · {date(record.createdAt)}</p><small>{record.retryGuidance}</small>{record.error ? <em>{record.error}</em> : null}</div></article>)}</div> : <div className="admin-empty"><span>✓</span><div><b>No transactional delivery records yet</b><p>Account, invitation, billing and password-reset outcomes will appear here once messages are attempted.</p></div></div>}</div></section>;
}
