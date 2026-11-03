import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errors.js';

function inspect(error) {
  const original = console.error; const logged = [];
  console.error = (value) => logged.push(value);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try { errorHandler(error, {}, response, () => {}); } finally { console.error = original; }
  return { logged, response };
}
test('database exception values, SQL and connection configuration are never logged or returned', () => {
  const marker = 'PRIVATE_RUNTIME_MARKER';
  const result = inspect(Object.assign(new Error(marker), { name: 'SequelizeDatabaseError', sql: marker, parameters: [marker], parent: { password: marker }, code: 'ER_LOCK_DEADLOCK' }));
  assert.equal(result.response.code, 500);
  assert.equal(JSON.stringify(result).includes(marker), false);
  assert.deepEqual(result.logged[0], { event: 'api_request_failed', category: 'SequelizeDatabaseError', code: 'ER_LOCK_DEADLOCK' });
});
test('validation exception embedded values and arbitrary exception names are not exposed', () => {
  const result = inspect({ name: 'SequelizeValidationError', errors: [{ message: 'PRIVATE_VALUE' }], message: 'PRIVATE_VALUE' });
  assert.equal(result.response.code, 422);
  assert.equal(JSON.stringify(result).includes('PRIVATE_VALUE'), false);
  const unknown = inspect({ name: 'PRIVATE_VALUE', code: 'PRIVATE_VALUE', message: 'PRIVATE_VALUE' });
  assert.equal(JSON.stringify(unknown).includes('PRIVATE_VALUE'), false);
});
test('expected upload validation remains actionable without raw exception output', () => {
  const result = inspect({ name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'PRIVATE_VALUE' });
  assert.equal(result.response.code, 422);
  assert.match(result.response.body.error, /10 MB/);
  assert.equal(JSON.stringify(result).includes('PRIVATE_VALUE'), false);
});
