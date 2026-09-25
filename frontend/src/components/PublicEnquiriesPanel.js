import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../lib/api';
import { Icon } from './Icon';

const categories = [
  ['all', 'All categories'],
  ['council_proof', 'Council Proof'],
  ['sales', 'Sales'],
  ['general', 'General'],
];

const statuses = [
  ['all', 'All follow-up states'],
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['follow_up_due', 'Follow-up due'],
  ['nurture', 'Nurture'],
  ['closed', 'Closed'],
  ['not_a_fit', 'Not a fit'],
];

const label = (options, value) => options.find(([key]) => key === value)?.[1] || value.replaceAll('_', ' ');
const dateInputValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';

export function PublicEnquiriesPanel() {
  const [filters, setFilters] = useState({ category: 'all', status: 'all', search: '' });
  const [submittedFilters, setSubmittedFilters] = useState(filters);
  const [enquiries, setEnquiries] = useState([]);
  const [counts, setCounts] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  const fetchEnquiries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/public-enquiries', { params: submittedFilters });
      setEnquiries(response.data.data.enquiries || []);
      setCounts(response.data.data.statusCounts || {});
      setDrafts({});
    } catch (error) {
      toast.error(error.response?.data?.error || 'Public enquiries could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [submittedFilters]);

  useEffect(() => { fetchEnquiries(); }, [fetchEnquiries]);

  const totalActive = useMemo(() => ['new', 'contacted', 'follow_up_due', 'nurture'].reduce((total, key) => total + (counts[key] || 0), 0), [counts]);
  const updateDraft = (id, key, value) => setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));
  const draftFor = (item) => ({ followUpStatus: item.followUpStatus, followUpDueAt: dateInputValue(item.followUpDueAt), followUpNote: item.followUpNote || '', ...(drafts[item.id] || {}) });

  const saveFollowUp = async (item) => {
    const draft = draftFor(item);
    setSavingId(item.id);
    try {
      const response = await api.patch(`/admin/public-enquiries/${item.id}/follow-up`, { ...draft, followUpDueAt: draft.followUpDueAt || null });
      setEnquiries((current) => current.map((enquiry) => enquiry.id === item.id ? response.data.data : enquiry));
      setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
      toast.success('Enquiry follow-up saved.');
    } catch (error) {
      toast.error(error.response?.data?.details?.[0] || error.response?.data?.error || 'Follow-up details could not be saved.');
    } finally {
      setSavingId('');
    }
  };

  const applyFilters = (event) => { event.preventDefault(); setSubmittedFilters({ ...filters, search: filters.search.trim() }); };
  const clearFilters = () => { const cleared = { category: 'all', status: 'all', search: '' }; setFilters(cleared); setSubmittedFilters(cleared); };

  return <section className="admin-section public-enquiries-section"><div className="admin-card"><div className="admin-card-head"><div><p className="card-eyebrow">Public contact operations</p><h3>Public enquiries</h3><p className="admin-copy">A platform-only record of web enquiries. Keep the first next action, due date and follow-up outcome current so no regional council conversation is lost.</p></div><span className="quiet-badge">{totalActive} active</span></div><form className="enquiry-filter-bar" onSubmit={applyFilters}><label>Category<select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>{categories.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label>Follow-up status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>{statuses.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label className="enquiry-search"><Icon name="search" size={15}/><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search name, council or email"/></label><button type="submit" className="secondary-button">Apply filters</button><button type="button" className="text-button" onClick={clearFilters}>Clear</button></form>{loading ? <div className="admin-loading">Loading public enquiries…</div> : enquiries.length ? <div className="public-enquiry-list">{enquiries.map((item) => { const draft = draftFor(item); return <article className="public-enquiry-card" key={item.id}><div className="public-enquiry-summary"><div className="enquiry-title-row"><span className={`enquiry-category ${item.enquiryType}`}>{label(categories, item.enquiryType)}</span><span className={`delivery-state ${item.notificationStatus}`}>Email {item.notificationStatus}</span></div><h4>{item.firstName} {item.lastName}</h4><p>{item.councilName || 'Organisation not supplied'}{item.role ? ` · ${item.role}` : ''}</p><span className="enquiry-email">{item.email}</span><p className="enquiry-message">{item.message}</p><small>Received {formatDate(item.createdAt)}{item.sourceUrl ? ' · Website form' : ''}</small></div><div className="public-enquiry-follow-up"><label>Follow-up status<select value={draft.followUpStatus} onChange={(event) => updateDraft(item.id, 'followUpStatus', event.target.value)} disabled={savingId === item.id}>{statuses.slice(1).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label>Next follow-up date<input type="date" value={draft.followUpDueAt} onChange={(event) => updateDraft(item.id, 'followUpDueAt', event.target.value)} disabled={savingId === item.id}/></label><label className="public-enquiry-note">Follow-up note<textarea value={draft.followUpNote} onChange={(event) => updateDraft(item.id, 'followUpNote', event.target.value)} maxLength="3000" placeholder="Record the next practical action, outcome or reason for closure." disabled={savingId === item.id}/></label><div className="public-enquiry-actions"><small>{item.followUpOwner?.name ? `Last handled by ${item.followUpOwner.name}` : 'No follow-up recorded yet'}{item.followUpUpdatedAt ? ` · ${formatDate(item.followUpUpdatedAt)}` : ''}</small><button type="button" className="primary-button" onClick={() => saveFollowUp(item)} disabled={savingId === item.id}>{savingId === item.id ? 'Saving…' : 'Save follow-up'} <Icon name="arrow" size={14}/></button></div></div></article>; })}</div> : <div className="admin-empty"><span>✓</span><div><b>No matching public enquiries</b><p>Adjust the filters, or new enquiries will appear here after a protected website form is submitted.</p></div></div>}</div></section>;
}
