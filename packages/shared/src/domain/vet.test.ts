import {
  caseNoteSchema,
  coldChainReadingSchema,
  healthCaseSchema,
  smsOutboxSchema,
  vaccinationSchema,
  vaccineStockEntrySchema,
} from '../schemas/index.js';
import { IDS, syncFields } from '../test-fixtures.js';
import { describe, expect, it } from 'vitest';
import type { RowEditor, RowFactory } from './eggs.js';
import {
  buildCaseDecision,
  buildCaseFromVisit,
  buildVaccination,
  currentVets,
  dosesLeft,
  farmsInRound,
  latestReading,
  sortCases,
} from './vet.js';

const makeAs =
  (userId: string): RowFactory =>
  (fields) => ({ ...syncFields(userId), ...fields }) as ReturnType<RowFactory>;
const edit: RowEditor = (row, changes) => ({ ...row, ...changes, updated_at: '2026-10-21T08:00:00.000Z' }) as ReturnType<RowFactory>;

describe('currentVets', () => {
  it('uses each farmer’s latest assignment', () => {
    const vets = currentVets([
      { farmer_id: IDS.ama, vet_id: IDS.kofi, assigned_at: '2026-09-01T08:00:00.000Z' },
      { farmer_id: IDS.ama, vet_id: IDS.esi, assigned_at: '2026-10-15T08:00:00.000Z' },
      { farmer_id: IDS.naa, vet_id: IDS.kofi, assigned_at: '2026-09-01T08:00:00.000Z' },
    ]);
    expect(vets.get(IDS.ama)).toBe(IDS.esi);
    expect(vets.get(IDS.naa)).toBe(IDS.kofi);
  });
});

describe('farmsInRound', () => {
  it('shows which farms are done, by whom, and whose farm it is', () => {
    const farms = farmsInRound(
      [
        { id: IDS.ama, status: 'active' },
        { id: IDS.naa, status: 'active' },
        { id: 'gone', status: 'inactive' },
      ],
      [
        { farmer_id: IDS.ama, round_id: IDS.round2, vet_id: IDS.esi, birds_vaccinated: 39, vaccinated_at: '2026-10-20T09:00:00.000Z' },
        { farmer_id: IDS.naa, round_id: 'round-1', vet_id: IDS.kofi, birds_vaccinated: 30, vaccinated_at: '2026-09-10T09:00:00.000Z' },
      ],
      new Map([
        [IDS.ama, IDS.kofi],
        [IDS.naa, IDS.esi],
      ]),
      IDS.round2,
    );
    expect(farms).toEqual([
      { farmerId: IDS.ama, vetId: IDS.kofi, done: { birds: 39, byVet: IDS.esi, at: '2026-10-20T09:00:00.000Z' } },
      { farmerId: IDS.naa, vetId: IDS.esi, done: null },
    ]);
  });
});

describe('stock and cold chain', () => {
  it('counts doses left from the stock entries (design: 800 − 172 − 103 = 525)', () => {
    const { total, byBatch } = dosesLeft([
      { batch_id: 'b1', doses: 800 },
      { batch_id: 'b1', doses: -172 },
      { batch_id: 'b1', doses: -103 },
      { batch_id: 'b2', doses: 50 },
    ]);
    expect(byBatch.get('b1')).toBe(525);
    expect(total).toBe(575);
  });

  it('each vet’s latest reading is from their own cold box', () => {
    const readings = [
      { temp_c: 5, read_at: '2026-10-20T07:00:00.000Z', recorded_by: IDS.kofi },
      { temp_c: 9, read_at: '2026-10-20T08:00:00.000Z', recorded_by: IDS.esi },
      { temp_c: 6, read_at: '2026-10-20T09:00:00.000Z', recorded_by: IDS.kofi },
    ];
    expect(latestReading(readings, IDS.kofi)?.temp_c).toBe(6);
    expect(latestReading(readings, IDS.esi)?.temp_c).toBe(9);
  });
});

