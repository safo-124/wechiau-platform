import { collectionSchema, ledgerEntrySchema, salePaymentSchema, saleSchema, smsOutboxSchema } from '../schemas/index.js';
import { IDS, syncFields } from '../test-fixtures.js';
import { describe, expect, it } from 'vitest';
import { cashWithPerson, countDifference, eggFundBalance, latestCount } from './cash.js';
import { parseGhsInput } from './money-input.js';
import {
  buildCollection,
  buildCollectionCorrection,
  buildSale,
  buildSalePayment,
  buildSaleRemoval,
  cratesInStore,
  eggMargin,
  saleBalances,
  type RowFactory,
} from './eggs.js';
import { readSettings } from './settings.js';

const makeAs =
  (userId: string): RowFactory =>
  (fields) => ({ ...syncFields(userId), ...fields }) as ReturnType<RowFactory>;

describe('buildCollection', () => {
  const rows = buildCollection(makeAs(IDS.agent), {
    farmerId: IDS.naa,
    farmerPhone: '+233241234567',
    crates: 2,
    pricePerCrate: 4000,
    collectedAt: '2026-10-20T09:00:00.000Z',
  });

  it('writes rows the server will accept', () => {
    expect(smsOutboxSchema.safeParse(rows.sms).success).toBe(true);
    expect(collectionSchema.safeParse(rows.collection).success).toBe(true);
    expect(ledgerEntrySchema.safeParse(rows.ledger).success).toBe(true);
  });

  it('pays crates × price and takes exactly that out of the egg fund', () => {
    expect(rows.collection['amount_paid']).toBe(8000);
    expect(rows.ledger).toMatchObject({ fund: 'egg', amount: -8000, source_type: 'collection', source_id: rows.collection.id });
  });

  it('links the receipt and words it like the design', () => {
    expect(rows.collection['receipt_sms_id']).toBe(rows.sms.id);
    expect(rows.sms['body']).toBe('Wechiau Poultry: we paid you GHS 80 for 2 crates of eggs today. Thank you.');
    expect(rows.sms['to_phone']).toBe('+233241234567');
  });
});

describe('buildSale', () => {
  const base = { buyerId: IDS.ama, crates: 8, pricePerCrate: 5200, soldAt: '2026-10-16T10:00:00.000Z' };

  it('paid in full: writes the payment and adds it to the egg fund', () => {
    const rows = buildSale(makeAs(IDS.agent), { ...base, paidInFull: true, dueOn: '2026-10-24' });
    expect(saleSchema.safeParse(rows.sale).success).toBe(true);
    expect(rows.sale['due_on']).toBeNull();
    expect(salePaymentSchema.safeParse(rows.payment).success).toBe(true);
    expect(rows.payment).toMatchObject({ sale_id: rows.sale.id, amount: 41600 });
    expect(rows.ledger).toMatchObject({ fund: 'egg', amount: 41600, source_type: 'sale_payment', source_id: rows.payment?.id });
  });

  it('pays later: nothing comes in yet, and the due date is kept', () => {
    const rows = buildSale(makeAs(IDS.agent), { ...base, crates: 2, paidInFull: false, dueOn: '2026-10-24' });
    expect(rows).toMatchObject({ payment: null, ledger: null });
    expect(rows.sale['due_on']).toBe('2026-10-24');
  });
});

describe('saleBalances', () => {
  it('works out what each buyer still owes, including part payments', () => {
    const hotel = { id: 'hotel-sale', crates: 2, price_per_crate: 5200 };
    const school = { id: 'school-sale', crates: 8, price_per_crate: 5200 };
    const later = buildSalePayment(makeAs(IDS.agent), { saleId: 'hotel-sale', amount: 4000, receivedAt: '2026-10-20T10:00:00.000Z' });
    const balances = saleBalances(
      [hotel, school],
      [
        { sale_id: 'school-sale', amount: 41600 },
        { sale_id: 'hotel-sale', amount: later.payment['amount'] as number },
      ],
    );
    expect(balances.get('hotel-sale')).toEqual({ total: 10400, received: 4000, owed: 6400 });
    expect(balances.get('school-sale')).toEqual({ total: 41600, received: 41600, owed: 0 });
  });

  it('ignores deleted payments', () => {
    const balances = saleBalances([{ id: 's', crates: 1, price_per_crate: 5200 }], [{ sale_id: 's', amount: 5200, deleted_at: '2026-10-20T10:00:00.000Z' }]);
    expect(balances.get('s')?.owed).toBe(5200);
  });
});

