/* CivicPath System Admin UI — concise operating console for high-trust platform work. */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { Customer360Drawer } from '../components/Customer360Drawer';
import { PrivilegedActionModal } from '../components/PrivilegedActionModal';
import { LeadRoutingPanel } from '../components/LeadRoutingPanel';
import { PublicEnquiriesPanel } from '../components/PublicEnquiriesPanel';
import { formatAud, formatCents, formatDate, formatDateTime, initials, statusLabel } from '../lib/billingFormat';
import './SystemAdminPage.css';

const tabs = ['Command centre', 'Councils', 'Billing & Stripe', 'Lead routing', 'Public enquiries', 'Support desk', 'Security trail'];
const blankStripe = { mode: 'test', publishableKey: '', secretKey: '', webhookSecret: '', proofPriceId: '', corePriceId: '', essentialsPriceId: '', grantmaestroPriceId: '', customerPortalConfigurationId: '', automaticTaxEnabled: false };
const councilFilters = [
  ['all', 'All councils', () => true],
  ['active', 'Active', (customer) => customer.subscription?.accessActive],
  ['proof', 'Council Proof', (customer) => customer.planCode === 'council-proof' && customer.subscription?.accessActive],
  ['attention', 'Needs attention', (customer) => ['past_due', 'pending_checkout'].includes(customer.subscriptionStatus) || customer.subscription?.cancelAtPeriodEnd],
  ['ended', 'Ended', (customer) => ['cancelled', 'expired'].includes(customer.subscriptionStatus) || (customer.subscription && !customer.subscription.accessActive && customer.subscriptionStatus === 'active')],
];
const planPriceKey = { 'council-proof': 'proofPriceId', essentials: 'essentialsPriceId', 'civicpath-core': 'corePriceId' };

function Metric({ label, value, note, tone }) {
  return <article className={`admin-metric ${tone || ''}`}><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>;
}

function EmptyCase({ title, copy }) {
  return <div className="admin-empty"><span><Icon name="check" size={16}/></span><div><b>{title}</b><p>{copy}</p></div></div>;
}

function StatusPill({ status, children }) {
  return <span className={`status-pill is-${status || 'none'}`}>{children || statusLabel(status)}</span>;
}

function AccessPeriod({ subscription }) {
  if (!subscription) return <span className="cell-muted">No subscription</span>;
  if (!subscription.endsAt) return <span className="cell-stack"><b>Open-ended</b><small>{subscription.isBilled ? 'Stripe billed' : 'Not billed by Stripe'}</small></span>;
  const ended = !subscription.accessActive;
  const lead = ended ? `Ended ${formatDate(subscription.endsAt)}` : subscription.renews ? `Renews ${formatDate(subscription.endsAt)}` : `Ends ${formatDate(subscription.endsAt)}`;
  const soon = !ended && subscription.daysRemaining !== null && subscription.daysRemaining <= 14;
  return <span className="cell-stack access-cell"><b>{lead}</b>{!ended ? <span className={`period-bar ${soon ? 'is-soon' : ''}`}><i style={{ width: `${Math.round((subscription.periodProgress ?? 0) * 100)}%` }}/></span> : null}<small>{ended ? 'Access stopped' : `${subscription.daysRemaining} days left${subscription.cancelAtPeriodEnd ? ' · cancelling' : ''}`}</small></span>;
}

