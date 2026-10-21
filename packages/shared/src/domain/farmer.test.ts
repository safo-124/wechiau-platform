import { describe, expect, it } from 'vitest';
import { checkCreate } from '../permissions.js';
import { healthCaseSchema, messageSchema } from '../schemas/index.js';
import { ACTORS, IDS, syncFields } from '../test-fixtures.js';
import type { RowFactory } from './eggs.js';
import {
  buildFarmerReport,
  buildMessage,
  chatItems,
  currentBirds,
  farmStory,
  flockStatus,
  nextRound,
  paidSince,
  unreadCount,
  type MessageLike,
} from './farmer.js';

const makeAs =
  (userId: string): RowFactory =>
  (fields) => ({ ...syncFields(userId), ...fields }) as ReturnType<RowFactory>;
const at = (d: string) => `${d}T09:00:00.000Z`;

const ROUNDS = [
  { id: 'r1', number: 1, date: '2026-09-10', is_free: true },
  { id: 'r2', number: 2, date: '2026-10-23', is_free: false },
];

describe('the farm at a glance', () => {
  it('prefers a verified bird count over what the farmer reported', () => {
    expect(
      currentBirds([
        { kind: 'verified', count: 42, counted_at: at('2026-10-01') },
        { kind: 'reported', count: 45, counted_at: at('2026-10-10') },
      ]),
    ).toBe(42);
    expect(currentBirds([{ kind: 'reported', count: 45, counted_at: at('2026-10-10') }])).toBe(45);
    expect(currentBirds([])).toBeNull();
  });

  it('shows birds protected in the latest round, and the next vaccine day', () => {
    const status = flockStatus(
      {
        counts: [{ kind: 'verified', count: 42, counted_at: at('2026-10-01') }],
        rounds: ROUNDS,
        vaccinations: [{ round_id: 'r1', birds_vaccinated: 38, vaccinated_at: at('2026-09-10') }],
      },
      '2026-10-20',
    );
    expect(status).toMatchObject({ birds: 42, protected: 38, round: { number: 1 } });
    expect(nextRound(ROUNDS, '2026-10-20')?.number).toBe(2);
    expect(nextRound(ROUNDS, '2026-10-24')).toBeNull();
  });

  it('adds up what the farmer was paid this month', () => {
    const collections = [
      { id: 'a', collected_at: at('2026-10-02'), crates: 2, amount_paid: 8000, price_per_crate: 4000 },
      { id: 'b', collected_at: at('2026-10-20'), crates: 1, amount_paid: 4000, price_per_crate: 4000 },
      { id: 'c', collected_at: at('2026-09-28'), crates: 5, amount_paid: 20000, price_per_crate: 4000 },
      { id: 'd', collected_at: at('2026-10-05'), crates: 9, amount_paid: 36000, price_per_crate: 4000, deleted_at: at('2026-10-05') },
    ];
    expect(paidSince(collections, '2026-10-01T00:00:00.000Z')).toEqual({ paid: 12000, crates: 3 });
  });
});

describe('farm story', () => {
  it('tells what happened, newest first', () => {
    const story = farmStory({
      joinedAt: at('2026-08-15'),
      collections: [{ id: 'c1', collected_at: at('2026-10-19'), crates: 2, amount_paid: 8000, price_per_crate: 4000 }],
      vaccinations: [{ id: 'v1', round_id: 'r1', birds_vaccinated: 38, vaccinated_at: at('2026-09-10') }],
      rounds: ROUNDS,
      visits: [{ id: 'vi1', visited_at: at('2026-10-12'), deaths: 3 }],
      cases: [{ id: 'k1', channel: 'app', status: 'closed', created_at: at('2026-10-11'), closed_at: at('2026-10-14'), diagnosis: 'Other respiratory' }],
      vaccinePayments: [],
    });
    expect(story.map((e) => e.text)).toEqual([
      'Paid GHS 80 for 2 crates',
      'Problem closed by the vet: Other respiratory',
      'Visit from Wechiau. 3 birds had died.',
      'You reported a problem',
      '38 birds vaccinated, round 1, free',
      'Joined Wechiau Poultry',
    ]);
  });
});

describe('messages', () => {
  const message = (id: string, direction: string, created: string): MessageLike => ({
    id,
    created_at: at(created),
    direction,
    kind: 'text',
    body: 'Hello',
    audio_uri: null,
    audio_seconds: null,
    photo_uri: null,
    sender_id: null,
    health_case_id: null,
  });

  it('puts egg payments in the conversation as receipts, oldest first', () => {
    const items = chatItems(
      [message('m1', 'from_farmer', '2026-10-10'), message('m2', 'to_farmer', '2026-10-12')],
      [{ id: 'c1', collected_at: at('2026-10-11'), crates: 2, amount_paid: 8000, price_per_crate: 4000 }],
    );
    expect(items.map((i) => (i.type === 'paid' ? `${i.text} · ${i.detail}` : i.id))).toEqual(['m1', 'Paid GHS 80 · 2 crates of eggs', 'm2']);
  });

  it('counts replies the farmer has not seen yet', () => {
    const messages = [message('m1', 'to_farmer', '2026-10-10'), message('m2', 'to_farmer', '2026-10-12'), message('m3', 'from_farmer', '2026-10-13')];
    expect(unreadCount(messages, null, 'to_farmer')).toBe(2);
    expect(unreadCount(messages, at('2026-10-11'), 'to_farmer')).toBe(1);
  });

  it('builds a farmer report as a case and its first voice message, which the server accepts', () => {
    const make = makeAs(IDS.amaUser);
    const { healthCase, message: first } = buildFarmerReport(make, {
      farmerId: IDS.ama,
      farmerUserId: IDS.amaUser,
      voice: { uploadId: '11111111-1111-4111-8111-111111111111', seconds: 12.4 },
      photoUploadId: '22222222-2222-4222-8222-222222222222',
    });
    expect(healthCaseSchema.safeParse(healthCase).success).toBe(true);
    expect(messageSchema.parse(first)).toMatchObject({
      health_case_id: healthCase.id,
      direction: 'from_farmer',
      kind: 'voice',
      audio_uri: 'upload:11111111-1111-4111-8111-111111111111',
      audio_seconds: 12,
      photo_uri: 'upload:22222222-2222-4222-8222-222222222222',
    });
    expect(checkCreate(ACTORS.ama, 'health_case', healthCase)).toEqual({ ok: true });
    expect(checkCreate(ACTORS.ama, 'message', first)).toEqual({ ok: true });
  });

  it('builds a vet reply that only a vet or the admin may send to the farmer', () => {
    const reply = buildMessage(makeAs(IDS.kofi), { farmerId: IDS.ama, senderId: IDS.kofi, from: 'staff', text: 'A vet will visit tomorrow' });
    expect(messageSchema.parse(reply)).toMatchObject({ direction: 'to_farmer', kind: 'text', body: 'A vet will visit tomorrow', audio_uri: null });
    expect(checkCreate(ACTORS.kofi, 'message', reply)).toEqual({ ok: true });
    // A field agent is not part of the vet conversation.
    expect(checkCreate(ACTORS.agent, 'message', { ...reply, recorded_by: IDS.agent, sender_id: IDS.agent }).ok).toBe(false);
  });

  it('needs something to send', () => {
    expect(() => buildMessage(makeAs(IDS.kofi), { farmerId: IDS.ama, senderId: IDS.kofi, from: 'staff', text: '   ' })).toThrow();
  });
});