describe('stock and margin (October figures from the designs)', () => {
  const collections = [6, 7, 8, 9].map((crates) => ({ crates, amount_paid: crates * 4000 }));
  const sales = [12, 8, 2].map((crates) => ({ crates, price_per_crate: 5200 }));

  it('30 bought, 22 sold: 8 crates in store', () => {
    expect(cratesInStore(collections, sales)).toBe(8);
  });

  it('a gross margin of GHS 264', () => {
    expect(eggMargin(collections, sales)).toEqual({ cratesSold: 22, margin: 26400 });
  });
});

describe('cash', () => {
  const entry = (recorded_by: string, amount: number) => ({ fund: 'egg', amount, recorded_by });

  it('rebuilds the October egg fund: GHS 1,340', () => {
    const ledger = [entry(IDS.gloria, 150000), entry(IDS.gloria, -120000), entry(IDS.gloria, 104000)];
    expect(eggFundBalance(ledger)).toBe(134000);
  });

  it('follows cash between Gloria and a field agent', () => {
    const ledger = [entry(IDS.gloria, 150000), entry(IDS.agent, -8000)];
    const handovers = [{ from_user_id: IDS.gloria, to_user_id: IDS.agent, amount: 50000 }];
    expect(cashWithPerson(IDS.agent, ledger, handovers)).toBe(42000);
    expect(cashWithPerson(IDS.gloria, ledger, handovers)).toBe(100000);
    // Handing cash over moves it between people; the fund total doesn't change.
    expect(eggFundBalance(ledger)).toBe(142000);
  });

  it('leaves out the vaccine fund', () => {
    expect(cashWithPerson(IDS.agent, [{ fund: 'vaccine', amount: 3000, recorded_by: IDS.agent }], [])).toBe(0);
  });
});

describe('readSettings', () => {
  it('uses the defaults until settings arrive from the server', () => {
    const settings = readSettings([]);
    expect(settings.values.buy_price_per_crate).toBe(4000);
    expect(settings.missing).toContain('buy_price_per_crate');
  });

  it('uses what the admin set, and ignores values that are not valid', () => {
    const settings = readSettings([
      { key: 'buy_price_per_crate', value: 4500 },
      { key: 'sell_price_per_crate', value: 'a lot' },
    ]);
    expect(settings.values.buy_price_per_crate).toBe(4500);
    expect(settings.values.sell_price_per_crate).toBe(5200);
    expect(settings.missing).toContain('sell_price_per_crate');
    expect(settings.missing).not.toContain('buy_price_per_crate');
  });
});

describe('parseGhsInput', () => {
  it('reads amounts the way people type them', () => {
    expect(parseGhsInput('104')).toBe(10400);
    expect(parseGhsInput('104.5')).toBe(10450);
    expect(parseGhsInput(' 1,340 ')).toBe(134000);
    expect(parseGhsInput('GHS 40')).toBe(4000);
    expect(parseGhsInput('0')).toBe(0);
  });

  it('turns down anything else', () => {
    expect(parseGhsInput('')).toBeNull();
    expect(parseGhsInput('-5')).toBeNull();
    expect(parseGhsInput('ten')).toBeNull();
    expect(parseGhsInput('40.005')).toBeNull();
  });
});

describe('buildCollectionCorrection', () => {
  const edit = (row: ReturnType<RowFactory>, changes: Record<string, unknown>) =>
    ({ ...row, ...changes, updated_at: '2026-10-21T08:00:00.000Z' }) as ReturnType<RowFactory>;
  const original = buildCollection(makeAs(IDS.agent), {
    farmerId: IDS.naa,
    farmerPhone: '+233241234567',
    crates: 3,
    pricePerCrate: 4000,
    collectedAt: '2026-10-20T09:00:00.000Z',
  }).collection;
  const correct = (change: { crates: number } | { remove: true }) =>
    buildCollectionCorrection(makeAs(IDS.agent), edit, {
      collection: original,
      farmerPhone: '+233241234567',
      change,
      now: '2026-10-21T08:00:00.000Z',
    });

  it('3 crates corrected to 2: GHS 40 goes back into the egg fund', () => {
    const rows = correct({ crates: 2 })!;
    expect(collectionSchema.safeParse(rows.collection).success).toBe(true);
    expect(rows.collection).toMatchObject({ id: original.id, crates: 2, amount_paid: 8000 });
    expect(ledgerEntrySchema.safeParse(rows.ledger).success).toBe(true);
    expect(rows.ledger).toMatchObject({ fund: 'egg', amount: 4000, source_type: 'adjustment', source_id: original.id });
    expect(rows.sms['body']).toBe('Wechiau Poultry correction: your eggs on 20 Oct were 2 crates, GHS 80 (not 3 crates, GHS 120).');
  });

  it('more crates than recorded takes the difference out of the fund', () => {
    expect(correct({ crates: 4 })!.ledger['amount']).toBe(-4000);
  });

  it('removing it gives the whole amount back and tells the farmer to ignore the receipt', () => {
    const rows = correct({ remove: true })!;
    expect(rows.collection['deleted_at']).toBe('2026-10-21T08:00:00.000Z');
    expect(rows.ledger['amount']).toBe(12000);
    expect(rows.sms['body']).toContain('please ignore our receipt for 3 crates (GHS 120) on 20 Oct');
  });

  it('does nothing when the number is the same', () => {
    expect(correct({ crates: 3 })).toBeNull();
  });
});

