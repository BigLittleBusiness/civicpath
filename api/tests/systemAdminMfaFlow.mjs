import speakeasy from 'speakeasy';

const baseUrl = process.env.CIVICPATH_TEST_URL || 'http://127.0.0.1:3015/v1';
const admin = { email: 'admin@civicpath.com.au', password: 'CivicPathAdmin2026!' };

let cookie = '';
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.headers || {}) } });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
  return body;
}

try {
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify(admin) });
  if (!login.data?.mfaRequired) throw new Error('Platform admin did not enter the MFA flow.');
  const pending = await request('/auth/mfa/pending');
  let secret;
  if (pending.data.purpose === 'setup') {
    const setup = await request('/auth/mfa/setup', { method: 'POST' });
    secret = setup.data.manualKey;
    const firstCode = speakeasy.totp({ secret, encoding: 'base32' });
    const confirmed = await request('/auth/mfa/setup/verify', { method: 'POST', body: JSON.stringify({ code: firstCode }) });
    if (!confirmed.data?.recoveryCodes?.length) throw new Error('MFA setup did not issue recovery codes.');
    await request('/auth/logout', { method: 'POST' });
    const secondLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify(admin) });
    if (!secondLogin.data?.mfaRequired) throw new Error('MFA sign-in challenge was not required after enrolment.');
  } else {
    throw new Error('This smoke test expects a fresh development administrator. Re-run the controlled demo reset before executing it.');
  }
  const code = speakeasy.totp({ secret, encoding: 'base32' });
  const verified = await request('/auth/mfa/verify-login', { method: 'POST', body: JSON.stringify({ code }) });
  if (verified.data?.user?.role !== 'platform_admin') throw new Error('MFA sign-in did not return the System Administrator session.');
  const customers = await request('/admin/customers');
  if (!Array.isArray(customers.data) || !customers.data.length) throw new Error('Customer list is unavailable after MFA sign-in.');
  const customer = customers.data[0];
  const customerDetail = await request(`/admin/customers/${customer.id}`);
  if (customerDetail.data?.customer?.id !== customer.id) throw new Error('Customer 360° detail is unavailable after MFA sign-in.');
  const blocked = await fetch(`${baseUrl}/admin/customers/${customer.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ status: 'suspended', reason: 'Smoke test must not change the demonstration tenant.' }) });
  if (blocked.status !== 428) throw new Error('Tenant state change was not blocked pending privileged re-authentication.');
  const elevated = await request('/auth/step-up', { method: 'POST', body: JSON.stringify({ password: admin.password, code: speakeasy.totp({ secret, encoding: 'base32' }) }) });
  if (!elevated.data?.elevatedUntil) throw new Error('Privileged-action elevation was not issued.');
  console.info('System Admin MFA flow passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
