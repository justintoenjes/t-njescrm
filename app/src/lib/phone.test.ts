import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('normalizes mobile with leading 0', () => {
    expect(normalizePhone('0171 1234567')).toBe('+491711234567');
  });

  it('normalizes with +49 prefix', () => {
    expect(normalizePhone('+49 171 1234567')).toBe('+491711234567');
  });

  it('normalizes with 0049 prefix', () => {
    expect(normalizePhone('0049 171 1234567')).toBe('+491711234567');
  });

  it('normalizes with 49 prefix (no +)', () => {
    expect(normalizePhone('49 171 1234567')).toBe('+491711234567');
  });

  it('normalizes landline with area code', () => {
    expect(normalizePhone('040 / 123456')).toBe('+4940123456');
  });

  it('strips dashes and dots', () => {
    expect(normalizePhone('0171-123.456.7')).toBe('+491711234567');
  });

  it('strips parentheses', () => {
    expect(normalizePhone('(0171) 1234567')).toBe('+491711234567');
  });

  it('returns null for too-short input', () => {
    expect(normalizePhone('01')).toBeNull();
  });

  it('handles already-normalized number', () => {
    // + gets stripped by regex, then 49 prefix detected → same result
    expect(normalizePhone('+491711234567')).toBe('+491711234567');
  });
});
