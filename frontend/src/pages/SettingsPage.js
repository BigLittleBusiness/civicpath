import React, { useState } from 'react';
import { Icon } from '../components/Icon';
import { SupportContactPanel } from '../components/SupportContactPanel';
import { previewCsvImport } from '../lib/api';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';

export default function SettingsPage() {
  const [imported, setImported] = useState(false);
  const [message, setMessage] = useState('');
  const [billingMessage, setBillingMessage] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [conversionPlan, setConversionPlan] = useState('civicpath-core');
  const { user } = useAuth();
  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await previewCsvImport('projects', file);
      setImported(true);
      setMessage(`${result.rowCount} project rows are ready for field mapping and confirmation.`);
    } catch {
      setImported(true);
      setMessage(`${file.name} is selected. Connect to the CivicPath API to validate headers and review the import.`);
    }
  };
  const openBillingPortal = async () => {
    setBillingMessage(''); setBillingLoading(true);
    try { const response = await api.post('/billing/customer-portal'); window.location.assign(response.data.data.url); }
    catch (error) { setBillingMessage(error.response?.data?.error || 'Billing details could not be opened. Please try again.'); setBillingLoading(false); }
  };
  const startProofConversion = async () => {
    setBillingMessage(''); setBillingLoading(true);
    try { const response = await api.post('/billing/council-proof-conversion-checkout', { targetPlanCode: conversionPlan }); window.location.assign(response.data.data.checkoutUrl); }
    catch (error) { setBillingMessage(error.response?.data?.error || 'The Council Proof conversion checkout could not be opened.'); setBillingLoading(false); }
  };

  return <main className="page-content settings-page">
    <section className="settings-header"><div><p className="page-intro">Set up the workspace in the way your Council already works. CivicPath can start small and remain clear.</p><h2>Workspace settings</h2></div></section>
    <section className="settings-layout"><aside className="settings-nav"><button className="selected" type="button">General</button><button type="button">People & access</button><button type="button">Portfolios</button><button type="button">Data imports</button><button type="button">Integrations</button><button type="button">Notifications</button><button type="button">Audit & security</button></aside><div className="settings-content">
      <section className="settings-card"><div><p className="card-eyebrow">Workspace identity</p><h3>CivicPath Demonstration Council</h3><p className="card-copy">This is a protected sample workspace. Demonstration records are illustrative and distinct from live Council information.</p></div><div className="field-grid"><label>Council or organisation name<input defaultValue="CivicPath Demonstration Council" /></label><label>Country<select defaultValue="Australia"><option>Australia</option><option>New Zealand</option></select></label></div><button className="secondary-button" type="button">Save changes</button></section>
      <section className="settings-card import-card"><div><p className="card-eyebrow">Data import</p><h3>Start with the work already in front of you.</h3><p className="card-copy">Import a prepared CSV file for projects, funding pathways or grants. Imported records are retained in your workspace; sample data is never copied into a new Council workspace.</p></div><div className="import-panel"><Icon name="upload" size={26}/><strong>{imported ? 'File ready for review' : 'Drop a CSV file here'}</strong><span>{message || (imported ? 'The import review is ready to map fields and confirm changes.' : 'or choose a prepared spreadsheet')}</span><label className="secondary-button upload-button">Choose project CSV<input type="file" accept=".csv" onChange={handleFile}/></label></div><div className="import-actions"><a href="/civicpath-project-import-template.csv" download>Download project template <Icon name="external" size={14}/></a><a href="/civicpath-grant-import-template.csv" download>Download grant template <Icon name="external" size={14}/></a></div></section>
      <section className="settings-card integration-card"><div><p className="card-eyebrow">Optional connection</p><h3>GrantMaestro</h3><p className="card-copy">CivicPath operates independently. A future GrantMaestro connection will use a documented API boundary so Council information remains governed by the chosen product configuration.</p></div><span className="integration-status">Not connected</span></section>
      {user?.role === 'org_admin' ? <section className="settings-card integration-card"><div><p className="card-eyebrow">Subscription and invoices</p><h3>Manage your CivicPath subscription</h3><p className="card-copy">Open the secure Stripe billing portal to update payment details, download available invoices or manage a subscription. Changes are reflected in CivicPath through verified Stripe events.</p>{billingMessage ? <p className="form-message">{billingMessage}</p> : null}</div><button className="secondary-button" type="button" onClick={openBillingPortal} disabled={billingLoading}>{billingLoading ? 'Opening secure billing…' : 'Open secure billing portal'}</button></section> : null}
      {user?.role === 'org_admin' && user?.subscriptionPlanCode === 'council-proof' ? <section className="settings-card integration-card"><div><p className="card-eyebrow">Council Proof conversion credit</p><h3>Apply the full $495 credit at annual checkout</h3><p className="card-copy">If this Council proceeds within 30 days of the final Council Proof review, CivicPath applies the full $495 credit to its first annual CivicPath subscription. Stripe shows the adjustment before payment is confirmed.</p><label>Annual plan<select value={conversionPlan} onChange={(event) => setConversionPlan(event.target.value)}><option value="civicpath-core">CivicPath Core</option><option value="essentials">CivicPath Essentials</option></select></label></div><button className="primary-button" type="button" onClick={startProofConversion} disabled={billingLoading}>{billingLoading ? 'Preparing secure checkout…' : 'Use my $495 conversion credit'}</button></section> : null}
      <SupportContactPanel />
    </div></section>
  </main>;
}
