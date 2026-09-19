/* CivicPath System Admin UI — concise operating console for high-trust platform work. */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { Customer360Drawer } from '../components/Customer360Drawer';
import { PrivilegedActionModal } from '../components/PrivilegedActionModal';
import { LeadRoutingPanel } from '../components/LeadRoutingPanel';
import './SystemAdminPage.css';

const tabs = ['Command centre', 'Councils', 'Billing & Stripe', 'Lead routing', 'Support desk', 'Security trail'];
const blankStripe = { mode: 'test', publishableKey: '', secretKey: '', webhookSecret: '', corePriceId: '', essentialsPriceId: '', grantmaestroPriceId: '' };
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

function Metric({ label, value, note, critical }) {
  return <article className={`admin-metric ${critical ? 'critical' : ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function EmptyCase({ title, copy }) {
  return <div className="admin-empty"><span>✓</span><div><b>{title}</b><p>{copy}</p></div></div>;
}

export default function SystemAdminPage() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [overview, setOverview] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [supportCases, setSupportCases] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stripe, setStripe] = useState(blankStripe);
  const [customerQuery, setCustomerQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [privilegedAction, setPrivilegedAction] = useState(null);

  const refresh = async () => {
    setLoading(true);
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
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const openCases = useMemo(() => supportCases.filter((item) => !['resolved', 'closed'].includes(item.status)), [supportCases]);
  const visibleCustomers = useMemo(() => {
    const term = customerQuery.trim().toLowerCase();
    return term ? customers.filter((customer) => `${customer.name} ${customer.country} ${customer.plan}`.toLowerCase().includes(term)) : customers;
  }, [customers, customerQuery]);
  const stripeHasDraft = Boolean(stripe.publishableKey || stripe.secretKey || stripe.webhookSecret || stripe.corePriceId || stripe.essentialsPriceId || stripe.grantmaestroPriceId);
  const metrics = overview?.metrics || {};
  const updateStripe = (key) => (event) => setStripe((current) => ({ ...current, [key]: event.target.value }));

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

  return <main className="page-content system-admin-page">
    <div className="admin-title">
      <div><p className="card-eyebrow">Platform operations</p><h2>System Admin</h2><p>One working view for customer health, operational actions, billing configuration and accountable platform oversight.</p></div>
      <button className="secondary-button" type="button" onClick={refresh}><Icon name="check" size={15}/> Refresh workspace</button>
    </div>
    <div className="admin-tabs" role="tablist">{tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    {loading ? <div className="admin-loading">Loading System Admin workspace…</div> : <>
      {activeTab === 'Command centre' && <section className="admin-section">
        <div className="admin-metrics"><Metric label="Customer organisations" value={metrics.customers || 0} note="Councils and regional groups"/><Metric label="Active users" value={metrics.users || 0} note="Excluding platform access"/><Metric label="Active subscriptions" value={metrics.activeSubscriptions || 0} note="Trial, active or past due"/><Metric label="Open support cases" value={metrics.openCases || 0} note={metrics.urgentCases ? `${metrics.urgentCases} urgent action required` : 'No urgent cases'} critical={Boolean(metrics.urgentCases)}/></div>
        <div className="admin-two-col">
          <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Act next</p><h3>Operational queue</h3></div><span className="quiet-badge">Prioritised</span></div><div className="admin-queue">{overview?.actionQueue?.map((item, index) => <div key={`${item.type}-${index}`} className={`queue-item ${item.priority}`}><i/>{item.title}<span>{item.type.replace('_', ' ')}</span></div>)}</div></section>
          <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Platform posture</p><h3>Readiness checks</h3></div></div><div className="posture-list"><p><i className="is-good"/>Tenant-scoped API access and audit logging <span>Active</span></p><p><i className={metrics.stripeConfigured ? 'is-good' : 'is-pending'}/>Stripe billing configuration <span>{metrics.stripeConfigured ? 'Configured' : 'Not configured'}</span></p><p><i className="is-pending"/>Production HTTPS and secret storage <span>Required before launch</span></p></div></section>
        </div>
        <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Accountability</p><h3>Recent platform activity</h3></div><button type="button" className="text-button" onClick={() => setActiveTab('Security trail')}>View audit trail <Icon name="arrow" size={14}/></button></div><div className="activity-list">{overview?.recentAudit?.length ? overview.recentAudit.slice(0, 6).map((item, index) => <p key={index}><b>{item.action.replaceAll('_', ' ')}</b><span>{item.entityType.replaceAll('_', ' ')} · {formatDate(item.createdAt)}</span></p>) : <EmptyCase title="No platform activity yet" copy="Audit records will appear here as administration actions are completed."/>}</div></section>
      </section>}
      {activeTab === 'Councils' && <section className="admin-section">
        <div className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Customer context</p><h3>Council organisations</h3><p className="admin-copy">Search customer information, then open Customer 360° to review authorised contacts, subscription context, support, notes, activity and safe tenant-state actions.</p></div><label className="admin-search"><Icon name="search" size={15}/><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Find a council or plan"/></label></div>{visibleCustomers.length ? <div className="admin-table-wrap"><div className="admin-table admin-table-head"><span>Council</span><span>Country</span><span>Plan</span><span>Subscription</span><span>Active users</span><span>Status</span><span/></div>{visibleCustomers.map((customer) => <div className="admin-table" key={customer.id}><b>{customer.name}{customer.isDemo && <small>Demo</small>}</b><span>{customer.country}</span><span>{customer.plan}</span><span className={`subscription ${customer.subscriptionStatus}`}>{customer.subscriptionStatus.replace('_', ' ')}</span><span>{customer.users}</span><span><i className={`customer-dot ${customer.status}`}/>{customer.status}</span><button type="button" className="text-button" onClick={() => openCustomer(customer.id)}>Open 360° <Icon name="arrow" size={13}/></button></div>)}</div> : <EmptyCase title="No matching customer organisation" copy="Try a council name, country or plan type."/>}</div>
        <div className="admin-advice"><b>Admin working rule</b><p>Review tenant context, active subscription and recent audit history before changing access, billing or status. This creates faster, more accurate customer support and protects the audit trail.</p></div>
      </section>}
      {activeTab === 'Billing & Stripe' && <section className="admin-section">
        <div className="admin-split">
          <section className="admin-card stripe-card"><div className="admin-card-head"><div><p className="card-eyebrow">Billing integration</p><h3>Stripe configuration</h3><p className="admin-copy">Fields are intentionally empty until the CivicPath Stripe account is ready. Saving credentials requires a production encryption key; secrets are never displayed after saving.</p></div><span className={`stripe-state ${stripe.configured ? 'configured' : 'not-configured'}`}>{stripe.configured ? 'Configured' : 'Not configured'}</span></div>
            <form onSubmit={saveStripe} className="stripe-form"><div className="admin-field-row"><label>Environment<select value={stripe.mode} onChange={updateStripe('mode')}><option value="test">Test mode</option><option value="live">Live mode</option></select></label><label>Publishable key<input value={stripe.publishableKey || ''} onChange={updateStripe('publishableKey')} placeholder="pk_test_… or pk_live_…" autoComplete="off"/></label></div><div className="admin-field-row"><label>Secret key<input type="password" value={stripe.secretKey} onChange={updateStripe('secretKey')} placeholder="Leave blank until supplied" autoComplete="new-password"/></label><label>Webhook signing secret<input type="password" value={stripe.webhookSecret} onChange={updateStripe('webhookSecret')} placeholder="Leave blank until supplied" autoComplete="new-password"/></label></div><fieldset><legend>Stripe Price IDs</legend><p>Optional until Stripe products and recurring prices have been created.</p><div className="admin-field-row three"><label>CivicPath Core<input value={stripe.corePriceId || ''} onChange={updateStripe('corePriceId')} placeholder="price_…"/></label><label>Essentials<input value={stripe.essentialsPriceId || ''} onChange={updateStripe('essentialsPriceId')} placeholder="price_…"/></label><label>GrantMaestro add-on<input value={stripe.grantmaestroPriceId || ''} onChange={updateStripe('grantmaestroPriceId')} placeholder="price_…"/></label></div></fieldset><div className="stripe-form-actions"><span><i/> No billing requests will be sent until a separate checkout workflow is enabled and tested.</span><button type="submit" className="primary-button" disabled={saving || !stripeHasDraft}>{saving ? 'Saving…' : 'Save configuration'} <Icon name="arrow" size={15}/></button></div></form>
          </section>
          <aside className="admin-card billing-guidance"><p className="card-eyebrow">Controlled activation</p><h3>Before accepting payment</h3><ol><li>Enter test keys and test webhook secret.</li><li>Map approved Stripe Price IDs to CivicPath plans.</li><li>Run test checkout, webhook and subscription-status checks.</li><li>Have an authorised platform owner explicitly approve live mode.</li></ol><p>Checkout, webhooks and automated entitlement changes are deliberately not activated in this foundation release.</p></aside>
        </div>
        <section className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Current commercial catalogue</p><h3>Subscription plans</h3></div></div><div className="plan-chip-row">{plans.map((plan) => <article key={plan.id}><span>{plan.product}</span><b>{plan.name}</b><strong>${Number(plan.annualPriceAud).toLocaleString('en-AU')} p.a.</strong></article>)}</div></section>
      </section>}
      {activeTab === 'Lead routing' && <LeadRoutingPanel onStepUp={(label, execute) => setPrivilegedAction({ label, execute })}/>}
      {activeTab === 'Support desk' && <section className="admin-section"><div className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Customer support</p><h3>Support case queue</h3><p className="admin-copy">Prioritise urgent access, billing and data-risk matters. Use a customer’s plan, user count and activity context before responding.</p></div><span className="quiet-badge">{openCases.length} open</span></div>{openCases.length ? <div className="support-list">{openCases.map((item) => <article key={item.id}><div><span className={`priority ${item.priority}`}>{item.priority}</span><h4>{item.title}</h4><p>{item.Organization?.name || 'Customer organisation'} · {item.category.replace('_', ' ')}</p></div><p className="support-summary">{item.summary || 'No support summary recorded.'}</p><select value={item.status} onChange={(event) => updateCase(item.id, event.target.value)}><option value="new">New</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting on customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></article>)}</div> : <EmptyCase title="Support queue is clear" copy="New customer cases will be triaged here with their tenant context and accountable next action."/>}</div></section>}
      {activeTab === 'Security trail' && <section className="admin-section"><div className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Operational assurance</p><h3>Audit trail</h3><p className="admin-copy">All configuration and support-case updates are recorded with the responsible platform user, action time and relevant non-secret context.</p></div></div>{overview?.recentAudit?.length ? <div className="audit-list">{overview.recentAudit.map((item, index) => <article key={index}><i/><div><b>{item.action.replaceAll('_', ' ')}</b><p>{item.entityType.replaceAll('_', ' ')}</p></div><time>{formatDate(item.createdAt)}</time></article>)}</div> : <EmptyCase title="No admin actions have been recorded" copy="The security trail will populate as platform administration begins."/>}</div></section>}
    </>}<Customer360Drawer detail={customerDetail} onClose={() => setCustomerDetail(null)} onRefresh={refreshCustomer} onStepUp={(label, execute) => setPrivilegedAction({ label, execute })}/><PrivilegedActionModal action={privilegedAction} onClose={(completed) => { setPrivilegedAction(null); if (completed) refresh(); }}/>
  </main>;
}
