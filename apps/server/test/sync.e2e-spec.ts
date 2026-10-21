import { pullResponseSchema, pushResponseSchema, type PullResponse, type PushResponse } from '@wechiau/shared';
import { IDS, syncFields, testId } from '@wechiau/shared/testing';
import { addAmaLogin, farmerRow, seedStaff } from './support/people.js';
import { createTestApp, resetDatabase, type TestApp } from './support/test-app.js';

type Row = Record<string, unknown> & { id: string; updated_at: string };

type Change = { table: string; id: string; op: 'upsert' | 'delete'; data: Row; updatedAt: string };
const upsert = (table: string, row: Row): Change => ({ table, id: row.id, op: 'upsert', data: row, updatedAt: row.updated_at });

function collectionRow(recordedBy: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ...syncFields(recordedBy),
    farmer_id: IDS.ama,
    collected_at: '2026-10-20T09:00:00.000Z',
    crates: 2,
    price_per_crate: 4000,
    amount_paid: 8000,
    receipt_sms_id: null,
    ...overrides,
  } as Row;
}

function ledgerRow(recordedBy: string, collectionId: string, amount: number): Row {
  return {
    ...syncFields(recordedBy),
    fund: 'egg',
    amount,
    source_type: 'collection',
    source_id: collectionId,
    note: null,
  } as Row;
}

