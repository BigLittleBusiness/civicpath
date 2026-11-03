import { formatFundingAmount, fundingPayload, initialFundingForm, safeReferenceUrl, provenanceLabel } from './fundingLifecycle';

test('decimal currency formatting preserves zero, cents, AUD/NZD and large values', () => {
  expect(formatFundingAmount('0.00', 'AUD')).toBe('AUD $0.00');
  expect(formatFundingAmount('999999999999.99', 'NZD')).toBe('NZD $999,999,999,999.99');
  expect(formatFundingAmount(null, 'AUD')).toBe('Not recorded');
  expect(formatFundingAmount('10', 'USD')).toBe('Amount or currency unavailable');
});
test('payload retains decimal strings, version and timestamp; no provenance override or progress', () => {
  const record = { version: 2, updatedAt: '2026-11-03T00:00:00Z', status: 'assessing' };
  const form = { ...initialFundingForm('grant', 'NZD', record), requestedAmount: '0', reason: 'Council changed amount' };
  const result = fundingPayload('grant', form, record);
  expect(result.requestedAmount).toBe('0'); expect(result.awardedAmount).toBe(null);
  expect(result.version).toBe(2); expect(result.updatedAt).toBe(record.updatedAt);
  expect(result.provenance).toBeUndefined(); expect(result.progress).toBeUndefined();
});
test('legacy provenance is not relabeled and source references reject unsafe schemes/credentials/IPs', () => {
  expect(provenanceLabel('legacy_unverified')).toContain('not verified');
  expect(safeReferenceUrl('javascript:alert(1)')).toBe(null);
  expect(safeReferenceUrl('https://user:secret@council.gov.au')).toBe(null);
  expect(safeReferenceUrl('https://127.0.0.1')).toBe(null);
  expect(safeReferenceUrl('https://files.internal')).toBe(null);
  expect(safeReferenceUrl('https://council.gov.au/source')).toBe('https://council.gov.au/source');
});
