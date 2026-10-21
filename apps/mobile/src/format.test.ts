import { describe, expect, it } from 'vitest';
import { comingDay, daysUntil, formatPhoneInput, formatSeconds, storyDay } from './format';

describe('formatPhoneInput', () => {
  it('spaces a Ghana number as it is typed', () => {
    expect(formatPhoneInput('024')).toBe('024');
    expect(formatPhoneInput('02412')).toBe('024 12');
    expect(formatPhoneInput('0241234567')).toBe('024 123 4567');
    expect(formatPhoneInput('024-123-4567')).toBe('024 123 4567');
  });

  it('stops at 10 digits, and leaves +233 numbers unspaced', () => {
    expect(formatPhoneInput('02412345678')).toBe('024 123 4567');
    expect(formatPhoneInput('+233 24 123 4567')).toBe('+233241234567');
    expect(formatPhoneInput('')).toBe('');
  });
});

describe('plain times for the farmer app', () => {
  const now = new Date(2026, 9, 21, 15, 0); // Wednesday 21 October 2026

  it('says how long a voice note is', () => {
    expect(formatSeconds(8.6)).toBe('0:08');
    expect(formatSeconds(85)).toBe('1:25');
  });

  it('names past days the way the farm story does', () => {
    expect(storyDay(new Date(2026, 9, 21, 8).toISOString(), now)).toBe('Today');
    expect(storyDay(new Date(2026, 9, 20, 8).toISOString(), now)).toBe('Yesterday');
    expect(storyDay(new Date(2026, 9, 19, 8).toISOString(), now)).toBe('Monday');
    expect(storyDay(new Date(2026, 9, 12, 8).toISOString(), now)).toBe('Last week');
    expect(storyDay(new Date(2026, 8, 10, 8).toISOString(), now)).toBe('September');
    expect(storyDay(new Date(2025, 11, 10, 8).toISOString(), now)).toBe('December 2025');
  });

  it('names coming days', () => {
    expect(daysUntil('2026-10-23', now)).toBe(2);
    expect(comingDay('2026-10-21', now)).toBe('Today');
    expect(comingDay('2026-10-22', now)).toBe('Tomorrow');
    expect(comingDay('2026-10-23', now)).toBe('Friday');
    expect(comingDay('2026-11-04', now)).toBe('4 November');
  });
});
