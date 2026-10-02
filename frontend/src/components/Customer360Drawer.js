import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { formatAud, formatCents, formatDate, formatDateTime, initials, statusLabel } from '../lib/billingFormat';
import './Customer360Drawer.css';

const drawerTabs = ['Billing', 'Users', 'Relationship', 'Account'];

function Pill({ status, children }) {
  return <span className={`status-pill is-${status || 'none'}`}>{children || statusLabel(status)}</span>;
}

function SubscriptionSummary({ current, pricing, stripeLinks }) {
  if (!current) return <div className="drawer-empty">No subscription has been started for this council.</div>;
  const ended = current.endsAt && !current.accessActive;
  return <div className="sub-summary">
    <div className="sub-summary-top">
      <div><span className="sub-label">Current plan</span><h4>{current.planName}</h4></div>
      <Pill status={ended && current.status === 'active' ? 'expired' : current.status}/>
    </div>
    <div className="sub-figures">
      <div><span className="sub-label">{current.billingInterval === 'one_off' ? 'One-off price' : 'Annual price'}</span><b>{pricing ? formatAud(pricing.excludingGst) : '—'}</b><small>{pricing?.gstApplies ? `${formatAud(pricing.total)} incl. ${formatAud(pricing.gst)} GST` : 'No Australian GST'}</small></div>
      <div><span className="sub-label">Started</span><b>{formatDate(current.startsAt)}</b><small>{current.isBilled ? 'Billed through Stripe' : 'Not billed by Stripe'}</small></div>
      <div><span className="sub-label">{ended ? 'Ended' : current.renews ? 'Renews' : 'Access ends'}</span><b>{current.endsAt ? formatDate(current.endsAt) : 'Open-ended'}</b><small>{current.endsAt && !ended ? `${current.daysRemaining} days left` : ended ? 'Access stopped' : '—'}</small></div>
    </div>
    {current.endsAt && !ended ? <div className={`sub-progress ${current.daysRemaining <= 14 ? 'is-soon' : ''}`}><i style={{ width: `${Math.round((current.periodProgress ?? 0) * 100)}%` }}/></div> : null}
    {current.cancelAtPeriodEnd ? <p className="sub-alert">Set to cancel at the end of the current period.</p> : null}
    {current.status === 'past_due' ? <p className="sub-alert is-critical">The latest payment failed. Workspace access is paused until Stripe confirms payment.</p> : null}
    {stripeLinks?.customer || stripeLinks?.subscription ? <div className="sub-links">{stripeLinks.customer ? <a href={stripeLinks.customer} target="_blank" rel="noreferrer">Stripe customer <Icon name="external" size={12}/></a> : null}{stripeLinks.subscription ? <a href={stripeLinks.subscription} target="_blank" rel="noreferrer">Stripe subscription <Icon name="external" size={12}/></a> : null}</div> : null}
  </div>;
}