describe('cash counts', () => {
  it('finds the latest count and the difference', () => {
    const counts = [
      { expected: 42000, counted: 42000, counted_at: '2026-10-19T19:00:00.000Z', recorded_by: IDS.agent },
      { expected: 42000, counted: 41000, counted_at: '2026-10-20T19:00:00.000Z', recorded_by: IDS.agent },
      { expected: 5000, counted: 5000, counted_at: '2026-10-21T19:00:00.000Z', recorded_by: IDS.otherAgent },
    ];
    const latest = latestCount(counts, IDS.agent);
    expect(latest?.counted_at).toBe('2026-10-20T19:00:00.000Z');
    expect(countDifference(latest!)).toBe(-1000);
    expect(latestCount(counts, IDS.gloria)).toBeNull();
  });
});

describe('buildSaleRemoval', () => {
  const edit = (row: ReturnType<RowFactory>, changes: Record<string, unknown>) =>
    ({ ...row, ...changes, updated_at: '2026-10-21T09:00:00.000Z' }) as ReturnType<RowFactory>;
  const now = '2026-10-21T09:00:00.000Z';
  const sold = buildSale(makeAs(IDS.agent), { buyerId: IDS.ama, crates: 3, pricePerCrate: 5200, soldAt: '2026-10-20T10:00:00.000Z', paidInFull: true, dueOn: null });
  const payments = [sold.payment!] as never[];
  const ledger = [sold.ledger!] as never[];

  it('marks the sale removed and takes the payment back out of the egg fund', () => {
    const removal = buildSaleRemoval(makeAs(IDS.agent), edit, { sale: sold.sale, payments, ledger, userId: IDS.agent, isAdmin: false, now });
    expect(removal.ok).toBe(true);
    if (!removal.ok) return;
    expect(saleSchema.parse(removal.sale).deleted_at).toBe(now);
    expect(removal.ledger.map((l) => ledgerEntrySchema.parse(l))).toMatchObject([
      { fund: 'egg', amount: -15600, source_type: 'adjustment', source_id: sold.payment!.id, note: 'Sale removed: 3 crates' },
    ]);
    // The crates count as in store again, and the person's cash nets to nothing.
    expect(cratesInStore([{ crates: 5 }], [removal.sale as never])).toBe(5);
    expect(cashWithPerson(IDS.agent, [...ledger, ...removal.ledger] as never[], [])).toBe(0);
  });

  it('needs no ledger entry for a sale nobody has paid for yet', () => {
    const owed = buildSale(makeAs(IDS.agent), { buyerId: IDS.ama, crates: 2, pricePerCrate: 5200, soldAt: '2026-10-20T10:00:00.000Z', paidInFull: false, dueOn: '2026-10-27' });
    const removal = buildSaleRemoval(makeAs(IDS.agent), edit, { sale: owed.sale, payments: [], ledger: [], userId: IDS.agent, isAdmin: false, now });
    expect(removal).toMatchObject({ ok: true, ledger: [] });
  });

  it('leaves another person\'s payment to them or the admin', () => {
    const later = buildSalePayment(makeAs(IDS.otherAgent), { saleId: sold.sale.id, amount: 1000, receivedAt: now });
    const input = { sale: sold.sale, payments: [...payments, later.payment] as never[], ledger: [...ledger, later.ledger] as never[], now };
    expect(buildSaleRemoval(makeAs(IDS.agent), edit, { ...input, userId: IDS.agent, isAdmin: false })).toEqual({
      ok: false,
      reason: 'Someone else recorded a payment for this sale. Ask the admin to remove it.',
    });
    const byAdmin = buildSaleRemoval(makeAs(IDS.gloria), edit, { ...input, userId: IDS.gloria, isAdmin: true });
    expect(byAdmin.ok && byAdmin.ledger.map((l) => l['amount'])).toEqual([-15600, -1000]);
  });
});
