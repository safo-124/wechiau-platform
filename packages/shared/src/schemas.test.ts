import { describe, expect, it } from 'vitest';
import {
  birdCountSchema,
  coldChainReadingSchema,
  collectionSchema,
  dateColumns,
  farmerSchema,
  healthCaseSchema,
  ledgerEntrySchema,
  messageSchema,
  settingSchema,
  tableSchemas,
  TABLES,
  timestampColumns,
  userSchema,
  vaccinationRoundSchema,
  vaccineStockEntrySchema,
} from './schemas/index.js';
import { DEFAULT_SETTINGS, settingsSchema } from './settings.js';
import { IDS, syncFields } from './test-fixtures.js';

const ama = {
  ...syncFields(IDS.agent, { id: IDS.ama }),
  name: 'Ama',
  phone: '+233241234567',
  language: 'dga',
  lat: 10.35,
  lng: -2.47,
  digital_address: 'XX-000-0001',
  landmark: 'near the borehole',
  joined_on: '2026-08-04',
  status: 'active',
  consent_training: true,
  consent_recorded_at: '2026-08-04T10:00:00.000Z',
};

/** The string format of a zod field (looking through .nullable()), or null. */
function formatOf(field: unknown): string | null {
  let def = (field as { _zod: { def: Record<string, unknown> } })._zod.def;
  while (def['type'] === 'nullable' || def['type'] === 'optional') {
    def = (def['innerType'] as { _zod: { def: Record<string, unknown> } })._zod.def;
  }
  return def['type'] === 'string' && typeof def['format'] === 'string' ? def['format'] : null;
}

describe('every table', () => {
  it('follows the column naming rule: *_at are timestamps, *_on and date are dates', () => {
    for (const table of TABLES) {
      const shape = tableSchemas[table].shape as Record<string, unknown>;
      const timestamps = Object.keys(shape).filter((c) => formatOf(shape[c]) === 'datetime');
      const dates = Object.keys(shape).filter((c) => formatOf(shape[c]) === 'date');
      expect(timestampColumns(table), table).toEqual(timestamps);
      expect(dateColumns(table), table).toEqual(dates);
    }
  });

  it('has the sync columns, including recorded_by', () => {
    for (const table of TABLES) {
      const shape = tableSchemas[table].shape as Record<string, unknown>;
      for (const column of ['id', 'created_at', 'updated_at', 'deleted_at', 'device_id', 'recorded_by']) {
        expect(shape, `${table}.${column}`).toHaveProperty(column);
      }
    }
  });
});

describe('farmer', () => {
  it('accepts a complete farmer', () => {
    expect(farmerSchema.safeParse(ama).success).toBe(true);
  });

  it('allows a missing digital address but not a wrong one', () => {
    expect(farmerSchema.safeParse({ ...ama, digital_address: null }).success).toBe(true);
    expect(farmerSchema.safeParse({ ...ama, digital_address: 'Missing' }).success).toBe(false);
  });

  it('accepts English as a language', () => {
    expect(farmerSchema.safeParse({ ...ama, language: 'eng' }).success).toBe(true);
    expect(farmerSchema.safeParse({ ...ama, language: 'twi' }).success).toBe(false);
  });

  it('needs a consent date when consent is given', () => {
    expect(farmerSchema.safeParse({ ...ama, consent_recorded_at: null }).success).toBe(false);
  });
});

describe('user', () => {
  const base = { ...syncFields(IDS.gloria), name: 'Kofi', phone: '+233201234567', email: null, status: 'active' };

  it('includes field agents', () => {
    expect(userSchema.safeParse({ ...base, role: 'field_agent', farmer_id: null }).success).toBe(true);
  });

  it('links only farmer logins to a farmer', () => {
    expect(userSchema.safeParse({ ...base, role: 'farmer', farmer_id: IDS.ama }).success).toBe(true);
    expect(userSchema.safeParse({ ...base, role: 'farmer', farmer_id: null }).success).toBe(false);
    expect(userSchema.safeParse({ ...base, role: 'vet', farmer_id: IDS.ama }).success).toBe(false);
  });
});