export function Customer360Drawer({ detail, onClose, onRefresh, onStepUp }) {
  const [tab, setTab] = useState(drawerTabs[0]);
  const [note, setNote] = useState(''); const [contact, setContact] = useState({ name: '', email: '', title: '', contactType: 'primary' }); const [stateReason, setStateReason] = useState(''); const [addingContact, setAddingContact] = useState(false);
  const [billing, setBilling] = useState(null); const [billingLoading, setBillingLoading] = useState(false); const [newPlan, setNewPlan] = useState(''); const [cancelWhen, setCancelWhen] = useState('period_end'); const [cancelReason, setCancelReason] = useState(''); const [refundOpen, setRefundOpen] = useState(null); const [refundNotes, setRefundNotes] = useState({});
  const loadBilling = async (customerId) => { setBillingLoading(true); try { const response = await api.get(`/admin/customers/${customerId}/billing`); setBilling(response.data.data); } catch (error) { toast.error(error.response?.data?.error || 'Billing history could not be loaded.'); } finally { setBillingLoading(false); } };
  useEffect(() => { if (detail?.customer?.id) { setBilling(null); setTab(drawerTabs[0]); loadBilling(detail.customer.id); } }, [detail?.customer?.id]);
  useEffect(() => { if (!detail) return undefined; const onKey = (event) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [detail, onClose]);
  if (!detail) return null;
  if (detail.loading) return <><div className="drawer-backdrop" onClick={onClose}/><aside className="customer-drawer"><div className="drawer-loading"><span className="drawer-loader"/>Loading council…</div></aside></>;
  const { customer, subscriptions = [], users = [], cases = [], contacts = [], notes = [], stateEvents = [], recentActivity = [] } = detail;
  const current = billing?.current || null;
  const openCaseCount = cases.filter((item) => !['resolved', 'closed'].includes(item.status)).length;
  const canChangePlan = current?.stripeSubscriptionId && current.billingInterval === 'annual' && current.accessActive;
  const canCancel = current?.stripeSubscriptionId && ['active', 'past_due'].includes(current.status) && !current.cancelAtPeriodEnd;
  const addNote = async (event) => { event.preventDefault(); if (!note.trim()) return; await api.post(`/admin/customers/${customer.id}/notes`, { body: note }); setNote(''); onRefresh(); };
  const addContact = async (event) => { event.preventDefault(); await api.post(`/admin/customers/${customer.id}/contacts`, contact); setContact({ name: '', email: '', title: '', contactType: 'primary' }); setAddingContact(false); onRefresh(); };
  const requestStatus = (status) => { if (status === customer.status) return; if (stateReason.trim().length < 8) { toast.error('Enter a reason of at least 8 characters.'); return; } onStepUp(`change ${customer.name} to ${status}`, async () => { await api.patch(`/admin/customers/${customer.id}/status`, { status, reason: stateReason }); setStateReason(''); await onRefresh(); }); };
  const requestPlanChange = () => { if (!newPlan || newPlan === current?.planCode) return; onStepUp(`change ${customer.name} to ${newPlan === 'civicpath-core' ? 'CivicPath Core' : 'CivicPath Essentials'}`, async () => { await api.post(`/admin/customers/${customer.id}/billing/change-plan`, { planCode: newPlan }); toast.success('Stripe plan change requested.'); setNewPlan(''); await loadBilling(customer.id); await onRefresh(); }); };
  const requestCancellation = () => { if (cancelReason.trim().length < 8) { toast.error('Enter a cancellation reason of at least 8 characters.'); return; } onStepUp(`${cancelWhen === 'immediate' ? 'cancel immediately' : 'cancel at period end'} for ${customer.name}`, async () => { await api.post(`/admin/customers/${customer.id}/billing/cancel`, { when: cancelWhen, reason: cancelReason }); toast.success('Stripe cancellation requested.'); setCancelReason(''); await loadBilling(customer.id); await onRefresh(); }); };
  const requestRefund = (invoice) => { const adminNote = refundNotes[invoice.id] || ''; if (adminNote.trim().length < 8) { toast.error('Enter an internal refund reason of at least 8 characters.'); return; } onStepUp(`refund ${formatCents(invoice.amountPaid, invoice.currency)} to ${customer.name}`, async () => { await api.post(`/admin/customers/${customer.id}/billing/refunds`, { invoiceId: invoice.id, reason: 'requested_by_customer', adminNote }); toast.success('Stripe refund requested.'); setRefundNotes((items) => ({ ...items, [invoice.id]: '' })); setRefundOpen(null); await loadBilling(customer.id); await onRefresh(); }); };

  return <>
    <div className="drawer-backdrop" onClick={onClose}/>
    <aside className="customer-drawer" role="dialog" aria-modal="true" aria-label={`${customer.name} customer details`}>
      <header className="drawer-head">
        <div className="drawer-identity"><span className="drawer-avatar">{initials(customer.name)}</span><div><p className="card-eyebrow">Customer 360°</p><h3>{customer.name}</h3><p>{customer.country} · {customer.organisationType?.replaceAll('_', ' ')}{customer.isDemo ? ' · demonstration' : ''}</p></div></div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="drawer-stats">
        <div><span>Tenant</span><Pill status={customer.status}/></div>
        <div><span>Plan</span><b>{current?.planName || subscriptions[0]?.ProductPlan?.name || '—'}</b></div>
        <div><span>Users</span><b>{users.filter((user) => user.status === 'active').length} active</b></div>
        <div><span>Open cases</span><b>{openCaseCount}</b></div>
      </div>
      <nav className="drawer-tabs" role="tablist">{drawerTabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item}{item === 'Users' ? <span>{users.length}</span> : null}</button>)}</nav>

      <div className="drawer-body">
        {tab === 'Billing' && (billingLoading && !billing ? <div className="drawer-loading"><span className="drawer-loader"/>Loading Stripe billing…</div> : !billing ? <div className="drawer-empty">Billing details are unavailable.</div> : <>
          <section className="drawer-section"><SubscriptionSummary current={current} pricing={billing.pricing} stripeLinks={billing.stripeLinks}/>
            <p className="drawer-meta">{billing.profile?.billingEmail || 'No billing contact'}{billing.profile?.abnNzbn ? ` · ABN/NZBN ${billing.profile.abnNzbn}` : ''}{billing.profile?.stripeCustomerId ? ` · ${billing.profile.stripeCustomerId}` : ''}</p>
          </section>

          {current?.isBilled ? <section className="drawer-section"><h4>Manage subscription</h4>
            {canChangePlan ? <div className="drawer-action"><div><b>Change annual plan</b><small>Takes effect immediately; Stripe invoices any adjustment, with GST for Australian councils.</small></div><div className="drawer-action-controls"><select value={newPlan} onChange={(event) => setNewPlan(event.target.value)}><option value="">Select plan</option>{current.planCode !== 'essentials' ? <option value="essentials">CivicPath Essentials</option> : null}{current.planCode !== 'civicpath-core' ? <option value="civicpath-core">CivicPath Core</option> : null}</select><button type="button" className="secondary-button" disabled={!newPlan} onClick={requestPlanChange}>Change plan</button></div></div> : <p className="drawer-note">{current.billingInterval === 'one_off' ? 'Council Proof is a one-off access period. The council upgrades from its Workspace settings with the $495 credit.' : 'There is no active Stripe subscription to change.'}</p>}
            {canCancel ? <div className="drawer-action is-danger"><div><b>Cancel subscription</b><small>Requires a written reason, your password and a fresh authenticator code.</small></div><div className="drawer-action-stack"><div className="segmented">{[['period_end', 'At period end'], ['immediate', 'Immediately']].map(([value, label]) => <button key={value} type="button" className={cancelWhen === value ? 'is-active' : ''} onClick={() => setCancelWhen(value)}>{label}</button>)}</div>{cancelWhen === 'immediate' ? <small className="danger-note">Immediate cancellation removes workspace access now.</small> : null}<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Internal reason (minimum 8 characters)"/><button type="button" className="danger-button" onClick={requestCancellation}>Request cancellation</button></div></div> : null}
          </section> : null}

          <section className="drawer-section"><h4>Invoices</h4>{billing.invoices?.length ? <div className="invoice-table">
            <div className="invoice-row invoice-head"><span>Invoice</span><span>Subtotal</span><span>GST</span><span>Total</span><span/></div>
            {billing.invoices.map((invoice) => <div key={invoice.id} className="invoice-block"><div className="invoice-row">
              <span className="invoice-id"><b>{invoice.number || 'Stripe invoice'}</b><small>{formatDate(invoice.paidAt || invoice.createdAt)} · <Pill status={invoice.status}/></small></span>
              <span>{formatCents(invoice.subtotal, invoice.currency)}</span><span>{invoice.tax ? formatCents(invoice.tax, invoice.currency) : '—'}</span><span><b>{formatCents(invoice.total, invoice.currency)}</b></span>
              <span className="invoice-actions">{invoice.invoicePdfUrl ? <a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer" title="Download PDF">PDF</a> : null}{invoice.refundable ? <button type="button" onClick={() => setRefundOpen(refundOpen === invoice.id ? null : invoice.id)}>Refund</button> : null}</span>
            </div>{refundOpen === invoice.id ? <div className="refund-inline"><input value={refundNotes[invoice.id] || ''} onChange={(event) => setRefundNotes((items) => ({ ...items, [invoice.id]: event.target.value }))} placeholder="Internal refund reason (minimum 8 characters)" autoFocus/><button type="button" className="danger-button" onClick={() => requestRefund(invoice)}>Refund {formatCents(invoice.amountPaid, invoice.currency)}</button></div> : null}</div>)}
          </div> : <div className="drawer-empty">Invoices appear here after Stripe confirms them.</div>}</section>

          {billing.refunds?.length ? <section className="drawer-section"><h4>Refunds</h4><div className="drawer-list">{billing.refunds.map((refund) => <div key={refund.id} className="drawer-list-row"><span><b>{formatCents(refund.amount, refund.currency)}</b><small>{formatDate(refund.createdAt)} · {refund.adminNote || refund.reason || 'No reason recorded'}</small></span><Pill status={refund.status === 'succeeded' ? 'paid' : refund.status}>{refund.status}</Pill></div>)}</div></section> : null}

          {billing.events?.length ? <section className="drawer-section"><details className="drawer-details"><summary>Recent Stripe events <span>{billing.events.length}</span></summary><div className="drawer-list">{billing.events.slice(0, 12).map((event) => <div key={event.id} className="drawer-list-row"><span><b className="mono">{event.eventType}</b><small>{formatDateTime(event.createdAt)}{event.error ? ` · ${event.error}` : ''}</small></span><Pill status={event.processingStatus === 'processed' ? 'paid' : event.processingStatus === 'failed' ? 'past_due' : 'expired'}>{event.processingStatus}</Pill></div>)}</div></details></section> : null}
        </>)}

        {tab === 'Users' && <section className="drawer-section"><h4>Workspace users</h4>{users.length ? <div className="drawer-list">{users.map((item) => <div key={item.id} className="drawer-list-row user-row"><span className="user-cell"><span className="mini-avatar">{initials(`${item.firstName} ${item.lastName}`)}</span><span><b>{item.firstName} {item.lastName}</b><small>{item.email}</small></span></span><span className="user-meta"><em>{item.role.replaceAll('_', ' ')}</em><small>{item.lastLoginAt ? `Active ${formatDate(item.lastLoginAt)}` : 'Never signed in'}</small></span><Pill status={item.status}/></div>)}</div> : <div className="drawer-empty">No workspace users.</div>}</section>}

        {tab === 'Relationship' && <>
          <section className="drawer-section"><div className="drawer-section-head"><h4>Authorised contacts</h4><button type="button" className="text-button" onClick={() => setAddingContact(!addingContact)}><Icon name="plus" size={14}/> {addingContact ? 'Close' : 'Add contact'}</button></div>
            {addingContact ? <form className="drawer-form" onSubmit={addContact}><div className="drawer-form-grid"><input required placeholder="Name" value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })}/><input required type="email" placeholder="Email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })}/><input placeholder="Title" value={contact.title} onChange={(event) => setContact({ ...contact, title: event.target.value })}/><select value={contact.contactType} onChange={(event) => setContact({ ...contact, contactType: event.target.value })}><option value="primary">Primary</option><option value="billing">Billing</option><option value="technical">Technical</option><option value="executive">Executive</option><option value="other">Other</option></select></div><button className="secondary-button" type="submit">Save contact</button></form> : null}
            {contacts.length ? <div className="drawer-list">{contacts.map((item) => <div className="drawer-list-row" key={item.id}><span><b>{item.name}</b><small>{item.title || item.contactType} · {item.email}</small></span><em className="tag">{item.contactType}</em></div>)}</div> : <div className="drawer-empty">No authorised contacts recorded.</div>}
          </section>
          <section className="drawer-section"><h4>Internal notes</h4><form className="drawer-form" onSubmit={addNote}><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a handover or support note…"/><button className="secondary-button" type="submit" disabled={!note.trim()}>Add note</button></form>{notes.length ? <div className="drawer-timeline">{notes.map((item) => <div key={item.id}><p>{item.body}</p><small>{item.author ? `${item.author.firstName} ${item.author.lastName} · ` : ''}{formatDateTime(item.createdAt)}</small></div>)}</div> : null}</section>
        </>}

        {tab === 'Account' && <>
          <section className="drawer-section"><h4>Tenant state</h4><p className="drawer-note">Manual state changes need a written reason, your password and a fresh authenticator code. Billing-driven suspension happens automatically when Stripe reports a failed payment or cancellation.</p>
            {customer.isDemo ? <div className="drawer-empty">The demonstration tenant's state cannot be changed.</div> : <div className="drawer-form"><textarea value={stateReason} onChange={(event) => setStateReason(event.target.value)} placeholder="Reason for this change (minimum 8 characters)"/><div className="drawer-button-row">{customer.status !== 'active' ? <button type="button" className="secondary-button" onClick={() => requestStatus('active')}>Activate tenant</button> : null}{customer.status !== 'suspended' ? <button type="button" className="danger-button" onClick={() => requestStatus('suspended')}>Suspend tenant</button> : null}</div></div>}
            {stateEvents.length ? <div className="drawer-timeline">{stateEvents.map((item) => <div key={item.id}><p><b>{item.fromStatus} → {item.toStatus}</b> · {item.reason}</p><small>{item.actor ? `${item.actor.firstName} ${item.actor.lastName} · ` : ''}{formatDateTime(item.createdAt)}</small></div>)}</div> : null}
          </section>
          <section className="drawer-section"><h4>Recent activity</h4>{[...recentActivity, ...cases].length ? <div className="drawer-timeline">{[...recentActivity, ...cases].sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt)).slice(0, 15).map((item, index) => <div key={item.id || index}><p>{item.action ? item.action.replaceAll('_', ' ') : `Support case: ${item.title}`}</p><small>{formatDateTime(item.createdAt || item.updatedAt)}</small></div>)}</div> : <div className="drawer-empty">No recorded activity yet.</div>}</section>
        </>}
      </div>
    </aside>
  </>;
}