export default function SystemAdminPage() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [overview, setOverview] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [supportCases, setSupportCases] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stripe, setStripe] = useState(blankStripe);
  const [customerQuery, setCustomerQuery] = useState('');
  const [councilFilter, setCouncilFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [privilegedAction, setPrivilegedAction] = useState(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [overviewResult, customersResult, supportResult, plansResult, stripeResult] = await Promise.all([
        api.get('/admin/overview'), api.get('/admin/customers'), api.get('/admin/support-cases'), api.get('/admin/plans'), api.get('/admin/billing/stripe'),
      ]);
      setOverview(overviewResult.data.data);
      setCustomers(customersResult.data.data);
      setSupportCases(supportResult.data.data);
      setPlans(plansResult.data.data);
      setStripe((current) => ({ ...current, ...stripeResult.data.data, secretKey: '', webhookSecret: '' }));
    } catch (error) {
      toast.error(error.response?.data?.error || 'System Admin information could not be loaded.');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { refresh(); }, []);

  const openCases = useMemo(() => supportCases.filter((item) => !['resolved', 'closed'].includes(item.status)), [supportCases]);
  const filterCounts = useMemo(() => Object.fromEntries(councilFilters.map(([key, , test]) => [key, customers.filter(test).length])), [customers]);
  const visibleCustomers = useMemo(() => {
    const term = customerQuery.trim().toLowerCase();
    const test = councilFilters.find(([key]) => key === councilFilter)?.[2] || (() => true);
    return customers.filter(test).filter((customer) => !term || `${customer.name} ${customer.country} ${customer.plan} ${customer.primaryAdmin?.email || ''} ${customer.billingEmail || ''}`.toLowerCase().includes(term));
  }, [customers, customerQuery, councilFilter]);
  const stripeHasDraft = Boolean(stripe.publishableKey || stripe.secretKey || stripe.webhookSecret || stripe.proofPriceId || stripe.corePriceId || stripe.essentialsPriceId || stripe.customerPortalConfigurationId);
  const metrics = overview?.metrics || {};
  const updateStripe = (key) => (event) => setStripe((current) => ({ ...current, [key]: event.target.value }));
  const stripeChecks = [
    ['API keys and webhook secret', Boolean(stripe.configured)],
    ['Plan prices mapped', Boolean(stripe.proofPriceId && stripe.essentialsPriceId && stripe.corePriceId)],
    ['Stripe Tax adds GST for Australia', Boolean(stripe.automaticTaxEnabled)],
    ['CivicPath customer portal', Boolean(stripe.customerPortalConfigurationId)],
  ];

  const saveStripe = async (event) => {
    event.preventDefault();
    if (!stripeHasDraft) { toast('Add a Stripe value before saving the configuration.'); return; }
    setPrivilegedAction({ label: 'save Stripe billing configuration', execute: async () => { setSaving(true); try { const result = await api.put('/admin/billing/stripe', stripe); setStripe((current) => ({ ...current, ...result.data.data, secretKey: '', webhookSecret: '' })); toast.success('Stripe billing settings saved.'); await refresh(); } catch (error) { toast.error(error.response?.data?.error || 'Stripe settings could not be saved.'); } finally { setSaving(false); } } });
  };
  const openCustomer = async (customerId) => { setCustomerDetail({ loading: true }); try { const result = await api.get(`/admin/customers/${customerId}`); setCustomerDetail(result.data.data); } catch (error) { setCustomerDetail(null); toast.error(error.response?.data?.error || 'Customer 360° could not be loaded.'); } };
  const refreshCustomer = async () => { if (!customerDetail?.customer?.id) return; const result = await api.get(`/admin/customers/${customerDetail.customer.id}`); setCustomerDetail(result.data.data); await refresh(); };

  const updateCase = async (caseId, status) => {
    try { await api.patch(`/admin/support-cases/${caseId}`, { status }); toast.success('Support case updated.'); refresh(); }
    catch (error) { toast.error(error.response?.data?.error || 'Support case could not be updated.'); }
  };

  const tabCount = { Councils: customers.length, 'Support desk': openCases.length || null };

  return <main className="page-content system-admin-page">
    <header className="admin-hero">
      <div>
        <p className="card-eyebrow">Platform operations</p>
        <h1>System Admin</h1>
        <p>Customer health, subscriptions, billing and accountable platform oversight in one place.</p>
      </div>
      <div className="admin-hero-actions">
        {overview ? <span className={`env-chip ${metrics.stripeMode === 'live' ? 'is-live' : 'is-test'}`}><i/>{metrics.stripeConfigured ? `Stripe ${metrics.stripeMode === 'live' ? 'live' : 'test'} mode` : 'Stripe not configured'}</span> : null}
        <button className="secondary-button refresh-button" type="button" onClick={refresh} disabled={refreshing}><span className={refreshing ? 'spin' : ''}>↻</span>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </header>

    <nav className="admin-tabs" role="tablist" aria-label="System Admin sections">{tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab}{tabCount[tab] ? <span className="tab-count">{tabCount[tab]}</span> : null}</button>)}</nav>

    {loading ? <div className="admin-loading"><span className="loader"/>Loading System Admin workspace…</div> : <>
      {activeTab === 'Command centre' && <section className="admin-section">
        <div className="admin-metrics">
          <Metric label="Annual recurring revenue" value={formatAud(metrics.annualRecurringRevenueAud || 0)} note="Active annual plans, excl. GST" tone="is-feature"/>
          <Metric label="Collected · last 30 days" value={formatCents(metrics.collectedLast30DaysCents || 0)} note="Paid Stripe invoices, incl. GST"/>
          <Metric label="Annual subscriptions" value={metrics.activeAnnual || 0} note={metrics.renewingSoon ? `${metrics.renewingSoon} renewing within 30 days` : 'Essentials and Core'}/>
          <Metric label="Council Proofs" value={metrics.activeProofs || 0} note={metrics.proofsEndingSoon ? `${metrics.proofsEndingSoon} ending within 14 days` : '60-day paid evaluations'} tone={metrics.proofsEndingSoon ? 'is-warn' : ''}/>
          <Metric label="Billing attention" value={(metrics.pastDue || 0) + (metrics.pendingCheckout || 0)} note={`${metrics.pastDue || 0} failed payment · ${metrics.pendingCheckout || 0} awaiting checkout`} tone={metrics.pastDue ? 'is-critical' : ''}/>
          <Metric label="Open support cases" value={metrics.openCases || 0} note={metrics.urgentCases ? `${metrics.urgentCases} urgent` : 'No urgent cases'} tone={metrics.urgentCases ? 'is-critical' : ''}/>
        </div>
        <div className="admin-two-col">
          <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Act next</p><h3>Operational queue</h3></div><span className="quiet-badge">Prioritised</span></div><div className="admin-queue">{overview?.actionQueue?.length ? overview.actionQueue.map((item, index) => <div key={`${item.type}-${index}`} className={`queue-item is-${item.priority}`}><i/><b>{item.title}</b><span>{item.type.replaceAll('_', ' ')}</span></div>) : <EmptyCase title="Nothing needs action" copy="Billing, support and conversion signals will appear here."/>}</div></section>
          <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Platform posture</p><h3>Readiness checks</h3></div></div><div className="posture-list"><p><i className="is-good"/>Tenant-scoped API access and audit logging <span>Active</span></p><p><i className={metrics.stripeConfigured ? 'is-good' : 'is-pending'}/>Stripe billing configuration <span>{metrics.stripeConfigured ? `Configured · ${metrics.stripeMode}` : 'Not configured'}</span></p><p><i className={stripe.automaticTaxEnabled ? 'is-good' : 'is-pending'}/>GST via Stripe Tax <span>{stripe.automaticTaxEnabled ? 'Enabled' : 'Checkout blocked'}</span></p><p><i className="is-pending"/>Production HTTPS and secret storage <span>Required before launch</span></p></div></section>
        </div>
        <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Accountability</p><h3>Recent platform activity</h3></div><button type="button" className="text-button" onClick={() => setActiveTab('Security trail')}>View audit trail <Icon name="arrow" size={14}/></button></div><div className="activity-list">{overview?.recentAudit?.length ? overview.recentAudit.slice(0, 6).map((item, index) => <p key={index}><i/><b>{item.action.replaceAll('_', ' ')}</b><span><em className="entity-type">{item.entityType.replaceAll('_', ' ')}</em> · {formatDateTime(item.createdAt)}</span></p>) : <EmptyCase title="No platform activity yet" copy="Audit records will appear here as administration actions are completed."/>}</div></section>
      </section>}

      {activeTab === 'Councils' && <section className="admin-section">
        <div className="admin-card council-register">
          <div className="admin-card-head"><div><p className="card-eyebrow">Customer context</p><h3>Councils and subscriptions</h3><p className="admin-copy">Every council's current plan, access period, annual value and users. Open a council for billing, invoices, refunds and tenant actions.</p></div><label className="admin-search"><Icon name="search" size={15}/><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search council, plan or email"/></label></div>
          <div className="filter-chips" role="group" aria-label="Filter councils">{councilFilters.map(([key, label]) => <button key={key} type="button" className={councilFilter === key ? 'is-active' : ''} onClick={() => setCouncilFilter(key)}>{label}<span>{filterCounts[key] || 0}</span></button>)}</div>
          {visibleCustomers.length ? <div className="council-table" role="table" aria-label="Councils">
            <div className="council-row council-head" role="row"><span>Council</span><span>Plan</span><span>Access period</span><span>Annual value</span><span>Users</span><span>Last payment</span><span/></div>
            {visibleCustomers.map((customer) => <div className="council-row" role="row" key={customer.id} tabIndex={0} onClick={() => openCustomer(customer.id)} onKeyDown={(event) => { if (event.key === 'Enter') openCustomer(customer.id); }}>
              <span className="council-cell"><span className="avatar">{initials(customer.name)}</span><span className="cell-stack"><b>{customer.name}{customer.isDemo ? <em className="demo-tag">Demo</em> : null}</b><small>{customer.primaryAdmin?.email || customer.billingEmail || 'No administrator'} · {customer.country}</small></span></span>
              <span className="cell-stack" data-label="Plan"><b>{customer.plan}</b><StatusPill status={customer.subscription?.accessActive === false && customer.subscriptionStatus === 'active' ? 'expired' : customer.subscriptionStatus}/></span>
              <span data-label="Access"><AccessPeriod subscription={customer.subscription}/></span>
              <span className="cell-stack" data-label="Annual value">{customer.pricing ? <><b>{formatAud(customer.pricing.excludingGst)}{customer.subscription?.billingInterval === 'one_off' ? <small className="inline-note"> one-off</small> : null}</b><small>{customer.pricing.gstApplies ? `${formatAud(customer.pricing.total)} incl. GST` : 'No GST (outside AU)'}</small></> : <span className="cell-muted">—</span>}</span>
              <span className="cell-stack" data-label="Users"><b>{customer.userCounts?.active ?? customer.users} active</b><small>{customer.userCounts?.invited || 0} invited</small></span>
              <span className="cell-stack" data-label="Last payment">{customer.lastPayment ? <><b>{formatCents(customer.lastPayment.amount, customer.lastPayment.currency)}</b><small>{formatDate(customer.lastPayment.paidAt)}</small></> : <span className="cell-muted">{customer.subscription?.isBilled ? 'Awaiting payment' : 'Not billed'}</span>}</span>
              <span className="row-action"><Icon name="arrow" size={15}/></span>
            </div>)}
          </div> : <EmptyCase title="No matching council" copy="Try another filter, council name, plan or email address."/>}
        </div>
      </section>}

      {activeTab === 'Billing & Stripe' && <section className="admin-section">
        <div className="stripe-checks">{stripeChecks.map(([label, ok]) => <div key={label} className={ok ? 'is-good' : 'is-pending'}><i>{ok ? '✓' : '!'}</i><span>{label}</span></div>)}</div>
        <div className="admin-split">
          <section className="admin-card stripe-card"><div className="admin-card-head"><div><p className="card-eyebrow">Billing integration</p><h3>Stripe configuration</h3><p className="admin-copy">Secrets are encrypted at rest and never displayed after saving. Leave a secret blank to keep the stored value.</p></div><span className={`stripe-state ${stripe.configured ? 'configured' : 'not-configured'}`}>{stripe.configured ? `Configured · ${stripe.mode}` : 'Not configured'}</span></div>
            <form onSubmit={saveStripe} className="stripe-form">
              <div className="admin-field-row"><label>Environment<select value={stripe.mode} onChange={updateStripe('mode')}><option value="test">Test mode</option><option value="live">Live mode</option></select></label><label>Publishable key<input value={stripe.publishableKey || ''} onChange={updateStripe('publishableKey')} placeholder="pk_test_… or pk_live_…" autoComplete="off"/></label></div>
              <div className="admin-field-row"><label>Secret key<input type="password" value={stripe.secretKey} onChange={updateStripe('secretKey')} placeholder={stripe.secretKeyConfigured ? 'Stored — leave blank to keep' : 'sk_test_… or sk_live_…'} autoComplete="new-password"/></label><label>Webhook signing secret<input type="password" value={stripe.webhookSecret} onChange={updateStripe('webhookSecret')} placeholder={stripe.webhookSecretConfigured ? 'Stored — leave blank to keep' : 'whsec_…'} autoComplete="new-password"/></label></div>
              <fieldset><legend>Plan prices</legend><p>Each CivicPath plan maps to one Stripe Price, set to tax behaviour “exclusive” so GST is added on top. Essentials and Core are annual; Council Proof is a one-off payment.</p><div className="admin-field-row three"><label>Council Proof<input value={stripe.proofPriceId || ''} onChange={updateStripe('proofPriceId')} placeholder="price_…"/></label><label>Essentials<input value={stripe.essentialsPriceId || ''} onChange={updateStripe('essentialsPriceId')} placeholder="price_…"/></label><label>CivicPath Core<input value={stripe.corePriceId || ''} onChange={updateStripe('corePriceId')} placeholder="price_…"/></label></div></fieldset>
              <fieldset><legend>Tax and customer portal</legend><label className="toggle-row"><input type="checkbox" checked={Boolean(stripe.automaticTaxEnabled)} onChange={(event) => setStripe((current) => ({ ...current, automaticTaxEnabled: event.target.checked }))}/><span className="toggle"/><span><b>Use Stripe Tax for GST</b><small>Adds 10% GST for Australian billing addresses. Required — online checkout is refused while this is off. Needs an active Australian registration in Stripe Tax.</small></span></label><label>Customer portal configuration ID<input value={stripe.customerPortalConfigurationId || ''} onChange={updateStripe('customerPortalConfigurationId')} placeholder="bpc_…"/></label></fieldset>
              <div className="stripe-form-actions"><span>Saving requires your password and a fresh authenticator code.</span><button type="submit" className="primary-button" disabled={saving || !stripeHasDraft}>{saving ? 'Saving…' : 'Save configuration'} <Icon name="arrow" size={15}/></button></div>
            </form>
          </section>
          <aside className="admin-card billing-guidance"><p className="card-eyebrow">Controlled activation</p><h3>Before accepting live payments</h3><ol><li>Test registration, Checkout, webhooks, invoices, plan changes and refunds in test mode.</li><li>Create the live webhook endpoint pinned to the API version in the billing runbook.</li><li>Map live Price IDs and the CivicPath portal configuration.</li><li>Have an authorised platform owner approve live mode.</li></ol><p>Plan changes, cancellations and refunds each require a written reason and a fresh password + MFA step-up, and are recorded in the audit trail.</p></aside>
        </div>
        <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Commercial catalogue</p><h3>Subscription plans</h3><p className="admin-copy">Prices exclude GST. Australian customers pay the GST-inclusive amount; New Zealand customers are not charged Australian GST.</p></div></div><div className="plan-grid">{plans.filter((plan) => plan.product === 'civicpath').map((plan) => { const price = Number(plan.annualPriceAud); const mapped = Boolean(stripe[planPriceKey[plan.code]]); return <article key={plan.id} className="plan-card"><div className="plan-card-top"><b>{plan.name}</b><span className={mapped ? 'mapped' : 'unmapped'}>{mapped ? 'Price mapped' : 'No Stripe price'}</span></div><strong>{formatAud(price)}<small>{plan.code === 'council-proof' ? ' one-off' : ' / year'}</small></strong><p>{formatAud(price * 1.1)} incl. 10% GST for Australian councils</p><ul>{plan.code === 'council-proof' ? <><li>60-day workspace</li><li>$495 credit toward an annual plan</li></> : <><li>{plan.workflowUserLimit ? `${plan.workflowUserLimit} workflow users` : 'Workflow users'}</li><li>{plan.activeProjectLimit ? `${plan.activeProjectLimit} active projects` : 'Active projects'}</li></>}</ul></article>; })}</div></section>
      </section>}

      {activeTab === 'Lead routing' && <LeadRoutingPanel onStepUp={(label, execute) => setPrivilegedAction({ label, execute })}/>}
      {activeTab === 'Public enquiries' && <PublicEnquiriesPanel />}
      {activeTab === 'Support desk' && <section className="admin-section"><div className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Customer support</p><h3>Support case queue</h3><p className="admin-copy">Prioritise urgent access, billing and data-risk matters. Check the council's plan, users and activity before responding.</p></div><span className="quiet-badge">{openCases.length} open</span></div>{openCases.length ? <div className="support-list">{openCases.map((item) => <article key={item.id}><div><span className={`priority is-${item.priority}`}>{item.priority}</span><h4>{item.title}</h4><p>{item.Organization?.name || 'Customer organisation'} · {item.category.replaceAll('_', ' ')} · {formatDate(item.createdAt)}</p>{item.SupportAttachments?.length ? <div className="support-attachment-links">{item.SupportAttachments.map((attachment) => <a key={attachment.id} href={`/v1/admin/support-cases/${item.id}/attachments/${attachment.id}/download`} target="_blank" rel="noreferrer">{attachment.originalFilename} <span>{Math.max(1, Math.round(Number(attachment.sizeBytes) / 1024))} KB</span></a>)}</div> : null}</div><p className="support-summary">{item.summary || 'No support summary recorded.'}</p><select value={item.status} onChange={(event) => updateCase(item.id, event.target.value)}><option value="new">New</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting on customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></article>)}</div> : <EmptyCase title="Support queue is clear" copy="New customer cases will be triaged here with their tenant context and next action."/>}</div></section>}
      {activeTab === 'Security trail' && <section className="admin-section"><div className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Operational assurance</p><h3>Audit trail</h3><p className="admin-copy">Configuration, billing and support actions are recorded with the responsible user, time and non-secret context.</p></div></div>{overview?.recentAudit?.length ? <div className="audit-list">{overview.recentAudit.map((item, index) => <article key={index}><i/><div><b>{item.action.replaceAll('_', ' ')}</b><p>{item.entityType.replaceAll('_', ' ')}</p></div><time>{formatDateTime(item.createdAt)}</time></article>)}</div> : <EmptyCase title="No admin actions have been recorded" copy="The security trail will populate as platform administration begins."/>}</div></section>}
    </>}
    <Customer360Drawer detail={customerDetail} onClose={() => setCustomerDetail(null)} onRefresh={refreshCustomer} onStepUp={(label, execute) => setPrivilegedAction({ label, execute })}/>
    <PrivilegedActionModal action={privilegedAction} onClose={(completed) => { setPrivilegedAction(null); if (completed) refresh(); }}/>
  </main>;
}