describe('collection', () => {
  const collection = {
    ...syncFields(IDS.agent),
    farmer_id: IDS.naa,
    collected_at: '2026-10-20T09:00:00.000Z',
    crates: 2,
    price_per_crate: 4000,
    amount_paid: 8000,
    receipt_sms_id: null,
  };

  it('accepts crates × price', () => {
    expect(collectionSchema.safeParse(collection).success).toBe(true);
  });

  it('rejects an amount that does not match', () => {
    expect(collectionSchema.safeParse({ ...collection, amount_paid: 7000 }).success).toBe(false);
  });

  it('rejects money that is not whole pesewas', () => {
    expect(collectionSchema.safeParse({ ...collection, price_per_crate: 40.5, amount_paid: 81 }).success).toBe(false);
  });
});

describe('ledger entry', () => {
  const entry = { ...syncFields(IDS.agent), fund: 'egg', source_id: null, note: null };

  it('collections take money out of the egg fund and point at the collection', () => {
    const ok = { ...entry, amount: -8000, source_type: 'collection', source_id: IDS.ama };
    expect(ledgerEntrySchema.safeParse(ok).success).toBe(true);
    expect(ledgerEntrySchema.safeParse({ ...ok, amount: 8000 }).success).toBe(false);
    expect(ledgerEntrySchema.safeParse({ ...ok, source_id: null }).success).toBe(false);
  });

  it('allows a grant without a source row', () => {
    expect(ledgerEntrySchema.safeParse({ ...entry, amount: 150000, source_type: 'grant' }).success).toBe(true);
  });

  it('rejects 0', () => {
    expect(ledgerEntrySchema.safeParse({ ...entry, amount: 0, source_type: 'adjustment' }).success).toBe(false);
  });
});

describe('bird count', () => {
  const count = { ...syncFields(IDS.kofi), farmer_id: IDS.ama, count: 42, source_id: null, counted_at: '2026-09-10T08:00:00.000Z' };

  it('keeps reported and verified counts apart by source', () => {
    expect(birdCountSchema.safeParse({ ...count, kind: 'verified', source_type: 'visit' }).success).toBe(true);
    expect(birdCountSchema.safeParse({ ...count, kind: 'reported', source_type: 'farmer_app' }).success).toBe(true);
    expect(birdCountSchema.safeParse({ ...count, kind: 'reported', source_type: 'visit' }).success).toBe(false);
    expect(birdCountSchema.safeParse({ ...count, kind: 'verified', source_type: 'voice_line' }).success).toBe(false);
  });
});

describe('vaccines', () => {
  it('free rounds have no price', () => {
    const round = { ...syncFields(IDS.kofi), number: 1, date: '2026-09-10', is_free: true, price_per_dose: null };
    expect(vaccinationRoundSchema.safeParse(round).success).toBe(true);
    expect(vaccinationRoundSchema.safeParse({ ...round, price_per_dose: 0 }).success).toBe(true);
    expect(vaccinationRoundSchema.safeParse({ ...round, price_per_dose: 100 }).success).toBe(false);
  });

  it('stock entries have the right sign for their reason', () => {
    const entry = { ...syncFields(IDS.kofi), batch_id: IDS.batch, source_type: null, source_id: null };
    expect(vaccineStockEntrySchema.safeParse({ ...entry, doses: 800, reason: 'received' }).success).toBe(true);
    expect(vaccineStockEntrySchema.safeParse({ ...entry, doses: -800, reason: 'received' }).success).toBe(false);
    expect(vaccineStockEntrySchema.safeParse({ ...entry, doses: -10, reason: 'wasted' }).success).toBe(true);
    expect(
      vaccineStockEntrySchema.safeParse({ ...entry, doses: -39, reason: 'used', source_type: 'vaccination', source_id: IDS.ama })
        .success,
    ).toBe(true);
    expect(vaccineStockEntrySchema.safeParse({ ...entry, doses: -39, reason: 'used' }).success).toBe(false);
  });

  it('farm readings name the farm', () => {
    const reading = { ...syncFields(IDS.kofi), temp_c: 7, round_id: IDS.round2, read_at: '2026-10-20T09:00:00.000Z' };
    expect(coldChainReadingSchema.safeParse({ ...reading, place: 'farm', farmer_id: IDS.ama }).success).toBe(true);
    expect(coldChainReadingSchema.safeParse({ ...reading, place: 'farm', farmer_id: null }).success).toBe(false);
    expect(coldChainReadingSchema.safeParse({ ...reading, place: 'pickup', farmer_id: null }).success).toBe(true);
  });
});

