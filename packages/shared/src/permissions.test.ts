import { describe, expect, it } from 'vitest';
import {
  canCreateIn,
  canRead,
  canSeeTable,
  checkCreate,
  checkUpdate,
  keepServerFields,
  PERMISSIONS,
  projectRow,
  visibleColumns,
} from './permissions.js';
import { ROLES } from './roles.js';
import { TABLES, type TableName } from './schemas/index.js';
import { ACTORS, IDS, syncFields } from './test-fixtures.js';

const MONEY_TABLES: TableName[] = [
  'cash_count',
  'collection',
  'buyer',
  'sale',
  'sale_payment',
  'ledger_entry',
  'cash_handover',
  'vaccine_payment',
];

describe('the permissions map', () => {
  it('has a rule for every table and every role', () => {
    for (const table of TABLES) {
      const rule = PERMISSIONS[table];
      expect(rule, table).toBeDefined();
      for (const role of ROLES) {
        expect(rule.read[role], `${table} read ${role}`).toBeDefined();
        expect(rule.create[role], `${table} create ${role}`).toBeDefined();
        expect(rule.update[role], `${table} update ${role}`).toBeDefined();
      }
    }
  });

  it('never lets anyone update append-only tables', () => {
    for (const table of TABLES.filter((t) => PERMISSIONS[t].appendOnly)) {
      for (const role of ROLES) expect(PERMISSIONS[table].update[role], `${table} ${role}`).toBe('none');
    }
  });
});

describe('vets see no money', () => {
  it('receive none of the money tables', () => {
    for (const table of MONEY_TABLES) expect(canSeeTable('vet', table), table).toBe(false);
  });

  it('do not receive the price on vaccination rounds', () => {
    expect(visibleColumns('vet', 'vaccination_round')).not.toContain('price_per_dose');
    const round = { ...syncFields(IDS.kofi), number: 2, date: '2026-10-20', is_free: false, price_per_dose: 300 };
    expect(projectRow('vet', 'vaccination_round', round)).not.toHaveProperty('price_per_dose');
  });

  it('read only the stock and cold-chain settings', () => {
    expect(canRead(ACTORS.kofi, 'setting', { key: 'cold_chain_max_c' })).toBe(true);
    expect(canRead(ACTORS.kofi, 'setting', { key: 'buy_price_per_crate' })).toBe(false);
    expect(canRead(ACTORS.kofi, 'setting', { key: 'price_per_dose' })).toBe(false);
  });
});

describe('field agents', () => {
  const collection = (recordedBy: string) => ({
    ...syncFields(recordedBy),
    farmer_id: IDS.naa,
    collected_at: '2026-10-20T09:00:00.000Z',
    crates: 2,
    price_per_crate: 4000,
    amount_paid: 8000,
    receipt_sms_id: null,
  });

  it('can collect eggs, record sales and register farmers', () => {
    for (const table of ['collection', 'sale', 'sale_payment', 'farmer', 'visit', 'buyer'] as const) {
      expect(canCreateIn('field_agent', table), table).toBe(true);
    }
    expect(checkCreate(ACTORS.agent, 'collection', collection(IDS.agent))).toEqual({ ok: true });
  });

  it('cannot do admin work', () => {
    for (const table of ['setting', 'user', 'vet_assignment', 'cash_handover', 'monthly_report'] as const) {
      expect(canCreateIn('field_agent', table), table).toBe(false);
    }
    expect(PERMISSIONS.setting.update.field_agent).toBe('none');
    expect(PERMISSIONS.monthly_report.update.field_agent).toBe('none');
  });

  it('can change their own collections but not another agent’s', () => {
    const mine = collection(IDS.agent);
    const theirs = collection(IDS.otherAgent);
    expect(checkUpdate(ACTORS.agent, 'collection', mine, { ...mine, crates: 3, amount_paid: 12000 }).ok).toBe(true);
    const result = checkUpdate(ACTORS.agent, 'collection', theirs, { ...theirs, crates: 3, amount_paid: 12000 });
    expect(result).toEqual({ ok: false, reason: 'You can only change egg collections you entered yourself.' });
  });

  it('admins can change anyone’s collection', () => {
    const theirs = collection(IDS.agent);
    expect(checkUpdate(ACTORS.gloria, 'collection', theirs, { ...theirs, crates: 3, amount_paid: 12000 }).ok).toBe(true);
  });

  it('see only their own ledger entries and handovers, not the whole fund', () => {
    expect(canRead(ACTORS.agent, 'ledger_entry', { recorded_by: IDS.agent })).toBe(true);
    expect(canRead(ACTORS.agent, 'ledger_entry', { recorded_by: IDS.gloria })).toBe(false);
    expect(canRead(ACTORS.agent, 'cash_handover', { from_user_id: IDS.gloria, to_user_id: IDS.agent })).toBe(true);
    expect(canRead(ACTORS.agent, 'cash_handover', { from_user_id: IDS.gloria, to_user_id: IDS.otherAgent })).toBe(false);
    expect(canRead(ACTORS.gloria, 'ledger_entry', { recorded_by: IDS.agent })).toBe(true);
  });

  it('can create ledger entries only together with their source', () => {
    expect(PERMISSIONS.ledger_entry.sourceRequired).toContain('field_agent');
    expect(PERMISSIONS.ledger_entry.sourceRequired).not.toContain('admin');
  });

  it('count only their own cash; the admin sees every count', () => {
    expect(canRead(ACTORS.agent, 'cash_count', { recorded_by: IDS.agent })).toBe(true);
    expect(canRead(ACTORS.agent, 'cash_count', { recorded_by: IDS.otherAgent })).toBe(false);
    expect(canRead(ACTORS.gloria, 'cash_count', { recorded_by: IDS.agent })).toBe(true);
    expect(canSeeTable('vet', 'cash_count')).toBe(false);
    expect(PERMISSIONS.cash_count.appendOnly).toBe(true);
  });

  it('see only a summary of health cases', () => {
    const columns = visibleColumns('field_agent', 'health_case');
    expect(columns).toContain('status');
    expect(columns).not.toContain('diagnosis');
    expect(columns).not.toContain('treatment');
  });
});

