import crypto from 'node:crypto';

export const NOTIFICATION_KINDS = Object.freeze(['collaboration_digest', 'collaboration_reminder']);
export const READ_ROLES = Object.freeze(['org_admin', 'portfolio_manager', 'contributor', 'executive']);
export const WRITE_ROLES = Object.freeze(['org_admin', 'portfolio_manager', 'contributor']);
export const DEFAULT_PREFERENCES = Object.freeze({ emailEnabled: false, frequency: 'daily', quietStart: '20:00', quietEnd: '08:00', timezone: 'UTC' });
export const DEFAULT_ORG_POLICY = Object.freeze({ emailEnabled: false, digestsEnabled: true, remindersEnabled: true });
export const MAX_ATTEMPTS = 5;
export const LEASE_MS = 120000;
export const MAX_BATCH = 25;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const recipientHash = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
export const eventHash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export function notificationError(code, status = 422) { const error = new Error(code); error.code = code; error.status = status; return error; }
export function strictObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw notificationError('Invalid notification fields.');
}
export function validatePreferences(body) {
  strictObject(body, Object.keys(DEFAULT_PREFERENCES));
  const value = { ...DEFAULT_PREFERENCES, ...body };
  if (typeof value.emailEnabled !== 'boolean' || !['daily', 'weekly'].includes(value.frequency)) throw notificationError('Choose a valid email preference and frequency.');
  if (![value.quietStart, value.quietEnd].every((time) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw notificationError('Quiet hours must use HH:MM.');
  if (typeof value.timezone !== 'string' || value.timezone.length > 80 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value.timezone)) throw notificationError('Choose a valid IANA timezone.');
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(); } catch { throw notificationError('Choose a valid IANA timezone.'); }
  return value;
}
export function validateOrgPolicy(body) {
  strictObject(body, Object.keys(DEFAULT_ORG_POLICY));
  const value = { ...DEFAULT_ORG_POLICY, ...body };
  if (!Object.values(value).every((item) => typeof item === 'boolean')) throw notificationError('Organisation notification policy must contain booleans.');
  return value;
}
export function authorizeNotificationUser(user, organization, auth, write = false) {
  if (!auth?.sub) throw notificationError('Authentication is required.', 401);
  if (!user || user.id !== auth.sub || user.organizationId !== auth.organizationId || user.role !== auth.role || user.status !== 'active' || Number(user.sessionVersion || 0) !== Number(auth.sessionVersion || 0)) throw notificationError('Your notification session is no longer valid.', 401);
  if (!organization || organization.id !== user.organizationId || !['active', 'trial'].includes(organization.status) || organization.deletedAt || user.deletedAt) throw notificationError('This workspace is unavailable.', 403);
  if (!(write ? WRITE_ROLES : READ_ROLES).includes(user.role)) throw notificationError('This role cannot change notification records.', 403);
  return { organizationId: user.organizationId, userId: user.id };
}
export function localClock(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute) };
}
export function quietAt(now, preferences) {
  const minute = localClock(now, preferences.timezone).minute;
  const toMinute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = toMinute(preferences.quietStart); const end = toMinute(preferences.quietEnd);
  // Equal boundaries mean no quiet window. Overnight windows are supported.
  return start === end ? false : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
export function scheduleEmail(now, preferences) {
  const p = validatePreferences(preferences);
  const date = localClock(now, p.timezone).date;
  const midnight = new Date(`${date}T00:00:00Z`);
  const bucket = p.frequency === 'weekly' ? new Date(midnight.getTime() - ((midnight.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10) : date;
  // Scan UTC instants, not local arithmetic: preserves correctness around DST gaps/folds.
  let availableAt = new Date(now);
  for (let step = 0; quietAt(availableAt, p) && step < 1440; step += 1) availableAt = new Date(availableAt.getTime() + 60000);
  return { bucket: `${p.frequency}:${p.timezone}:${bucket}`, availableAt };
}
export function emailGate({ user, organization, preferences, policy, configured, suppressed, kind }) {
  if (!user || user.status !== 'active' || user.deletedAt || !READ_ROLES.includes(user.role) || !organization || organization.id !== user.organizationId || !['active', 'trial'].includes(organization.status) || organization.deletedAt) return 'inactive';
  if (!preferences?.emailEnabled) return 'opted_out';
  if (!policy?.emailEnabled || (kind === 'collaboration_digest' && !policy.digestsEnabled) || (kind === 'collaboration_reminder' && !policy.remindersEnabled)) return 'policy_disabled';
  if (!configured) return 'provider_disabled';
  if (suppressed) return 'recipient_suppressed';
  return null;
}
export function retryDecision(error, attemptCount, now, random = Math.random) {
  // Only explicit provider rejection is safe to retry. Timeouts / networking have unknown acceptance.
  const name = String(error?.name || '');
  if (['Throttling', 'ThrottlingException', 'TooManyRequestsException', 'LimitExceededException'].includes(name) && attemptCount < MAX_ATTEMPTS) {
    const delay = Math.min(3600000, 60000 * (2 ** Math.max(0, attemptCount - 1))) + Math.floor(random() * 15000);
    return { status: 'pending', availableAt: new Date(now.getTime() + delay), errorCode: 'provider_throttled' };
  }
  if (['MessageRejected', 'MailFromDomainNotVerifiedException', 'InvalidParameterValue', 'AccessDenied', 'AccessDeniedException', 'ConfigurationSetDoesNotExistException', 'AccountSendingPausedException'].includes(name)) return { status: 'failed', errorCode: 'provider_rejected' };
  if (['Throttling', 'ThrottlingException', 'TooManyRequestsException', 'LimitExceededException'].includes(name)) return { status: 'failed', errorCode: 'retry_limit' };
  return { status: 'uncertain', errorCode: 'acceptance_unknown' };
}
export function deliveryTransition(current, incoming) {
  if (!['delivered', 'bounced', 'complained', 'failed'].includes(incoming)) throw notificationError('Invalid provider outcome.');
  // Adverse feedback wins. Delayed delivery events never clear a bounce or complaint.
  const rank = { sending: 0, uncertain: 0, accepted: 1, delivered: 2, failed: 3, bounced: 4, complained: 5 };
  return rank[incoming] > (rank[current] ?? 99) ? incoming : current;
}
export function genericNotification(kind) {
  if (!NOTIFICATION_KINDS.includes(kind)) throw notificationError('Unsupported notification kind.');
  return kind === 'collaboration_digest' ? { title: 'Collaboration updates are available', text: 'Sign in to CivicPath to review current collaboration updates. Content and access may have changed. Manage optional email in notification preferences; use the CivicPath contact form for help.' } : { title: 'Review your collaboration requests', text: 'Sign in to CivicPath to check your current collaboration requests. Requests may have changed or been completed. Manage optional email in notification preferences; use the CivicPath contact form for help.' };
}