describe('sync (e2e)', () => {
  let t: TestApp;
  let tokens: Awaited<ReturnType<typeof seedStaff>>;

  async function push(token: string, changes: Change[], deviceId = 'test-phone'): Promise<PushResponse> {
    const response = await t
      .http()
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, changes })
      .expect(200);
    return pushResponseSchema.parse(response.body);
  }

  async function pull(token: string, since = 0, limit?: number): Promise<PullResponse> {
    const response = await t
      .http()
      .get('/api/sync/pull')
      .query(limit ? { since, limit } : { since })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return pullResponseSchema.parse(response.body);
  }

  /** Pulls every page, as the phone's sync engine does. */
  async function pullAll(token: string): Promise<PullResponse['changes']> {
    const all: PullResponse['changes'] = [];
    let cursor = 0;
    for (;;) {
      const page = await pull(token, cursor);
      all.push(...page.changes);
      cursor = page.nextCursor;
      if (!page.hasMore) return all;
    }
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    tokens = await seedStaff(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('the week 1 to 2 slice', () => {
    it('a field agent registers a farmer offline, it syncs, and a vet’s phone receives it', async () => {
      const ama = farmerRow(IDS.agent);
      const pushed = await push(tokens.agent, [upsert('farmer', ama)], 'agent-phone');
      expect(pushed).toEqual({ accepted: [IDS.ama], rejected: [] });

      const changes = await pullAll(tokens.kofi);
      const farmer = changes.find((c) => c.table === 'farmer');
      expect(farmer).toMatchObject({ id: IDS.ama, op: 'upsert', data: { name: 'Ama', digital_address: 'XX-000-0001' } });
      expect(farmer?.data['recorded_by']).toBe(IDS.agent);
      // Dates and timestamps come back in the same form they were sent.
      expect(farmer?.data['joined_on']).toBe('2026-08-04');
      expect(farmer?.data['created_at']).toBe(ama.created_at);
    });

    it('a vet trying to add a farmer is turned down with a reason, and nothing is saved', async () => {
      const pushed = await push(tokens.kofi, [upsert('farmer', farmerRow(IDS.kofi))]);
      expect(pushed.accepted).toEqual([]);
      expect(pushed.rejected).toEqual([{ id: IDS.ama, table: 'farmer', reason: "Vets can't add farmer profiles." }]);
      expect(await t.prisma.farmer.count()).toBe(0);
    });

    it('a pull from the latest cursor brings nothing new', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const first = await pull(tokens.kofi);
      const again = await pull(tokens.kofi, first.nextCursor);
      expect(again.changes).toEqual([]);
      expect(again.nextCursor).toBe(first.nextCursor);
    });
  });

  describe('pushing', () => {
    it('accepts the same push twice but saves it once (a retry after a lost reply)', async () => {
      const change = upsert('farmer', farmerRow(IDS.agent));
      await push(tokens.agent, [change]);
      const retry = await push(tokens.agent, [change]);
      expect(retry.accepted).toEqual([IDS.ama]);
      expect(await t.prisma.changeLog.count({ where: { table_name: 'farmer' } })).toBe(1);
    });

    it('rejects rows saved under someone else’s login', async () => {
      const pushed = await push(tokens.agent, [upsert('farmer', farmerRow(IDS.otherAgent))]);
      expect(pushed.rejected[0]?.reason).toBe('Records must be saved under your own login.');
    });

    it('keeps the latest change when two arrive out of order', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const newer = farmerRow(IDS.agent, { landmark: 'by the new borehole', updated_at: '2026-10-21T08:00:00.000Z' });
      const older = farmerRow(IDS.agent, { landmark: 'old landmark', updated_at: '2026-10-20T12:00:00.000Z' });

      expect((await push(tokens.agent, [upsert('farmer', newer as Row)])).accepted).toEqual([IDS.ama]);
      // The older edit is accepted (so the phone drops it) but does not overwrite.
      expect((await push(tokens.otherAgent, [upsert('farmer', older as Row)])).accepted).toEqual([IDS.ama]);
      expect((await t.prisma.farmer.findUnique({ where: { id: IDS.ama } }))?.landmark).toBe('by the new borehole');
    });

    it('rejects one bad change without blocking the rest of the batch', async () => {
      const naa = farmerRow(IDS.agent, { id: IDS.naa, name: 'Naa' }) as Row;
      const assignment = { ...syncFields(IDS.agent), farmer_id: IDS.naa, vet_id: IDS.kofi, assigned_at: '2026-10-20T09:00:00.000Z' } as Row;
      const broken = farmerRow(IDS.agent, { id: testId(), phone: 'not a phone' }) as Row;

      const pushed = await push(tokens.agent, [upsert('farmer', naa), upsert('vet_assignment', assignment), upsert('farmer', broken)]);
      expect(pushed.accepted).toEqual([IDS.naa]);
      expect(pushed.rejected.map((r) => r.reason)).toEqual([
        "Field agents can't add vet assignments.",
        'Not saved: Phone must look like +233241234567 (phone).',
      ]);
      expect(await t.prisma.farmer.count()).toBe(1);
    });

    it('accepts a full-size batch of 300 farmers', async () => {
      const changes = Array.from({ length: 300 }, (_, i) => upsert('farmer', farmerRow(IDS.agent, { id: testId(), name: `Farmer ${i}` }) as Row));
      const pushed = await push(tokens.agent, changes);
      expect(pushed.accepted).toHaveLength(300);
    });
  });

  describe('what each person receives', () => {
    it('farmers receive only their own farm, their own login and their own vet, and never password hashes', async () => {
      await push(tokens.agent, [
        upsert('farmer', farmerRow(IDS.agent)),
        upsert('farmer', farmerRow(IDS.agent, { id: IDS.naa, name: 'Naa' }) as Row),
      ]);
      const assignment = { ...syncFields(IDS.gloria), farmer_id: IDS.ama, vet_id: IDS.kofi, assigned_at: '2026-10-01T08:00:00.000Z' } as Row;
      await push(tokens.gloria, [upsert('vet_assignment', assignment)]);
      const ama = await addAmaLogin(t);

      const changes = await pullAll(ama);
      expect(changes.filter((c) => c.table === 'farmer').map((c) => c.id)).toEqual([IDS.ama]);
      expect(changes.filter((c) => c.table === 'user').map((c) => String(c.data['name'])).sort((a, b) => a.localeCompare(b))).toEqual(['Ama', 'Kofi']);
      expect(JSON.stringify(changes)).not.toContain('password_hash');
      expect(JSON.stringify(changes)).not.toContain('scrypt$');
    });

    it('vets never receive money; field agents see only their own ledger entries; the admin sees all', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const mine = collectionRow(IDS.agent);
      const theirs = collectionRow(IDS.otherAgent);
      await push(tokens.agent, [upsert('collection', mine), upsert('ledger_entry', ledgerRow(IDS.agent, mine.id, -8000))]);
      await push(tokens.otherAgent, [upsert('collection', theirs), upsert('ledger_entry', ledgerRow(IDS.otherAgent, theirs.id, -8000))]);

      const tablesFor = async (token: string) => new Set((await pullAll(token)).map((c) => c.table));
      const ledgerFor = async (token: string) => (await pullAll(token)).filter((c) => c.table === 'ledger_entry');

      const vetTables = await tablesFor(tokens.kofi);
      expect(vetTables.has('collection')).toBe(false);
      expect(vetTables.has('ledger_entry')).toBe(false);
      expect((await ledgerFor(tokens.agent)).map((c) => c.data['recorded_by'])).toEqual([IDS.agent]);
      expect(await ledgerFor(tokens.gloria)).toHaveLength(2);
    });

    it('vets see only the stock and cold-chain settings, not prices', async () => {
      const setting = (key: string, value: unknown) => ({ ...syncFields(IDS.gloria), key, value }) as Row;
      await push(tokens.gloria, [upsert('setting', setting('buy_price_per_crate', 4000)), upsert('setting', setting('cold_chain_max_c', 8))]);
      const keys = (await pullAll(tokens.kofi)).filter((c) => c.table === 'setting').map((c) => c.data['key']);
      expect(keys).toEqual(['cold_chain_max_c']);
    });

    it('pages through changes with a cursor', async () => {
      const changes = Array.from({ length: 5 }, () => upsert('farmer', farmerRow(IDS.agent, { id: testId() }) as Row));
      await push(tokens.agent, changes);
      const first = await pull(tokens.kofi, 0, 2);
      expect(first.hasMore).toBe(true);
      expect((await pullAll(tokens.kofi)).filter((c) => c.table === 'farmer')).toHaveLength(5);
    });
  });

  describe('field app records', () => {
    const buyerRow = (recordedBy: string, overrides: Record<string, unknown> = {}) =>
      ({ ...syncFields(recordedBy), name: 'Wa Hotel', type: 'hotel', phone: null, location: 'Wa', ...overrides }) as Row;
    const saleRow = (recordedBy: string, buyerId: string, overrides: Record<string, unknown> = {}) =>
      ({ ...syncFields(recordedBy), buyer_id: buyerId, sold_at: '2026-10-17T10:00:00.000Z', crates: 2, price_per_crate: 5200, due_on: null, ...overrides }) as Row;
    const paymentRow = (recordedBy: string, saleId: string, amount: number) =>
      ({ ...syncFields(recordedBy), sale_id: saleId, amount, received_at: '2026-10-17T10:00:00.000Z' }) as Row;
    const paymentLedger = (recordedBy: string, paymentId: string, amount: number) =>
      ({ ...syncFields(recordedBy), fund: 'egg', amount, source_type: 'sale_payment', source_id: paymentId, note: null }) as Row;

    it('a sale paid in full goes up with its payment and ledger entry', async () => {
      const buyer = buyerRow(IDS.agent);
      const sale = saleRow(IDS.agent, buyer.id);
      const payment = paymentRow(IDS.agent, sale.id, 10400);
      const pushed = await push(tokens.agent, [
        upsert('buyer', buyer),
        upsert('sale', sale),
        upsert('sale_payment', payment),
        upsert('ledger_entry', paymentLedger(IDS.agent, payment.id, 10400)),
      ]);
      expect(pushed.rejected).toEqual([]);
      expect(await t.prisma.ledgerEntry.aggregate({ _sum: { amount: true } })).toMatchObject({ _sum: { amount: 10400 } });
    });

    it('an owed sale can be paid later, and the ledger must match the payment', async () => {
      const buyer = buyerRow(IDS.agent);
      const sale = saleRow(IDS.agent, buyer.id, { due_on: '2026-10-24' });
      await push(tokens.agent, [upsert('buyer', buyer), upsert('sale', sale)]);

      const part = paymentRow(IDS.agent, sale.id, 4000);
      const wrong = await push(tokens.agent, [upsert('sale_payment', part), upsert('ledger_entry', paymentLedger(IDS.agent, part.id, 5000))]);
      expect(wrong.accepted).toEqual([part.id]);
      expect(wrong.rejected[0]?.reason).toBe('The ledger amount must match the payment.');
    });

    it('removing a sale entered by mistake takes its payment back out of the fund, exactly and only once removed', async () => {
      const buyer = buyerRow(IDS.agent);
      const sale = saleRow(IDS.agent, buyer.id);
      const payment = paymentRow(IDS.agent, sale.id, 10400);
      await push(tokens.agent, [upsert('buyer', buyer), upsert('sale', sale), upsert('sale_payment', payment), upsert('ledger_entry', paymentLedger(IDS.agent, payment.id, 10400))]);
      const undo = (recordedBy: string, amount: number) =>
        ({ ...syncFields(recordedBy), fund: 'egg', amount, source_type: 'adjustment', source_id: payment.id, note: 'Sale removed: 2 crates' }) as Row;
      const later = '2026-10-21T08:00:00.000Z';

      // Not while the sale still stands, not by another agent, and not for a different amount.
      expect((await push(tokens.agent, [upsert('ledger_entry', undo(IDS.agent, -10400))])).rejected[0]?.reason).toBe('A payment can only be undone when its sale is removed.');
      expect((await push(tokens.otherAgent, [upsert('ledger_entry', undo(IDS.otherAgent, -10400))])).rejected[0]?.reason).toBe(
        'Field agents can only correct their own collections and payments.',
      );
      const removed = { ...sale, deleted_at: later, updated_at: later };
      const wrong = await push(tokens.agent, [{ ...upsert('sale', removed), op: 'delete' as const }, upsert('ledger_entry', undo(IDS.agent, -5000))]);
      expect(wrong.rejected[0]?.reason).toBe('The correction must cancel the payment exactly.');

      expect((await push(tokens.agent, [upsert('ledger_entry', undo(IDS.agent, -10400))])).rejected).toEqual([]);
      expect(await t.prisma.ledgerEntry.aggregate({ _sum: { amount: true } })).toMatchObject({ _sum: { amount: 0 } });
      expect((await t.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).deleted_at).not.toBeNull();
    });

    it('field agents can add buyers but only the admin changes them', async () => {
      const buyer = buyerRow(IDS.agent);
      await push(tokens.agent, [upsert('buyer', buyer)]);
      const renamed = { ...buyer, name: 'Wa Grand Hotel', updated_at: '2026-10-21T08:00:00.000Z' };
      expect((await push(tokens.agent, [upsert('buyer', renamed)])).rejected[0]?.reason).toBe("Field agents can't change buyers.");
      expect((await push(tokens.gloria, [upsert('buyer', renamed)])).accepted).toEqual([buyer.id]);
    });

    it('only the admin records cash handovers, and each agent receives only their own', async () => {
      const handover = { ...syncFields(IDS.gloria), from_user_id: IDS.gloria, to_user_id: IDS.agent, amount: 50000, handed_at: '2026-10-20T07:00:00.000Z' } as Row;
      const byAgent = { ...handover, id: testId(), recorded_by: IDS.agent };
      expect((await push(tokens.agent, [upsert('cash_handover', byAgent)])).rejected[0]?.reason).toBe("Field agents can't add cash handovers.");
      expect((await push(tokens.gloria, [upsert('cash_handover', handover)])).accepted).toEqual([handover.id]);

      const forAgent = (await pullAll(tokens.agent)).filter((c) => c.table === 'cash_handover');
      const forOther = (await pullAll(tokens.otherAgent)).filter((c) => c.table === 'cash_handover');
      expect(forAgent.map((c) => c.id)).toEqual([handover.id]);
      expect(forOther).toEqual([]);
    });

    it('a visit and its verified bird count go up together', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const visit = { ...syncFields(IDS.agent), farmer_id: IDS.ama, visited_at: '2026-10-20T09:00:00.000Z', deaths: 3, suspected_cause: 'coughing', notes: null, photo_uri: null } as Row;
      const count = { ...syncFields(IDS.agent), farmer_id: IDS.ama, count: 39, kind: 'verified', source_type: 'visit', source_id: visit.id, counted_at: '2026-10-20T09:00:00.000Z' } as Row;
      expect((await push(tokens.agent, [upsert('visit', visit), upsert('bird_count', count)])).rejected).toEqual([]);
    });

    it('a field agent can mark their own receipt as sent, but not someone else’s', async () => {
      const sms = (recordedBy: string) => ({ ...syncFields(recordedBy), to_phone: '+233241234567', body: 'Receipt', status: 'queued', attempts: 0 }) as Row;
      const mine = sms(IDS.agent);
      const theirs = sms(IDS.otherAgent);
      await push(tokens.agent, [upsert('sms_outbox', mine)]);
      await push(tokens.otherAgent, [upsert('sms_outbox', theirs)]);
      const sent = (row: Row) => ({ ...row, status: 'sent', attempts: 1, updated_at: '2026-10-21T08:00:00.000Z' }) as Row;
      expect((await push(tokens.agent, [upsert('sms_outbox', sent(mine))])).accepted).toEqual([mine.id]);
      expect((await push(tokens.agent, [upsert('sms_outbox', sent(theirs))])).rejected[0]?.reason).toBe(
        'You can only change SMS messages you entered yourself.',
      );
    });
  });

  describe('money rules', () => {
    it('a field agent’s ledger entry must match its collection', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const collection = collectionRow(IDS.agent);
      const pushed = await push(tokens.agent, [upsert('collection', collection), upsert('ledger_entry', ledgerRow(IDS.agent, collection.id, -5000))]);
      expect(pushed.accepted).toEqual([collection.id]);
      expect(pushed.rejected[0]?.reason).toBe('The ledger amount must match the collection.');
    });

    it('a field agent can’t attach a ledger entry to another agent’s collection', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const theirs = collectionRow(IDS.otherAgent);
      await push(tokens.otherAgent, [upsert('collection', theirs)]);
      const pushed = await push(tokens.agent, [upsert('ledger_entry', ledgerRow(IDS.agent, theirs.id, -8000))]);
      expect(pushed.rejected[0]?.reason).toBe('This ledger entry must come with your own egg collection.');
    });

    describe('correcting a collection', () => {
      const adjustment = (recordedBy: string, collectionId: string, amount: number) =>
        ({ ...syncFields(recordedBy), fund: 'egg', amount, source_type: 'adjustment', source_id: collectionId, note: 'Correction' }) as Row;

      async function collectThreeCrates() {
        await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
        const collection = collectionRow(IDS.agent, { crates: 3, amount_paid: 12000 });
        await push(tokens.agent, [upsert('collection', collection), upsert('ledger_entry', ledgerRow(IDS.agent, collection.id, -12000))]);
        return collection;
      }
      const later = '2026-10-21T08:00:00.000Z';
      const fundTotal = async () => (await t.prisma.ledgerEntry.aggregate({ _sum: { amount: true } }))._sum.amount;

      it('3 crates corrected to 2: the collection changes and the fund gets GHS 40 back', async () => {
        const collection = await collectThreeCrates();
        const corrected = { ...collection, crates: 2, amount_paid: 8000, updated_at: later };
        const pushed = await push(tokens.agent, [upsert('collection', corrected), upsert('ledger_entry', adjustment(IDS.agent, collection.id, 4000))]);
        expect(pushed.rejected).toEqual([]);
        expect(await fundTotal()).toBe(-8000);
      });

      it('a correction that does not match the change is turned down', async () => {
        const collection = await collectThreeCrates();
        const corrected = { ...collection, crates: 2, amount_paid: 8000, updated_at: later };
        const pushed = await push(tokens.agent, [upsert('collection', corrected), upsert('ledger_entry', adjustment(IDS.agent, collection.id, 3000))]);
        expect(pushed.rejected[0]?.reason).toBe('The correction must match the change to the collection.');
      });

      it('removing a collection gives the whole amount back to the fund', async () => {
        const collection = await collectThreeCrates();
        const removed = { ...collection, deleted_at: later, updated_at: later };
        const pushed = await push(tokens.agent, [
          { ...upsert('collection', removed), op: 'delete' as const },
          upsert('ledger_entry', adjustment(IDS.agent, collection.id, 12000)),
        ]);
        expect(pushed.rejected).toEqual([]);
        expect(await fundTotal()).toBe(0);
      });

      it('another agent cannot correct it', async () => {
        const collection = await collectThreeCrates();
        const corrected = { ...collection, crates: 2, amount_paid: 8000, updated_at: later };
        const pushed = await push(tokens.otherAgent, [upsert('collection', corrected), upsert('ledger_entry', adjustment(IDS.otherAgent, collection.id, 4000))]);
        expect(pushed.rejected.map((r) => r.reason)).toEqual([
          'You can only change egg collections you entered yourself.',
          'Field agents can only correct their own egg collections.',
        ]);
      });
    });

    it('a cash count is kept, and only the person and the admin see it', async () => {
      const count = { ...syncFields(IDS.agent), expected: 42000, counted: 41000, note: 'GHS 10 short', counted_at: '2026-10-20T19:00:00.000Z' } as Row;
      expect((await push(tokens.agent, [upsert('cash_count', count)])).accepted).toEqual([count.id]);
      const seen = async (token: string) => (await pullAll(token)).filter((c) => c.table === 'cash_count').length;
      expect(await seen(tokens.agent)).toBe(1);
      expect(await seen(tokens.gloria)).toBe(1);
      expect(await seen(tokens.otherAgent)).toBe(0);
      expect(await seen(tokens.kofi)).toBe(0);
    });

    it('saved ledger entries can’t be edited, even by the admin', async () => {
      const grant = { ...syncFields(IDS.gloria), fund: 'egg', amount: 150000, source_type: 'grant', source_id: null, note: 'Egg fund opened' } as Row;
      await push(tokens.gloria, [upsert('ledger_entry', grant)]);
      const edited = { ...grant, amount: 160000, updated_at: '2026-10-21T08:00:00.000Z' };
      const pushed = await push(tokens.gloria, [upsert('ledger_entry', edited)]);
      expect(pushed.rejected[0]?.reason).toBe("Saved ledger entries can't be changed. Add a correction instead.");
    });
  });
});
