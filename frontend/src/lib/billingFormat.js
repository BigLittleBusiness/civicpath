// Shared display helpers for subscription and billing views.
export const formatAud = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(Number(value || 0));
export const formatCents = (cents, currency = 'AUD') => new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(currency || 'AUD').toUpperCase() }).format(Number(cents || 0) / 100);
export const formatDate = (value) => value ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
export const formatDateTime = (value) => value ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CP';

const statusLabels = { active: 'Active', past_due: 'Payment failed', pending_checkout: 'Awaiting checkout', cancelled: 'Cancelled', expired: 'Ended', trial: 'Trial', not_started: 'No subscription', suspended: 'Suspended', paid: 'Paid', open: 'Open', draft: 'Draft', void: 'Void', uncollectible: 'Uncollectible', invited: 'Invited', disabled: 'Disabled' };
export const statusLabel = (status) => statusLabels[status] || String(status || '—').replaceAll('_', ' ');
