import { describe, expect, it } from 'vitest';
import { LOCK_AFTER_MS, pinProblem, shouldLock } from './pin-rules';

describe('pinProblem', () => {
  it('accepts four numbers', () => {
    expect(pinProblem('4071')).toBeNull();
  });

  it('turns down the wrong length or letters', () => {
    expect(pinProblem('123')).toBe('Use 4 numbers.');
    expect(pinProblem('12345')).toBe('Use 4 numbers.');
    expect(pinProblem('12a4')).toBe('Use 4 numbers.');
  });

  it('turns down PINs that are easy to guess', () => {
    for (const pin of ['0000', '7777', '1234', '4321', '2580']) {
      expect(pinProblem(pin), pin).toBe('That PIN is too easy to guess. Choose another.');
    }
  });
});

describe('shouldLock', () => {
  it('locks only after being away longer than the limit', () => {
    expect(shouldLock(null, 10_000)).toBe(false);
    expect(shouldLock(0, LOCK_AFTER_MS)).toBe(false);
    expect(shouldLock(0, LOCK_AFTER_MS + 1)).toBe(true);
  });
});