describe('sortCases', () => {
  const c = (id: string, status: string, triage: string | null, created: string, suggested: string | null = null) => ({
    id,
    status,
    triage,
    triage_suggested: suggested,
    created_at: `2026-10-${created}T08:00:00.000Z`,
  });

  it('open before closed, most urgent first, unknown urgency near the top, then oldest first', () => {
    const sorted = sortCases([
      c('closed', 'closed', 'urgent', '10'),
      c('low', 'open', 'low', '11'),
      c('medium', 'open', 'medium', '12'),
      c('ai-urgent', 'open', null, '15', 'urgent'),
      c('unknown', 'open', null, '14'),
      c('urgent-old', 'open', 'urgent', '13'),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['urgent-old', 'ai-urgent', 'unknown', 'medium', 'low', 'closed']);
  });
});

describe('buildVaccination', () => {
  const rows = buildVaccination(makeAs(IDS.kofi), {
    farmerId: IDS.ama,
    farmerPhone: '+233241234567',
    roundId: IDS.round2,
    roundNumber: 2,
    isFree: false,
    vetId: IDS.kofi,
    batchId: IDS.batch,
    birds: 39,
    tempC: 7,
    now: '2026-10-20T09:00:00.000Z',
  });

  it('writes the reading, the vaccination, the doses used and the receipt, all valid', () => {
    expect(coldChainReadingSchema.safeParse(rows.reading).success).toBe(true);
    expect(vaccinationSchema.safeParse(rows.vaccination).success).toBe(true);
    expect(vaccineStockEntrySchema.safeParse(rows.used).success).toBe(true);
    expect(smsOutboxSchema.safeParse(rows.sms).success).toBe(true);
  });

  it('links them together and takes one dose per bird', () => {
    expect(rows.vaccination).toMatchObject({ vet_id: IDS.kofi, farm_reading_id: rows.reading.id, birds_vaccinated: 39 });
    expect(rows.used).toMatchObject({ doses: -39, reason: 'used', source_id: rows.vaccination.id });
    expect(rows.sms?.['body']).toBe('Wechiau Poultry: 39 of your birds were vaccinated today (round 2). Thank you.');
  });
});

describe('case decisions', () => {
  const opened = makeAs(IDS.amaUser)({
    farmer_id: IDS.ama,
    channel: 'app',
    triage_suggested: 'urgent',
    triage: null,
    triage_confirmed_by: null,
    assigned_vet_id: IDS.kofi,
    status: 'open',
    diagnosis: null,
    treatment: null,
    follow_up_on: null,
    closed_at: null,
  });
  const decide = (decision: Parameters<typeof buildCaseDecision>[2]['decision'], healthCase = opened, vetId: string = IDS.kofi) =>
    buildCaseDecision(makeAs(vetId), edit, { healthCase, vetId, decision, now: '2026-10-21T08:00:00.000Z' });

  it('confirming the urgency records the vet and keeps a note of what the AI said', () => {
    const result = decide({ triage: 'medium' })!;
    expect(healthCaseSchema.safeParse(result.healthCase).success).toBe(true);
    expect(result.healthCase).toMatchObject({ triage: 'medium', triage_confirmed_by: IDS.kofi });
    expect(result.notes.map((n) => n['body'])).toEqual(['Urgency: Medium (AI suggested urgent)']);
    expect(caseNoteSchema.safeParse(result.notes[0]).success).toBe(true);
  });

  it('every decision becomes its own note', () => {
    const result = decide({
      triage: 'urgent',
      diagnosis: 'Suspected Newcastle',
      treatment: 'Isolate sick birds',
      followUpOn: '2026-10-23',
      assignTo: { id: IDS.esi, name: 'Esi' },
    })!;
    expect(result.healthCase).toMatchObject({ diagnosis: 'Suspected Newcastle', treatment: 'Isolate sick birds', assigned_vet_id: IDS.esi });
    expect(result.notes.map((n) => n['kind'])).toEqual(['triage', 'diagnosis', 'treatment', 'note', 'handover']);
  });

  it('closing needs a confirmed urgency (the schema says so) and records when', () => {
    const confirmed = decide({ triage: 'low' })!.healthCase;
    const closed = decide({ close: true }, confirmed)!;
    expect(closed.healthCase).toMatchObject({ status: 'closed', closed_at: '2026-10-21T08:00:00.000Z' });
    expect(healthCaseSchema.safeParse(closed.healthCase).success).toBe(true);
    expect(healthCaseSchema.safeParse(decide({ close: true })!.healthCase).success).toBe(false);
  });

  it('a note on its own leaves the case row as it was', () => {
    const result = decide({ note: 'Called the farmer' })!;
    expect(result.healthCase).toBe(opened);
    expect(result.notes).toHaveLength(1);
  });

  it('does nothing when nothing changes', () => {
    expect(decide({ triage: undefined, note: '  ' })).toBeNull();
  });

  it('a case opened on a visit goes to the farmer’s own vet', () => {
    const { healthCase, notes } = buildCaseFromVisit(makeAs(IDS.esi), {
      farmerId: IDS.ama,
      vetId: IDS.esi,
      farmersVet: IDS.kofi,
      triage: 'medium',
      problem: 'Two birds lame',
    });
    expect(healthCaseSchema.safeParse(healthCase).success).toBe(true);
    expect(healthCase).toMatchObject({ channel: 'visit', triage: 'medium', triage_confirmed_by: IDS.esi, assigned_vet_id: IDS.kofi });
    expect(notes.map((n) => n['body'])).toEqual(['Two birds lame', 'Urgency: Medium']);
  });
});
