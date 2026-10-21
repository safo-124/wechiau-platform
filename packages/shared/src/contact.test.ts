import { describe, expect, it } from 'vitest';
import { normalizeDigitalAddress, normalizeGhanaPhone } from './contact.js';

describe('normalizeGhanaPhone', () => {
  it('accepts the ways people type Ghana numbers', () => {
    expect(normalizeGhanaPhone('024 123 4567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('0241234567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('233241234567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('+233 24-123-4567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('00233241234567')).toBe('+233241234567');
  });

  it('rejects numbers that are not Ghanaian or have the wrong length', () => {
    expect(normalizeGhanaPhone('024123456')).toBeNull();
    expect(normalizeGhanaPhone('+2348012345678')).toBeNull();
    expect(normalizeGhanaPhone('241234567')).toBeNull();
    expect(normalizeGhanaPhone('')).toBeNull();
  });
});

describe('normalizeDigitalAddress', () => {
  it('accepts GhanaPostGPS addresses in any case', () => {
    expect(normalizeDigitalAddress(' xx-000-0001 ')).toBe('XX-000-0001');
    expect(normalizeDigitalAddress('XW-1234-5678')).toBe('XW-1234-5678');
  });

  it('rejects other shapes', () => {
    expect(normalizeDigitalAddress('Missing')).toBeNull();
    expect(normalizeDigitalAddress('X-000-0001')).toBeNull();
    expect(normalizeDigitalAddress('XX-00-0001')).toBeNull();
  });
});
