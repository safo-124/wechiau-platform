import { pullResponseSchema, pushResponseSchema, type PullResponse, type PushResponse } from '@wechiau/shared';
import { IDS, syncFields, testId } from '@wechiau/shared/testing';
import { addAmaLogin, farmerRow, seedStaff } from './support/people.js';
import { createTestApp, resetDatabase, type TestApp } from './support/test-app.js';

type Row = Record<string, unknown> & { id: string; updated_at: string };
type Change = { table: string; id: string; op: 'upsert' | 'delete'; data: Row; updatedAt: string };
const upsert = (table: string, row: Row): Change => ({ table, id: row.id, op: 'upsert', data: row, updatedAt: row.updated_at });
const at = (time: string) => ({ updated_at: `2026-10-20T${time}:00.000Z` });

describe('several vets (e2e)', () => {
  let t: TestApp;
  let tokens: Awaited<ReturnType<typeof seedStaff>>;

  async function push(token: string, changes: Change[]): Promise<PushResponse> {
    const response = await t.http().post('/api/sync/push').set('Authorization', `Bearer ${token}`).send({ deviceId: 'phone', changes }).expect(200);
    return pushResponseSchema.parse(response.body);
  }

  async function pullAll(token: string): Promise<PullResponse['changes']> {
    const all: PullResponse['changes'] = [];
    let cursor = 0;
    for (;;) {
      const response = await t.http().get('/api/sync/pull').query({ since: cursor }).set('Authorization', `Bearer ${token}`).expect(200);
      const page = pullResponseSchema.parse(response.body);
      all.push(...page.changes);
      cursor = page.nextCursor;
      if (!page.hasMore) return all;
    }
  }

  const round = (overrides: Record<string, unknown> = {}) =>
    ({ ...syncFields(IDS.gloria, { id: IDS.round2 }), number: 2, date: '2026-10-20', is_free: false, price_per_dose: null, ...overrides }) as Row;
  const batch = () =>
    ({ ...syncFields(IDS.gloria, { id: IDS.batch }), batch_no: 'B-1', vaccine_name: 'I-2 Newcastle vaccine', expiry_on: '2027-04-01', received_at: '2026-10-01T08:00:00.000Z' }) as Row;
  const healthCase = (recordedBy: string, overrides: Record<string, unknown> = {}) =>
    ({
      ...syncFields(recordedBy),
      farmer_id: IDS.ama,
      channel: 'visit',
      triage_suggested: null,
      triage: 'urgent',
      triage_confirmed_by: recordedBy,
      assigned_vet_id: recordedBy,
      status: 'open',
      diagnosis: null,
      treatment: null,
      follow_up_on: null,
      closed_at: null,
      ...overrides,
    }) as Row;
  const note = (recordedBy: string, caseId: string, kind: string, body: string) =>
    ({ ...syncFields(recordedBy), health_case_id: caseId, kind, body }) as Row;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    tokens = await seedStaff(t);
    await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('only Gloria schedules rounds; vets get them without the price', async () => {
    const setting = { ...syncFields(IDS.gloria), key: 'price_per_dose', value: 300 } as Row;
    await push(tokens.gloria, [upsert('setting', setting)]);

    expect((await push(tokens.kofi, [upsert('vaccination_round', round({ recorded_by: IDS.kofi }))])).rejected[0]?.reason).toBe(
      "Vets can't add vaccination rounds.",
    );
    expect((await push(tokens.gloria, [upsert('vaccination_round', round())])).accepted).toEqual([IDS.round2]);

    // The server filled the price from Settings; vets don't receive it.
    expect((await t.prisma.vaccinationRound.findUnique({ where: { id: IDS.round2 } }))?.price_per_dose).toBe(300);
    const vetCopy = (await pullAll(tokens.kofi)).find((c) => c.table === 'vaccination_round');
    expect(vetCopy?.data).not.toHaveProperty('price_per_dose');
  });

  it('each vet records vaccinations under their own name, with the stock used and the cold-box reading', async () => {
    await push(tokens.gloria, [upsert('vaccination_round', round()), upsert('vaccine_batch', batch())]);
    const reading = { ...syncFields(IDS.esi), temp_c: 7, place: 'farm', farmer_id: IDS.ama, round_id: IDS.round2, read_at: '2026-10-20T09:00:00.000Z' } as Row;
    const vaccination = {
      ...syncFields(IDS.esi),
      farmer_id: IDS.ama,
      round_id: IDS.round2,
      vet_id: IDS.esi,
      batch_id: IDS.batch,
      birds_vaccinated: 39,
      farm_reading_id: reading.id,
      vaccinated_at: '2026-10-20T09:05:00.000Z',
    } as Row;
    const used = { ...syncFields(IDS.esi), batch_id: IDS.batch, doses: -39, reason: 'used', source_type: 'vaccination', source_id: vaccination.id } as Row;

    const pushed = await push(tokens.esi, [upsert('cold_chain_reading', reading), upsert('vaccination', vaccination), upsert('vaccine_stock_entry', used)]);
    expect(pushed.rejected).toEqual([]);

    // Kofi can't record a vaccination in Esi's name.
    const asEsi = { ...vaccination, id: testId(), recorded_by: IDS.kofi };
    expect((await push(tokens.kofi, [upsert('vaccination', asEsi)])).rejected[0]?.reason).toBe("Vets can't set vet id on vaccinations.");
  });

  it('a farmer’s report goes to the vet Gloria assigned to that farmer', async () => {
    const assignment = { ...syncFields(IDS.gloria), farmer_id: IDS.ama, vet_id: IDS.esi, assigned_at: '2026-10-01T08:00:00.000Z' } as Row;
    await push(tokens.gloria, [upsert('vet_assignment', assignment)]);
    const ama = await addAmaLogin(t);
    const report = healthCase(IDS.amaUser, { channel: 'app', triage: null, triage_confirmed_by: null, assigned_vet_id: null });
    expect((await push(ama, [upsert('health_case', report)])).rejected).toEqual([]);
    expect((await t.prisma.healthCase.findUnique({ where: { id: report.id } }))?.assigned_vet_id).toBe(IDS.esi);
  });

  it('when Gloria moves a farmer to another vet, the farmer’s phone gets the new vet', async () => {
    const toKofi = { ...syncFields(IDS.gloria), farmer_id: IDS.ama, vet_id: IDS.kofi, assigned_at: '2026-10-01T08:00:00.000Z' } as Row;
    await push(tokens.gloria, [upsert('vet_assignment', toKofi)]);
    const ama = await addAmaLogin(t);
    const vetsOf = (changes: PullResponse['changes']) => changes.filter((c) => c.table === 'user' && c.data['role'] === 'vet').map((c) => c.data['name']);
    expect(vetsOf(await pullAll(ama))).toEqual(['Kofi']);

    const toEsi = { ...syncFields(IDS.gloria), farmer_id: IDS.ama, vet_id: IDS.esi, assigned_at: '2026-10-15T08:00:00.000Z' } as Row;
    await push(tokens.gloria, [upsert('vet_assignment', toEsi)]);
    expect(vetsOf(await pullAll(ama))).toEqual(['Esi']);
  });

  it('a vet hands a case to another vet, who carries on', async () => {
    const opened = healthCase(IDS.kofi, at('08:00'));
    await push(tokens.kofi, [upsert('health_case', opened)]);
    const handed = { ...opened, assigned_vet_id: IDS.esi, ...at('08:30') };
    expect(
      (await push(tokens.kofi, [upsert('health_case', handed), upsert('case_note', note(IDS.kofi, opened.id, 'handover', 'Handed to Esi'))])).rejected,
    ).toEqual([]);
    const treated = { ...handed, treatment: 'Isolate sick birds', ...at('09:00') };
    expect((await push(tokens.esi, [upsert('health_case', treated)])).accepted).toEqual([opened.id]);
  });

  it('two vets working the same case offline: the newest save wins the case, and both notes are kept', async () => {
    const opened = healthCase(IDS.kofi, at('08:00'));
    await push(tokens.kofi, [upsert('health_case', opened)]);

    // Both phones start from the same copy, offline.
    const byKofi = { ...opened, diagnosis: 'Suspected Newcastle', ...at('10:00') };
    const byEsi = { ...opened, treatment: 'Vitamins in water', ...at('10:05') };
    await push(tokens.kofi, [upsert('health_case', byKofi), upsert('case_note', note(IDS.kofi, opened.id, 'diagnosis', 'Suspected Newcastle'))]);
    await push(tokens.esi, [upsert('health_case', byEsi), upsert('case_note', note(IDS.esi, opened.id, 'treatment', 'Vitamins in water'))]);

    const saved = await t.prisma.healthCase.findUnique({ where: { id: opened.id } });
    expect(saved?.treatment).toBe('Vitamins in water');
    const notes = await t.prisma.caseNote.findMany({ where: { health_case_id: opened.id }, orderBy: { created_at: 'asc' } });
    expect(notes.map((n) => n.body).sort()).toEqual(['Suspected Newcastle', 'Vitamins in water']);
  });

  it('a vet cannot put another vet’s name on an urgency decision', async () => {
    const opened = healthCase(IDS.kofi, { triage: null, triage_confirmed_by: null, ...at('08:00') });
    await push(tokens.kofi, [upsert('health_case', opened)]);
    const forged = { ...opened, triage: 'low', triage_confirmed_by: IDS.kofi, ...at('09:00') };
    expect((await push(tokens.esi, [upsert('health_case', forged)])).rejected[0]?.reason).toBe(
      'The triage of health cases must be recorded under your own name.',
    );
  });

  it('every vet sees every case and its notes; field agents see a summary only', async () => {
    const opened = healthCase(IDS.kofi, { diagnosis: 'Suspected Newcastle' });
    await push(tokens.kofi, [upsert('health_case', opened), upsert('case_note', note(IDS.kofi, opened.id, 'diagnosis', 'Suspected Newcastle'))]);

    const esiTables = (await pullAll(tokens.esi)).filter((c) => c.table === 'health_case' || c.table === 'case_note');
    expect(esiTables.map((c) => c.table).sort()).toEqual(['case_note', 'health_case']);

    const agent = await pullAll(tokens.agent);
    const agentCase = agent.find((c) => c.table === 'health_case');
    expect(agentCase?.data).toMatchObject({ status: 'open', triage: 'urgent' });
    expect(agentCase?.data).not.toHaveProperty('diagnosis');
    expect(agent.some((c) => c.table === 'case_note')).toBe(false);
  });
});
