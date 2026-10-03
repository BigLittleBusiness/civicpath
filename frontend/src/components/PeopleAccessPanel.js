import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

const blankInvitation = { firstName: '', lastName: '', email: '', role: 'contributor' };
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const roleLabel = (code) => String(code || '').split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');

export function PeopleAccessPanel() {
  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [seats, setSeats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitation, setInvitation] = useState(blankInvitation);
  const [saving, setSaving] = useState(false);
  const [removal, setRemoval] = useState(null);
  const [removalReason, setRemovalReason] = useState('');
  const [reassignToUserId, setReassignToUserId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get('/workspace/members');
      const data = response.data.data;
      setWorkspace(data.organization); setMembers(data.members || []); setRoles(data.roles || []); setSeats(data.seats || null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'People and Access could not be loaded. Please refresh the page.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeReplacementMembers = useMemo(() => members.filter((member) => member.status === 'active' && member.id !== removal?.member?.id), [members, removal]);
  const updateInvitation = (field, value) => setInvitation((current) => ({ ...current, [field]: value }));
  const submitInvitation = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await api.post('/workspace/members', invitation);
      const status = response.data.data?.delivery?.status;
      toast.success(status === 'sent' ? 'Invitation sent securely.' : 'Invitation created. Transactional delivery is not yet configured.');
      setInvitation(blankInvitation); setInviteOpen(false); await load();
    } catch (requestError) { toast.error(requestError.response?.data?.error || 'The invitation could not be created.'); }
    finally { setSaving(false); }
  };
  const updateRole = async (member, role) => {
    if (role === member.role) return;
    try {
      await api.patch(`/workspace/members/${member.id}/role`, { role });
      toast.success(`${member.firstName}'s access was updated.`); await load();
    } catch (requestError) { toast.error(requestError.response?.data?.error || 'The role could not be updated.'); }
  };
  const resend = async (member) => {
    try {
      const response = await api.post(`/workspace/members/${member.id}/resend-invitation`);
      toast.success(response.data.data?.delivery?.status === 'sent' ? 'A fresh secure invitation was sent.' : 'A fresh invitation was created. Transactional delivery is not yet configured.');
      await load();
    } catch (requestError) { toast.error(requestError.response?.data?.error || 'The invitation could not be resent.'); }
  };
  const beginRemoval = async (member) => {
    try {
      const response = await api.get(`/workspace/members/${member.id}/ownership`);
      setRemoval(response.data.data); setReassignToUserId(''); setRemovalReason('');
    } catch (requestError) { toast.error(requestError.response?.data?.error || 'This person’s work assignments could not be checked.'); }
  };
  const confirmRemoval = async () => {
    if (!removal) return;
    setSaving(true);
    try {
      const response = await api.delete(`/workspace/members/${removal.member.id}`, { data: { reassignToUserId: reassignToUserId || null, reason: removalReason || null } });
      const reassigned = response.data.data?.reassigned?.reduce((sum, item) => sum + item.count, 0) || 0;
      toast.success(reassigned ? `Access removed and ${reassigned} active assignment${reassigned === 1 ? '' : 's'} reassigned.` : 'Access removed securely.');
      setRemoval(null); await load();
    } catch (requestError) { toast.error(requestError.response?.data?.error || 'Access could not be removed.'); }
    finally { setSaving(false); }
  };
  const reinvite = (member) => { setInvitation({ firstName: member.firstName, lastName: member.lastName, email: member.email, role: member.role }); setInviteOpen(true); };

  if (loading) return <section className="settings-card people-access-card"><p className="card-eyebrow">People & access</p><p className="card-copy">Loading Council access controls…</p></section>;
  if (error) return <section className="settings-card people-access-card"><p className="card-eyebrow">People & access</p><h3>People and access</h3><p className="form-message">{error}</p><button className="secondary-button" type="button" onClick={load}>Try again</button></section>;

  return <>
    <section className="settings-card people-access-card">
      <div className="people-access-heading"><div><p className="card-eyebrow">People & access</p><h3>Keep the right people connected to delivery.</h3><p className="card-copy">Organisation Administrators control access. Every invitation, role change, reassignment and removal is recorded in the Council audit trail.</p></div><button className="primary-button" type="button" onClick={() => { setInvitation(blankInvitation); setInviteOpen(true); }}>Invite Council user</button></div>
      <div className="seat-summary"><div><span>Plan</span><strong>{seats?.planCode ? seats.planCode.replace(/-/g, ' ') : 'Current plan'}</strong></div><div><span>People with access or pending access</span><strong>{seats?.workflowSeatsUsed ?? 0}{seats?.workflowUserLimit === null ? ' · no limit recorded' : ` of ${seats.workflowUserLimit}`}</strong></div><div><span>Available invitations</span><strong>{seats?.workflowSeatsAvailable === null ? 'Plan-based' : seats.workflowSeatsAvailable}</strong></div></div>
      <div className="people-access-guardrail"><b>Continuity safeguard</b><span>Keep at least two active Organisation Administrators. CivicPath will not remove or demote the final active administrator.</span></div>
      <div className="member-table" role="region" aria-label="Council users">
        <div className="member-table-head"><span>Person</span><span>Role</span><span>Access</span><span>Last sign-in</span><span>Actions</span></div>
        {members.map((member) => <div className="member-table-row" key={member.id}>
          <div><b>{member.firstName} {member.lastName}{member.isCurrentUser ? ' (you)' : ''}</b><small>{member.email}</small></div>
          <div><select aria-label={`Role for ${member.firstName} ${member.lastName}`} value={member.role} disabled={member.status === 'disabled'} onChange={(event) => updateRole(member, event.target.value)}>{roles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}</select></div>
          <div><span className={`member-status ${member.status}`}>{member.status === 'invited' ? 'Invitation pending' : member.status}</span>{member.status === 'invited' && member.invitationExpiresAt ? <small>Expires {dateLabel(member.invitationExpiresAt)}</small> : null}</div>
          <div><small>{member.lastLoginAt ? dateLabel(member.lastLoginAt) : member.status === 'invited' ? 'Not yet accepted' : 'No sign-in recorded'}</small></div>
          <div className="member-actions">{member.status === 'invited' ? <button className="text-action" type="button" onClick={() => resend(member)}>Resend</button> : null}{member.status === 'disabled' ? <button className="text-action" type="button" onClick={() => reinvite(member)}>Re-invite</button> : null}{member.status !== 'disabled' && !member.isCurrentUser ? <button className="text-action danger-action" type="button" onClick={() => beginRemoval(member)}>Remove access</button> : null}</div>
        </div>)}
      </div>
      <p className="people-access-note">{workspace?.name || 'This Council'} can invite people before they need access. Pending invitations use a one-time link that expires after 7 days; resend creates a new link and invalidates the previous one.</p>
    </section>

    {inviteOpen ? <div className="modal-backdrop" role="presentation"><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="invite-member-title"><div className="modal-head"><div><p className="card-eyebrow">People & access</p><h2 id="invite-member-title">Invite a Council user</h2></div><button className="modal-close" type="button" onClick={() => setInviteOpen(false)} aria-label="Close invitation">×</button></div><p className="modal-intro">They will receive a one-time email link to set a password. The invitation expires after 7 days and does not expose Council information before acceptance.</p><form className="modal-grid" onSubmit={submitInvitation}><label>First name<input value={invitation.firstName} onChange={(event) => updateInvitation('firstName', event.target.value)} autoComplete="given-name" required/></label><label>Last name<input value={invitation.lastName} onChange={(event) => updateInvitation('lastName', event.target.value)} autoComplete="family-name" required/></label><label className="modal-full">Work email<input type="email" value={invitation.email} onChange={(event) => updateInvitation('email', event.target.value)} autoComplete="email" required/></label><label className="modal-full">Role<select value={invitation.role} onChange={(event) => updateInvitation('role', event.target.value)}>{roles.map((role) => <option key={role.code} value={role.code}>{role.label} — {role.description}</option>)}</select></label><div className="modal-actions modal-full"><button className="secondary-button" type="button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? 'Creating invitation…' : 'Send secure invitation'}</button></div></form></section></div> : null}

    {removal ? <div className="modal-backdrop" role="presentation"><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="remove-member-title"><div className="modal-head"><div><p className="card-eyebrow">Access continuity</p><h2 id="remove-member-title">Remove access for {removal.member.firstName}?</h2></div><button className="modal-close" type="button" onClick={() => setRemoval(null)} aria-label="Close removal dialog">×</button></div><p className="modal-intro">Removing access signs this person out and cancels any unused invitation. Audit records remain. Reassign any active operational work before removal.</p>{removal.ownership.total ? <div className="ownership-summary"><b>{removal.ownership.total} active assignment{removal.ownership.total === 1 ? '' : 's'} need reassignment</b><ul>{removal.ownership.records.map((record) => <li key={record.label}>{record.count} {record.label}</li>)}</ul><label>Reassign active work to<select value={reassignToUserId} onChange={(event) => setReassignToUserId(event.target.value)} required><option value="">Select an active Council user</option>{activeReplacementMembers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} — {roleLabel(member.role)}</option>)}</select></label></div> : <p className="people-access-guardrail">No active operational work is assigned to this person.</p>}<label className="removal-reason">Optional internal note<textarea value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} placeholder="For example: staff departure or role change"/></label><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setRemoval(null)}>Cancel</button><button className="primary-button destructive-button" type="button" disabled={saving || (removal.ownership.total > 0 && !reassignToUserId)} onClick={confirmRemoval}>{saving ? 'Removing access…' : removal.ownership.total ? 'Reassign and remove access' : 'Remove access'}</button></div></section></div> : null}
  </>;
}