describe('everyone saves under their own login', () => {
  it('rejects a row recorded as someone else', () => {
    const visit = {
      ...syncFields(IDS.otherAgent),
      farmer_id: IDS.ama,
      visited_at: '2026-10-20T09:00:00.000Z',
      deaths: 0,
      suspected_cause: null,
      notes: null,
      photo_uri: null,
    };
    expect(checkCreate(ACTORS.agent, 'visit', visit)).toEqual({
      ok: false,
      reason: 'Records must be saved under your own login.',
    });
  });

  it("does not let anyone change who entered a record", () => {
    const sale = { ...syncFields(IDS.agent), buyer_id: IDS.ama, sold_at: '2026-10-17T10:00:00.000Z', crates: 2, price_per_crate: 5200, due_on: '2026-10-24' };
    expect(checkUpdate(ACTORS.gloria, 'sale', sale, { ...sale, recorded_by: IDS.gloria }).ok).toBe(false);
  });
});

describe('farmers', () => {
  const report = {
    ...syncFields(IDS.amaUser),
    farmer_id: IDS.ama,
    channel: 'app',
    triage_suggested: null,
    triage: null,
    triage_confirmed_by: null,
    assigned_vet_id: null,
    status: 'open',
    diagnosis: null,
    treatment: null,
    follow_up_on: null,
    closed_at: null,
  };

  it('can report a problem for their own farm only', () => {
    expect(checkCreate(ACTORS.ama, 'health_case', report)).toEqual({ ok: true });
    expect(checkCreate(ACTORS.ama, 'health_case', { ...report, farmer_id: IDS.naa })).toEqual({
      ok: false,
      reason: 'You can only add health cases for your own farm.',
    });
  });

  it('cannot set the urgency or diagnosis themselves', () => {
    expect(checkCreate(ACTORS.ama, 'health_case', { ...report, triage: 'urgent', triage_confirmed_by: IDS.amaUser }).ok).toBe(false);
    expect(checkCreate(ACTORS.ama, 'health_case', { ...report, diagnosis: 'Newcastle' }).ok).toBe(false);
  });

  it('lets a vet confirm the urgency on a farmer’s report', () => {
    const next = { ...report, triage: 'urgent', triage_confirmed_by: IDS.kofi };
    expect(checkUpdate(ACTORS.kofi, 'health_case', report, next)).toEqual({ ok: true });
    expect(checkUpdate(ACTORS.kofi, 'health_case', report, { ...next, farmer_id: IDS.naa }).ok).toBe(false);
  });

  it('report bird counts but never verify them', () => {
    const count = { ...syncFields(IDS.amaUser), farmer_id: IDS.ama, count: 39, source_id: null, counted_at: '2026-10-20T07:00:00.000Z' };
    expect(checkCreate(ACTORS.ama, 'bird_count', { ...count, kind: 'reported', source_type: 'farmer_app' }).ok).toBe(true);
    expect(checkCreate(ACTORS.ama, 'bird_count', { ...count, kind: 'verified', source_type: 'farmer_app' }).ok).toBe(false);
    expect(checkCreate(ACTORS.kofi, 'bird_count', { ...count, recorded_by: IDS.kofi, kind: 'reported', source_type: 'visit' }).ok).toBe(false);
  });

  it('read only their own farm', () => {
    expect(canRead(ACTORS.ama, 'farmer', { id: IDS.ama })).toBe(true);
    expect(canRead(ACTORS.ama, 'farmer', { id: IDS.naa })).toBe(false);
    expect(canRead(ACTORS.ama, 'collection', { farmer_id: IDS.ama })).toBe(true);
    expect(canRead(ACTORS.ama, 'collection', { farmer_id: IDS.naa })).toBe(false);
    expect(canRead(ACTORS.ama, 'ledger_entry', { recorded_by: IDS.amaUser })).toBe(false);
  });

  it('see the crate price but not the selling price', () => {
    expect(canRead(ACTORS.ama, 'setting', { key: 'buy_price_per_crate' })).toBe(true);
    expect(canRead(ACTORS.ama, 'setting', { key: 'sell_price_per_crate' })).toBe(false);
  });
});

