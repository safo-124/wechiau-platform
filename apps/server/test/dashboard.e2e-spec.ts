import {
  buildMessage,
  DASHBOARD_COOKIE,
  DASHBOARD_HEADER,
  type ConversationPage,
  type ConversationSummary,
  type FarmersPage,
  type HealthPage,
  type MoneyPage,
  type OverviewPage,
  type ReportPage,
  type ReportView,
  type SettingsPage,
} from '@wechiau/shared';
import { IDS, syncFields } from '@wechiau/shared/testing';
import request from 'supertest';
import { farmerRow, GLORIA_EMAIL, seedStaff, TEST_PASSWORD } from './support/people.js';
import { createTestApp, resetDatabase, resetThrottle, type TestApp } from './support/test-app.js';

type Row = Record<string, unknown> & { id: string; updated_at: string };
const upsert = (table: string, row: Row) => ({ table, id: row.id, op: 'upsert' as const, data: row, updatedAt: row.updated_at });

describe('dashboard (e2e)', () => {
  let t: TestApp;
  let tokens: Awaited<ReturnType<typeof seedStaff>>;

  /** A browser signed in to the dashboard: it keeps the cookie between requests. */
  async function signedInBrowser() {
    const browser = request.agent(t.app.getHttpServer());
    await browser.post('/api/auth/dashboard/login').send({ email: GLORIA_EMAIL, password: TEST_PASSWORD }).expect(200);
    return browser;
  }

  async function push(token: string, changes: ReturnType<typeof upsert>[]) {
    const res = await t.http().post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ deviceId: 'phone', changes }).expect(200);
    return res.body as { accepted: string[]; rejected: { reason: string }[] };
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    resetThrottle(t);
    tokens = await seedStaff(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('signing in with email', () => {
    it('gives Gloria a cookie that page scripts cannot read', async () => {
      const res = await t.http().post('/api/auth/dashboard/login').send({ email: 'Gloria@Wechiau.test', password: TEST_PASSWORD }).expect(200);
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain(`${DASHBOARD_COOKIE}=`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(res.body.user).toMatchObject({ id: IDS.gloria, role: 'admin' });
      expect(JSON.stringify(res.body)).not.toContain('token');
    });

    it('turns away a wrong password and anyone who is not an admin', async () => {
      const wrong = await t.http().post('/api/auth/dashboard/login').send({ email: GLORIA_EMAIL, password: 'nope' }).expect(401);
      expect(wrong.body.message).toBe('Email or password is wrong.');
      await t.http().post('/api/auth/dashboard/login').send({ email: 'agent@wechiau.test', password: TEST_PASSWORD }).expect(403);
    });

    it('stops password guessing after 5 wrong tries', async () => {
      for (let i = 0; i < 5; i++) await t.http().post('/api/auth/dashboard/login').send({ email: GLORIA_EMAIL, password: `guess-${i}` }).expect(401);
      const blocked = await t.http().post('/api/auth/dashboard/login').send({ email: GLORIA_EMAIL, password: TEST_PASSWORD }).expect(429);
      expect(blocked.body.message).toBe('Too many wrong tries. Wait 15 minutes and try again.');
    });

    it('needs the dashboard header for changes made with the cookie', async () => {
      const browser = await signedInBrowser();
      await browser.get('/api/dashboard/settings').expect(200);
      await browser.put('/api/dashboard/settings').send({ buy_price_per_crate: 4500 }).expect(403);
      await browser.put('/api/dashboard/settings').set(DASHBOARD_HEADER, '1').send({ buy_price_per_crate: 4500 }).expect(204);
    });

    it('signs out and the cookie stops working', async () => {
      const browser = await signedInBrowser();
      await browser.post('/api/auth/logout').set(DASHBOARD_HEADER, '1').expect(204);
      await browser.get('/api/dashboard/overview').expect(401);
    });

    it('keeps vets and field agents out of the dashboard API', async () => {
      await t.http().get('/api/dashboard/overview').set('Authorization', `Bearer ${tokens.kofi}`).expect(403);
      await t.http().get('/api/dashboard/money').set('Authorization', `Bearer ${tokens.agent}`).expect(403);
    });
  });

  describe('changes made on the dashboard reach the phones', () => {
    it('assigning a vet is checked and synced like a phone change', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const browser = await signedInBrowser();
      await browser.post(`/api/dashboard/farmers/${IDS.ama}/vet`).set(DASHBOARD_HEADER, '1').send({ vet_id: IDS.esi }).expect(204);
      await browser.post(`/api/dashboard/farmers/${IDS.ama}/vet`).set(DASHBOARD_HEADER, '1').send({ vet_id: IDS.agent }).expect(400);

      const page = (await browser.get('/api/dashboard/farmers').expect(200)).body as FarmersPage;
      expect(page.farmers[0]).toMatchObject({ name: 'Ama', vetId: IDS.esi });
      expect(page.vets.find((v) => v.id === IDS.esi)?.farmers).toBe(1);

      const pulled = await t.http().get('/api/sync/pull').set('Authorization', `Bearer ${tokens.esi}`).expect(200);
      expect(pulled.body.changes.some((c: { table: string }) => c.table === 'vet_assignment')).toBe(true);
    });

    it('schedules each round once', async () => {
      const browser = await signedInBrowser();
      await browser.post('/api/dashboard/rounds').set(DASHBOARD_HEADER, '1').send({ number: 2, date: '2026-10-24', is_free: false }).expect(204);
      const again = await browser.post('/api/dashboard/rounds').set(DASHBOARD_HEADER, '1').send({ number: 2, date: '2026-10-25', is_free: false }).expect(409);
      expect(again.body.message).toBe('Round 2 is already scheduled.');
    });

    it('checks prices together: selling must be above buying', async () => {
      const browser = await signedInBrowser();
      const bad = await browser.put('/api/dashboard/settings').set(DASHBOARD_HEADER, '1').send({ sell_price_per_crate: 3000 }).expect(400);
      expect(bad.body.message).toBe('Selling price must be higher than the price paid to farmers');
      await browser.put('/api/dashboard/settings').set(DASHBOARD_HEADER, '1').send({ price_per_dose: 300 }).expect(204);
      const page = (await browser.get('/api/dashboard/settings').expect(200)).body as SettingsPage;
      expect(page.values.price_per_dose).toBe(300);
    });

    it('invites a vet, sets a password, and the vet signs in on the phone', async () => {
      const browser = await signedInBrowser();
      const invited = await browser
        .post('/api/dashboard/users')
        .set(DASHBOARD_HEADER, '1')
        .send({ name: 'Abena', phone: '024 555 0101', email: null, role: 'vet' })
        .expect(201);
      const id = invited.body.id as string;
      await t.http().post('/api/auth/login').send({ phone: '0245550101', password: 'abena-first-pass', deviceId: 'x' }).expect(401);

      await browser.post(`/api/dashboard/users/${id}/password`).set(DASHBOARD_HEADER, '1').send({ password: 'abena-first-pass' }).expect(204);
      await t.http().post('/api/auth/login').send({ phone: '0245550101', password: 'abena-first-pass', deviceId: 'x' }).expect(200);

      const page = (await browser.get('/api/dashboard/settings').expect(200)).body as SettingsPage;
      expect(page.users.find((u) => u.id === id)).toMatchObject({ status: 'active', hasPassword: true, role: 'vet' });
    });

    it('records the grant the egg fund starts with, corrections, and cash handed to an agent', async () => {
      const browser = await signedInBrowser();
      const post = (path: string, body: object) => browser.post(path).set(DASHBOARD_HEADER, '1').send(body);
      await post('/api/dashboard/ledger', { kind: 'grant', fund: 'egg', amount: 150000, note: 'Starting grant' }).expect(201);
      await post('/api/dashboard/ledger', { kind: 'grant', fund: 'egg', amount: -100, note: null }).expect(400);
      const noReason = await post('/api/dashboard/ledger', { kind: 'adjustment', fund: 'egg', amount: -500, note: '' }).expect(400);
      expect(noReason.body.message).toBe('Say what the correction is for (note)');
      await post('/api/dashboard/ledger', { kind: 'adjustment', fund: 'egg', amount: -500, note: 'Counted short at month end' }).expect(201);

      await post('/api/dashboard/handovers', { from_user_id: IDS.gloria, to_user_id: IDS.agent, amount: 50000 }).expect(201);
      const toVet = await post('/api/dashboard/handovers', { from_user_id: IDS.gloria, to_user_id: IDS.kofi, amount: 100 }).expect(400);
      expect(toVet.body.message).toBe('Cash moves between the admin and field agents with active accounts.');

      const money = (await browser.get('/api/dashboard/money').query({ from: '2020-01-01' }).expect(200)).body as MoneyPage;
      expect(money.summary).toMatchObject({ cash: 149500, started: 150000 });
      expect(money.ledger.map((r) => [r.entry, r.source, r.amount, r.balance])).toEqual([
        ['Starting grant', 'grant', 150000, 150000],
        ['Counted short at month end', 'adjustment', -500, 149500],
      ]);
      expect(money.people.find((p) => p.id === IDS.gloria)?.cash).toBe(99500);
      expect(money.people.find((p) => p.id === IDS.agent)?.cash).toBe(50000);

      // The agent's phone receives the handover, but not Gloria's ledger entries.
      const pulled = await t.http().get('/api/sync/pull').set('Authorization', `Bearer ${tokens.agent}`).expect(200);
      const tables = (pulled.body.changes as { table: string }[]).map((c) => c.table);
      expect(tables).toContain('cash_handover');
      expect(tables).not.toContain('ledger_entry');
    });

    it('gives farmers farmer-app logins with a PIN, and turns them off and on', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const browser = await signedInBrowser();
      const before = (await browser.get('/api/dashboard/settings').expect(200)).body as SettingsPage;
      expect(before.farmersWithoutLogin).toEqual([{ id: IDS.ama, name: 'Ama', phone: '+233241234567' }]);

      await browser.post(`/api/farmers/${IDS.ama}/app-access`).expect(403); // the cookie needs the dashboard header
      const access = (await browser.post(`/api/farmers/${IDS.ama}/app-access`).set(DASHBOARD_HEADER, '1').expect(201)).body as { pin: string; user_id: string };
      const after = (await browser.get('/api/dashboard/settings').expect(200)).body as SettingsPage;
      expect(after.farmersWithoutLogin).toEqual([]);
      expect(after.users.find((u) => u.role === 'farmer')).toMatchObject({ id: access.user_id, name: 'Ama', farmerId: IDS.ama, status: 'active', hasPassword: true });
      const signIn = () => t.http().post('/api/auth/login').send({ phone: '0241234567', password: access.pin, deviceId: 'ama-phone' });
      await signIn().expect(200);

      // Turned off on the dashboard: no sign-in, and a field agent can't switch it back on with a new PIN.
      await browser.put(`/api/dashboard/users/${access.user_id}`).set(DASHBOARD_HEADER, '1').send({ status: 'disabled' }).expect(204);
      await signIn().expect(403);
      const agentPin = await t.http().post(`/api/farmers/${IDS.ama}/app-access`).set('Authorization', `Bearer ${tokens.agent}`).expect(400);
      expect(agentPin.body.message).toContain('turned off');
      await browser.put(`/api/dashboard/users/${access.user_id}`).set(DASHBOARD_HEADER, '1').send({ status: 'active' }).expect(204);
      await signIn().expect(200);

      // A farmer's name and phone belong to their farmer profile, and they use a PIN, not a password.
      await browser.put(`/api/dashboard/users/${access.user_id}`).set(DASHBOARD_HEADER, '1').send({ name: 'Someone else' }).expect(400);
      await browser.post(`/api/dashboard/users/${access.user_id}/password`).set(DASHBOARD_HEADER, '1').send({ password: 'a-long-password' }).expect(400);
    });

    it('shows Gloria the farmers\' conversations, and her written reply reaches the farmer app', async () => {
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const browser = await signedInBrowser();
      const access = (await browser.post(`/api/farmers/${IDS.ama}/app-access`).set(DASHBOARD_HEADER, '1').expect(201)).body as { pin: string; user_id: string };
      const ama = (await t.http().post('/api/auth/login').send({ phone: '0241234567', password: access.pin, deviceId: 'ama-phone' }).expect(200)).body.token as string;
      const makeAs = (userId: string) => (fields: Record<string, unknown>) => ({ ...syncFields(userId), ...fields }) as Row;

      const report = buildMessage(makeAs(access.user_id), { farmerId: IDS.ama, senderId: access.user_id, from: 'farmer', text: 'My birds are coughing' });
      await push(ama, [upsert('message', report as Row)]);
      const answer = buildMessage(makeAs(IDS.kofi), { farmerId: IDS.ama, senderId: IDS.kofi, from: 'staff', text: 'I will visit tomorrow' });
      await push(tokens.kofi, [upsert('message', answer as Row)]);

      const list = (await browser.get('/api/dashboard/messages').expect(200)).body as ConversationSummary[];
      expect(list).toEqual([expect.objectContaining({ farmerId: IDS.ama, farmerName: 'Ama', fromFarmer: 1, lastDirection: 'to_farmer', lastPreview: 'I will visit tomorrow' })]);
      const page = (await browser.get(`/api/dashboard/messages/${IDS.ama}`).expect(200)).body as ConversationPage;
      expect(page.messages.map((m) => [m.senderName, m.body])).toEqual([
        ['Ama', 'My birds are coughing'],
        ['Kofi', 'I will visit tomorrow'],
      ]);

      await browser.post(`/api/dashboard/messages/${IDS.ama}`).set(DASHBOARD_HEADER, '1').send({ body: '' }).expect(400);
      const sent = (await browser.post(`/api/dashboard/messages/${IDS.ama}`).set(DASHBOARD_HEADER, '1').send({ body: 'Gloria here: thank you, Ama.' }).expect(201)).body as { id: string };
      const pulled = await t.http().get('/api/sync/pull').set('Authorization', `Bearer ${ama}`).expect(200);
      expect((pulled.body.changes as { id: string; data: Record<string, unknown> }[]).find((c) => c.id === sent.id)?.data).toMatchObject({
        direction: 'to_farmer',
        sender_id: IDS.gloria,
        body: 'Gloria here: thank you, Ama.',
      });
      await t.http().get('/api/dashboard/messages').set('Authorization', `Bearer ${tokens.agent}`).expect(403);
    });

    it('turning an account off signs that person out everywhere', async () => {
      const browser = await signedInBrowser();
      await browser.put(`/api/dashboard/users/${IDS.agent}`).set(DASHBOARD_HEADER, '1').send({ status: 'disabled' }).expect(204);
      await t.http().get('/api/auth/me').set('Authorization', `Bearer ${tokens.agent}`).expect(401);
      const self = await browser.put(`/api/dashboard/users/${IDS.gloria}`).set(DASHBOARD_HEADER, '1').send({ status: 'disabled' }).expect(400);
      expect(self.body.message).toBe("You can't turn off or change your own admin account.");
    });
  });

  describe('figures', () => {
    it('says what to do first on a new, empty server', async () => {
      const browser = await signedInBrowser();
      const overview = (await browser.get('/api/dashboard/overview').expect(200)).body as OverviewPage;
      expect(overview.attention).toEqual([
        { tone: 'comingUp', text: 'No vaccine recorded yet. Vets add each batch in the vet app, under Stock.', page: 'health' },
        { tone: 'neutral', text: 'No farmers enrolled yet. Field agents register them in the field app.', page: 'farmers' },
      ]);
    });

    it('works out the overview, the ledger with its running balance, and the CSV', async () => {
      const browser = await signedInBrowser();
      const grant = { ...syncFields(IDS.gloria), fund: 'egg', amount: 150000, source_type: 'grant', source_id: null, note: 'Egg fund opened (grant)' } as Row;
      await push(tokens.gloria, [upsert('ledger_entry', grant)]);
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const collection = {
        ...syncFields(IDS.agent),
        farmer_id: IDS.ama,
        collected_at: new Date().toISOString(),
        crates: 3,
        price_per_crate: 4000,
        amount_paid: 12000,
        receipt_sms_id: null,
      } as Row;
      const entry = { ...syncFields(IDS.agent), fund: 'egg', amount: -12000, source_type: 'collection', source_id: collection.id, note: null } as Row;
      await push(tokens.agent, [upsert('collection', collection), upsert('ledger_entry', entry)]);

      const overview = (await browser.get('/api/dashboard/overview').expect(200)).body as OverviewPage;
      expect(overview.crates).toMatchObject({ bought: 3, sold: 0, inStore: 3 });
      expect(overview.fund.cash).toBe(138000);
      expect(overview.attention.some((a) => a.text.includes('have no vet') || a.text.includes('has no vet'))).toBe(true);

      const money = (await browser.get('/api/dashboard/money').query({ from: '2020-01-01' }).expect(200)).body as MoneyPage;
      expect(money.ledger.map((r) => [r.entry, r.amount, r.balance])).toEqual([
        ['Egg fund opened (grant)', 150000, 150000],
        ['Collection · Ama · 3 crates', -12000, 138000],
      ]);
      expect(money.people.find((p) => p.id === IDS.agent)?.cash).toBe(-12000);
      // Each collection says whose farm it was, for the ledger's "By farmer".
      expect(money.ledger.map((r) => r.farmerName)).toEqual([null, 'Ama']);

      // Health: the stock history and deaths found on visits since each round.
      const batch = { ...syncFields(IDS.kofi), batch_no: 'I2-001', vaccine_name: 'I-2 Newcastle', expiry_on: '2027-03-01', received_at: new Date().toISOString() } as Row;
      const received = { ...syncFields(IDS.kofi), batch_id: batch.id, doses: 500, reason: 'received', source_type: null, source_id: null } as Row;
      await push(tokens.kofi, [upsert('vaccine_batch', batch), upsert('vaccine_stock_entry', received)]);
      const round = { ...syncFields(IDS.gloria), number: 1, date: '2026-09-01', is_free: true, price_per_dose: 0 } as Row;
      await push(tokens.gloria, [upsert('vaccination_round', round)]);
      const visit = { ...syncFields(IDS.agent), farmer_id: IDS.ama, visited_at: new Date().toISOString(), deaths: 3, suspected_cause: null, notes: null, photo_uri: null } as Row;
      await push(tokens.agent, [upsert('visit', visit)]);
      const health = (await browser.get('/api/dashboard/health').expect(200)).body as HealthPage;
      expect(health.stockHistory).toEqual([expect.objectContaining({ batchNo: 'I2-001', reason: 'received', doses: 500, by: 'Kofi' })]);
      expect(health.rounds).toEqual([expect.objectContaining({ number: 1, deaths: 3 })]);

      const csv = await browser.get('/api/dashboard/money.csv').query({ from: '2020-01-01' }).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('"Collection · Ama · 3 crates",-120.00,1380.00,"Agent One"');
    });

    it('builds the monthly report: figures, a draft, Gloria\'s edits and approval', async () => {
      const month = new Date().toISOString().slice(0, 7);
      await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
      const collection = {
        ...syncFields(IDS.agent),
        farmer_id: IDS.ama,
        collected_at: new Date().toISOString(),
        crates: 3,
        price_per_crate: 4000,
        amount_paid: 12000,
        receipt_sms_id: null,
      } as Row;
      const entry = { ...syncFields(IDS.agent), fund: 'egg', amount: -12000, source_type: 'collection', source_id: collection.id, note: null } as Row;
      await push(tokens.agent, [upsert('collection', collection), upsert('ledger_entry', entry)]);

      const browser = await signedInBrowser();
      const send = (method: 'post' | 'put', path: string, body?: object) => browser[method](path).set(DASHBOARD_HEADER, '1').send(body);
      const page = async () => (await browser.get(`/api/dashboard/reports/${month}`).expect(200)).body as ReportPage;

      const first = await page();
      expect(first.figures.eggs).toMatchObject({ cratesBought: 3, paidToFarmers: 12000 });
      expect(first.figures.perFarmer).toEqual([expect.objectContaining({ name: 'Ama', crates: 3 })]);
      expect(first.report).toBeNull();
      await browser.get('/api/dashboard/reports/2026-13').expect(400);

      const drafted = (await send('post', `/api/dashboard/reports/${month}/draft`).expect(201)).body as ReportView;
      expect(drafted).toMatchObject({ status: 'draft', finalText: null });
      expect(drafted.draftText).toContain('We bought 3 crates of eggs from farmers for GHS 120');

      await send('post', `/api/dashboard/reports/${month}/sent`).expect(400); // not approved yet
      await send('put', `/api/dashboard/reports/${month}`, { final_text: 'Our first month.' }).expect(204);
      await send('post', `/api/dashboard/reports/${month}/approve`, { final_text: 'Our first month went well.' }).expect(204);
      expect((await page()).report).toMatchObject({ status: 'approved', finalText: 'Our first month went well.', approvedBy: 'Gloria Gyimaa' });

      // A new draft from later figures keeps Gloria's approved text.
      await send('post', `/api/dashboard/reports/${month}/draft`).expect(201);
      expect((await page()).report).toMatchObject({ status: 'approved', finalText: 'Our first month went well.' });

      // Changing approved text needs approving again.
      await send('put', `/api/dashboard/reports/${month}`, { final_text: 'Changed after approval.' }).expect(204);
      expect((await page()).report).toMatchObject({ status: 'draft', approvedBy: null, approvedAt: null });
      await send('post', `/api/dashboard/reports/${month}/approve`, { final_text: 'Changed after approval.' }).expect(204);
      await send('post', `/api/dashboard/reports/${month}/sent`).expect(204);
      const sent = (await page()).report!;
      expect(sent.status).toBe('sent');

      // Only the server writes the draft, even from Gloria's own phone.
      const stored = await t.prisma.monthlyReport.findUniqueOrThrow({ where: { month } });
      const changed = { ...stored, draft_text: 'Rewritten on a phone', updated_at: new Date(Date.now() + 1000).toISOString() };
      await push(tokens.gloria, [upsert('monthly_report', { ...changed, created_at: stored.created_at.toISOString(), approved_at: stored.approved_at?.toISOString() ?? null } as unknown as Row)]);
      expect((await page()).report?.draftText).toBe(sent.draftText);

      const csv = await browser.get(`/api/dashboard/reports/${month}/csv`).expect(200);
      expect(csv.text.charCodeAt(0)).toBe(0xfeff); // so Excel reads it as UTF-8
      expect(csv.text).toContain('Crates bought from farmers,3');
      expect(csv.text).toContain('Ama,3,120.00,0,0,');
      expect(csv.text).toContain('Summary,Changed after approval.');

      // Admins only, and field agents' phones never receive reports.
      await t.http().get(`/api/dashboard/reports/${month}`).set('Authorization', `Bearer ${tokens.agent}`).expect(403);
      const agentPull = await t.http().get('/api/sync/pull').set('Authorization', `Bearer ${tokens.agent}`).expect(200);
      expect((agentPull.body.changes as { table: string }[]).some((c) => c.table === 'monthly_report')).toBe(false);
    });

    it('queues a payment reminder to a buyer who owes', async () => {
      const buyer = { ...syncFields(IDS.agent), name: 'Wa Hotel', type: 'hotel', phone: '+233241112222', location: null } as Row;
      const sale = { ...syncFields(IDS.agent), buyer_id: buyer.id, sold_at: '2026-10-17T10:00:00.000Z', crates: 2, price_per_crate: 5200, due_on: '2026-10-24' } as Row;
      await push(tokens.agent, [upsert('buyer', buyer), upsert('sale', sale)]);
      const browser = await signedInBrowser();
      const res = await browser.post(`/api/dashboard/sales/${sale.id}/reminder`).set(DASHBOARD_HEADER, '1').expect(201);
      expect(res.body).toEqual({ to: '+233241112222', body: 'Wechiau Poultry: a reminder that GHS 104 for 2 crates of eggs is due on 24 Oct. Thank you.' });
      expect(await t.prisma.smsOutbox.count({ where: { to_phone: '+233241112222', status: 'queued' } })).toBe(1);
    });
  });
});
