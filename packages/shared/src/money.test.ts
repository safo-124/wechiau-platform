import { describe, expect, it } from 'vitest';
import { formatAmount, formatGhs, ghsToPesewas, lineTotal, pesewasToGhs, sumPesewas } from './money.js';

describe('ghsToPesewas', () => {
  it('converts typed cedi amounts to whole pesewas', () => {
    expect(ghsToPesewas(40)).toBe(4000);
    expect(ghsToPesewas(52)).toBe(5200);
    expect(ghsToPesewas(0.1 + 0.2)).toBe(30);
    expect(ghsToPesewas(1340.5)).toBe(134050);
  });

  it('rejects amounts finer than a pesewa', () => {
    expect(() => ghsToPesewas(40.005)).toThrow(RangeError);
    expect(() => ghsToPesewas(Number.NaN)).toThrow(RangeError);
  });
});

describe('pesewasToGhs', () => {
  it('rejects fractional pesewas', () => {
    expect(pesewasToGhs(4000)).toBe(40);
    expect(() => pesewasToGhs(40.5)).toThrow(RangeError);
  });
});

describe('lineTotal and sumPesewas', () => {
  it('matches the design figures', () => {
    // Field app: 2 crates at GHS 40 → GHS 80; Wa sale: 8 crates at GHS 52 → GHS 416.
    expect(lineTotal(2, 4000)).toBe(8000);
    expect(lineTotal(8, 5200)).toBe(41600);
  });

  it('rebuilds the October egg fund from the dashboard ledger', () => {
    // 1,500 grant − 240 − 280 + 624 − 320 + 416 − 360 = 1,340
    const entries = [150000, -24000, -28000, 62400, -32000, 41600, -36000];
    expect(sumPesewas(entries)).toBe(134000);
  });

  it('rejects bad quantities', () => {
    expect(() => lineTotal(-1, 4000)).toThrow(RangeError);
    expect(() => lineTotal(1.5, 4000)).toThrow(RangeError);
  });
});

describe('formatting', () => {
  it('formats like the designs', () => {
    expect(formatGhs(134000)).toBe('GHS 1,340');
    expect(formatGhs(4050)).toBe('GHS 40.50');
    expect(formatGhs(-24000)).toBe('−GHS 240');
    expect(formatAmount(62400, { signed: true })).toBe('+624');
    expect(formatAmount(-24000, { signed: true })).toBe('−240');
    expect(formatAmount(0, { signed: true })).toBe('0');
    expect(formatAmount(150000000)).toBe('1,500,000');
  });
});