describe('several vets', () => {
  const kofi2 = { userId: IDS.esi, role: 'vet', farmerId: null } as const;
  const report = {
    ...syncFields(IDS.amaUser),
    farmer_id: IDS.ama,
    channel: 'app',
    triage_suggested: null,
    triage: null,
    triage_confirmed_by: null,
    assigned_vet_id: IDS.kofi,
    status: 'open',
    diagnosis: null,
    treatment: null,
    follow_up_on: null,
    closed_at: null,
  };

  it('only the admin schedules vaccination rounds, so two vets cannot both start one', () => {
    expect(canCreateIn('vet', 'vaccination_round')).toBe(false);
    expect(canCreateIn('admin', 'vaccination_round')).toBe(true);
    expect(PERMISSIONS.vaccination_round.update.vet).toBe('none');
  });

  it('whoever sets the urgency is recorded as the vet who confirmed it', () => {
    const byKofi = { ...report, triage: 'urgent', triage_confirmed_by: IDS.kofi };
    expect(checkUpdate(ACTORS.kofi, 'health_case', report, byKofi).ok).toBe(true);
    // Esi can't record Kofi's name on her own decision.
    expect(checkUpdate(kofi2, 'health_case', report, byKofi)).toEqual({
      ok: false,
      reason: 'The triage of health cases must be recorded under your own name.',
    });
    // Esi can work on the case Kofi confirmed without changing the urgency.
    const treated = { ...byKofi, treatment: 'Isolate sick birds' };
    expect(checkUpdate(kofi2, 'health_case', byKofi, treated).ok).toBe(true);
  });

  it('any vet may hand a case to another vet', () => {
    expect(checkUpdate(ACTORS.kofi, 'health_case', report, { ...report, assigned_vet_id: IDS.esi }).ok).toBe(true);
  });

  it('case notes are written by vets, never changed, and only vets and the admin see them', () => {
    const note = { ...syncFields(IDS.kofi), health_case_id: IDS.ama, kind: 'diagnosis', body: 'Suspected Newcastle' };
    expect(checkCreate(ACTORS.kofi, 'case_note', note).ok).toBe(true);
    expect(checkUpdate(ACTORS.kofi, 'case_note', note, { ...note, body: 'changed' }).ok).toBe(false);
    expect(canSeeTable('field_agent', 'case_note')).toBe(false);
    expect(canSeeTable('farmer', 'case_note')).toBe(false);
    expect(canSeeTable('admin', 'case_note')).toBe(true);
  });
});

describe('only the admin assigns vets', () => {
  it('rejects anyone else', () => {
    const assignment = { ...syncFields(IDS.agent), farmer_id: IDS.ama, vet_id: IDS.kofi, assigned_at: '2026-10-20T09:00:00.000Z' };
    expect(checkCreate(ACTORS.agent, 'vet_assignment', assignment).ok).toBe(false);
    expect(checkCreate(ACTORS.kofi, 'vet_assignment', { ...assignment, recorded_by: IDS.kofi }).ok).toBe(false);
    expect(checkCreate(ACTORS.gloria, 'vet_assignment', { ...assignment, recorded_by: IDS.gloria }).ok).toBe(true);
  });
});

describe('append-only and server fields', () => {
  it('turns down edits to saved ledger entries', () => {
    const entry = { ...syncFields(IDS.gloria), fund: 'egg', amount: 150000, source_type: 'grant', source_id: null, note: null };
    expect(checkUpdate(ACTORS.gloria, 'ledger_entry', entry, { ...entry, amount: 160000 })).toEqual({
      ok: false,
      reason: "Saved ledger entries can't be changed. Add a correction instead.",
    });
  });

  it('vets record vaccinations under their own name', () => {
    const vaccination = {
      ...syncFields(IDS.kofi),
      farmer_id: IDS.ama,
      round_id: IDS.round2,
      vet_id: IDS.esi,
      batch_id: IDS.batch,
      birds_vaccinated: 39,
      farm_reading_id: null,
      vaccinated_at: '2026-10-20T09:00:00.000Z',
    };
    expect(checkCreate(ACTORS.kofi, 'vaccination', vaccination).ok).toBe(false);
    expect(checkCreate(ACTORS.kofi, 'vaccination', { ...vaccination, vet_id: IDS.kofi }).ok).toBe(true);
  });

  it('keeps the server’s AI triage and transcripts when a phone pushes', () => {
    const existing = { triage_suggested: 'urgent' };
    const pushed = { id: IDS.ama, triage_suggested: 'low', triage: 'medium' };
    expect(keepServerFields('health_case', pushed, existing)).toEqual({ id: IDS.ama, triage_suggested: 'urgent', triage: 'medium' });
    expect(keepServerFields('health_case', pushed, null)).toEqual({ id: IDS.ama, triage_suggested: null, triage: 'medium' });
  });
});