describe('health case', () => {
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

  it("accepts a farmer's report with no urgency yet", () => {
    expect(healthCaseSchema.safeParse(report).success).toBe(true);
  });

  it('records which vet confirmed the urgency', () => {
    expect(healthCaseSchema.safeParse({ ...report, triage: 'urgent' }).success).toBe(false);
    expect(healthCaseSchema.safeParse({ ...report, triage: 'urgent', triage_confirmed_by: IDS.kofi }).success).toBe(true);
  });

  it('cannot close before a vet confirms the urgency', () => {
    expect(healthCaseSchema.safeParse({ ...report, status: 'closed', closed_at: '2026-10-21T10:00:00.000Z' }).success).toBe(
      false,
    );
  });
});

describe('message', () => {
  const voice = {
    ...syncFields(IDS.amaUser),
    farmer_id: IDS.ama,
    health_case_id: null,
    direction: 'from_farmer',
    sender_id: IDS.amaUser,
    kind: 'voice',
    body: null,
    audio_uri: 'upload:11111111-1111-4111-8111-111111111111',
    audio_seconds: 12,
    transcript: null,
    translation: null,
    delivery: 'app',
    photo_uri: null,
  };

  it('voice messages carry audio and text messages carry a body', () => {
    expect(messageSchema.safeParse(voice).success).toBe(true);
    expect(messageSchema.safeParse({ ...voice, audio_uri: null }).success).toBe(false);
    // Files travel separately: a record only points at its upload.
    expect(messageSchema.safeParse({ ...voice, audio_uri: 'file:///report.m4a' }).success).toBe(false);
    expect(messageSchema.safeParse({ ...voice, photo_uri: 'upload:22222222-2222-4222-8222-222222222222' }).success).toBe(true);
    expect(messageSchema.safeParse({ ...voice, kind: 'text', audio_uri: null, audio_seconds: null }).success).toBe(false);
    expect(
      messageSchema.safeParse({ ...voice, kind: 'text', audio_uri: null, audio_seconds: null, body: 'Thank you' }).success,
    ).toBe(true);
  });
});

describe('settings', () => {
  it('defaults are valid and match the designs (GHS 40 buy, GHS 52 sell)', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(DEFAULT_SETTINGS.buy_price_per_crate).toBe(4000);
    expect(DEFAULT_SETTINGS.sell_price_per_crate).toBe(5200);
  });

  it('rejects a selling price at or below the buying price', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, sell_price_per_crate: 4000 }).success).toBe(false);
  });

  it('checks each setting row against its key', () => {
    const row = syncFields(IDS.gloria);
    expect(settingSchema.safeParse({ ...row, key: 'buy_price_per_crate', value: 4000 }).success).toBe(true);
    expect(settingSchema.safeParse({ ...row, key: 'buy_price_per_crate', value: 'forty' }).success).toBe(false);
    expect(settingSchema.safeParse({ ...row, key: 'not_a_setting', value: 1 }).success).toBe(false);
  });
});
