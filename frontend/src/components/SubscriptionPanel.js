import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { formatAud, formatCents, formatDate, statusLabel } from '../lib/billingFormat';
import './SubscriptionPanel.css';

// Workspace settings: current subscription for every council role; invoices and billing actions for the org admin.
export function SubscriptionPanel() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversionPlan, setConversionPlan] = useState('civicpath-core');
  const [annualPlans, setAnnualPlans] = useState([]);

  useEffect(() => {
    api.get('/billing/subscription').then((response) => setSummary(response.data.data)).catch((err) => setError(err.response?.data?.error || 'Subscription details could not be loaded.'));
    api.get('/public/plans').then((response) => setAnnualPlans(response.data.data.filter((plan) => plan.code !== 'council-proof').sort((a, b) => b.annualPriceAud - a.annualPriceAud).map((plan) => [plan.code, plan.name, Number(plan.annualPriceAud)]))).catch(() => setAnnualPlans([]));
  }, []);

  const openPortal = async () => {
    setError(''); setBusy(true);
    try { const response = await api.post('/billing/customer-portal'); window.location.assign(response.data.data.url); }
    catch (err) { setError(err.response?.data?.error || 'The billing portal could not be opened. Please try again.'); setBusy(false); }
  };
  const startConversion = async () => {
    setError(''); setBusy(true);
    try { const response = await api.post('/billing/council-proof-conversion-checkout', { targetPlanCode: conversionPlan }); window.location.assign(response.data.data.checkoutUrl); }
    catch (err) { setError(err.response?.data?.error || 'The upgrade checkout could not be opened.'); setBusy(false); }
  };

  if (!summary && !error) return <section className="settings-card sub-panel"><div className="sub-panel-loading"><span/>Loading subscription…</div></section>;
  if (!summary) return <section className="settings-card sub-panel"><p className="card-eyebrow">Subscription</p><p className="sub-panel-error">{error}</p></section>;

  const { subscription: sub, pricing, invoices = [], conversion, billingAdmin, portalAvailable, organisation } = summary;
  const ended = sub?.endsAt && !sub.accessActive;
  const gstNote = pricing?.gstApplies ? `${formatAud(pricing.total)} incl. ${formatAud(pricing.gst)} GST` : 'Australian GST does not apply';
  const selectedPlan = annualPlans.find(([code]) => code === conversionPlan);
  const afterCredit = selectedPlan ? selectedPlan[2] - (conversion?.creditAud || 0) : 0;

  return <section className="settings-card sub-panel">
    <div className="sub-panel-head">
      <div>
        <p className="card-eyebrow">Subscription</p>
        <h3>{sub?.planName || 'No active subscription'}</h3>
        {sub ? <span className={`sub-pill is-${ended && sub.status === 'active' ? 'expired' : sub.status}`}>{statusLabel(ended && sub.status === 'active' ? 'expired' : sub.status)}</span> : null}
      </div>
      {pricing ? <div className="sub-panel-price"><strong>{formatAud(pricing.excludingGst)}</strong><span>{sub?.billingInterval === 'one_off' ? 'one-off, excl. GST' : 'per year, excl. GST'}</span><small>{gstNote}</small></div> : null}
    </div>

    {sub ? <div className="sub-panel-period">
      <div><span>Started</span><b>{formatDate(sub.startsAt)}</b></div>
      <div><span>{ended ? 'Ended' : sub.renews ? 'Renews' : 'Access until'}</span><b>{sub.endsAt ? formatDate(sub.endsAt) : 'Ongoing'}</b></div>
      <div><span>{ended ? 'Status' : 'Remaining'}</span><b>{sub.endsAt ? (ended ? 'Access stopped' : `${sub.daysRemaining} days`) : '—'}</b></div>
      {sub.endsAt && !ended ? <div className={`sub-panel-bar ${sub.daysRemaining <= 14 ? 'is-soon' : ''}`}><i style={{ width: `${Math.round((sub.periodProgress ?? 0) * 100)}%` }}/></div> : null}
    </div> : null}

    {organisation?.isDemo ? <p className="sub-panel-note">This demonstration workspace is not billed.</p> : null}
    {sub?.cancelAtPeriodEnd ? <p className="sub-panel-note is-warn">This subscription will end on {formatDate(sub.endsAt)} and will not renew.</p> : null}
    {sub?.status === 'past_due' ? <p className="sub-panel-note is-critical">The latest payment failed. Update your payment details in the billing portal to restore access.</p> : null}

    {conversion?.available && annualPlans.length ? <div className="sub-panel-upgrade">
      <div><b>Upgrade with your $495 Council Proof credit</b><p>Available until {formatDate(conversion.deadline)}. The full Council Proof fee comes off your first annual invoice{pricing?.gstApplies ? '; GST is calculated on the reduced amount' : ''}.</p></div>
      <div className="sub-panel-upgrade-controls">
        <div className="plan-options">{annualPlans.map(([code, name, price]) => <button key={code} type="button" className={conversionPlan === code ? 'is-active' : ''} onClick={() => setConversionPlan(code)}><b>{name}</b><span>{formatAud(price - conversion.creditAud)} first year</span><small>then {formatAud(price)} / year, excl. GST</small></button>)}</div>
        <button className="primary-button" type="button" onClick={startConversion} disabled={busy}>{busy ? 'Preparing checkout…' : `Upgrade for ${formatAud(afterCredit)}${pricing?.gstApplies ? ' + GST' : ''}`}</button>
      </div>
    </div> : null}

    {billingAdmin ? <>
      <div className="sub-panel-invoices">
        <div className="sub-panel-invoices-head"><b>Invoices</b>{summary.billingEmail ? <span>Sent to {summary.billingEmail}</span> : null}</div>
        {invoices.length ? <div className="sub-invoice-table">
          <div className="sub-invoice-row is-head"><span>Invoice</span><span>Subtotal</span><span>GST</span><span>Total</span><span/></div>
          {invoices.map((invoice) => <div key={invoice.id} className="sub-invoice-row">
            <span><b>{invoice.number || 'Invoice'}</b><small>{formatDate(invoice.paidAt || invoice.createdAt)} · {statusLabel(invoice.status)}</small></span>
            <span>{formatCents(invoice.subtotal, invoice.currency)}</span>
            <span>{invoice.tax ? formatCents(invoice.tax, invoice.currency) : '—'}</span>
            <span><b>{formatCents(invoice.total, invoice.currency)}</b></span>
            <span className="sub-invoice-links">{invoice.invoicePdfUrl ? <a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer">PDF</a> : null}{invoice.hostedInvoiceUrl ? <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">View</a> : null}</span>
          </div>)}
        </div> : <p className="sub-panel-muted">No invoices yet.</p>}
      </div>
      <div className="sub-panel-actions">
        <p>Update your card, billing address or ABN, and download tax invoices, in the secure Stripe billing portal.</p>
        <button className="secondary-button" type="button" onClick={openPortal} disabled={busy || !portalAvailable}>{busy ? 'Opening…' : 'Open billing portal'} <Icon name="external" size={14}/></button>
      </div>
    </> : <p className="sub-panel-muted">Billing and invoices are managed by your organisation administrator.</p>}
    {error ? <p className="sub-panel-error">{error}</p> : null}
  </section>;
}
