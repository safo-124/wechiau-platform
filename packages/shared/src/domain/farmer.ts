/**
 * The farmer app's rules (v0.3 phase 7; designs farmer-app/*): what a farmer
 * sees about their own farm, and the two things they send, a report of a
 * problem and a message to the vets. Plain logic, tested in Node. The phone
 * only holds this farmer's own rows (permissions map: own_farm).
 */
import { formatGhs, sumPesewas, type Pesewas } from '../money.js';
import { uploadRef } from '../uploads.js';
import type { RowFactory } from './eggs.js';

interface Deletable {
  deleted_at?: string | null;
}
interface CountLike extends Deletable {
  kind: string | null;
  count: number | null;
  counted_at: string | null;
}
interface RoundLike extends Deletable {
  id: string;
  number: number | null;
  date: string | null;
  is_free: boolean | null;
}
interface VaccinationLike extends Deletable {
  round_id: string | null;
  birds_vaccinated: number | null;
  vaccinated_at: string | null;
}
interface CollectionLike extends Deletable {
  id: string;
  collected_at: string | null;
  crates: number | null;
  amount_paid: number | null;
  price_per_crate: number | null;
}
interface VisitLike extends Deletable {
  id: string;
  visited_at: string | null;
  deaths: number | null;
}
interface CaseLike extends Deletable {
  id: string;
  channel: string | null;
  status: string | null;
  created_at: string | null;
  closed_at: string | null;
  diagnosis: string | null;
}
interface VaccinePaymentLike extends Deletable {
  id: string;
  round_id: string | null;
  amount: number | null;
  paid_at: string | null;
}
export interface MessageLike extends Deletable {
  id: string;
  created_at: string | null;
  direction: string | null;
  kind: string | null;
  body: string | null;
  audio_uri: string | null;
  audio_seconds: number | null;
  photo_uri: string | null;
  sender_id: string | null;
  health_case_id: string | null;
}

const live = <T extends Deletable>(rows: readonly T[]) => rows.filter((r) => !r.deleted_at);
const newestFirst = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── The farm at a glance (Home, My flock) ───────────────────────────────

/** The latest count: a verified one (by staff) when there is one, else what the farmer reported. */
export function currentBirds(counts: readonly CountLike[]): number | null {
  const rows = live(counts).sort((a, b) => newestFirst(a.counted_at, b.counted_at));
  return (rows.find((c) => c.kind === 'verified') ?? rows[0])?.count ?? null;
}

/** The next round from today (dates are YYYY-MM-DD in Ghana, UTC). */
export function nextRound<T extends RoundLike>(rounds: readonly T[], today: string): T | null {
  return live(rounds).filter((r) => r.date && r.date >= today).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0] ?? null;
}

/** The latest round that has started. */
export function latestRound<T extends RoundLike>(rounds: readonly T[], today: string): T | null {
  return live(rounds).filter((r) => r.date && r.date <= today).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0] ?? null;
}

export interface FlockStatus {
  birds: number | null;
  /** Birds vaccinated in the latest round that has started. */
  protected: number;
  round: RoundLike | null;
}

/** "38 of 42 birds protected" (design: farmer-app/Flock). */
export function flockStatus(input: { counts: readonly CountLike[]; rounds: readonly RoundLike[]; vaccinations: readonly VaccinationLike[] }, today: string): FlockStatus {
  const round = latestRound(input.rounds, today);
  const vaccinated = round ? live(input.vaccinations).filter((v) => v.round_id === round.id).reduce((n, v) => n + (v.birds_vaccinated ?? 0), 0) : 0;
  return { birds: currentBirds(input.counts), protected: vaccinated, round };
}

/** What the farmer was paid for eggs since a moment (the start of this month on Home and My money). */
export function paidSince(collections: readonly CollectionLike[], since: string): { paid: Pesewas; crates: number } {
  const rows = live(collections).filter((c) => (c.collected_at ?? '') >= since);
  return { paid: sumPesewas(rows.map((c) => c.amount_paid ?? 0)), crates: rows.reduce((n, c) => n + (c.crates ?? 0), 0) };
}

// ── Farm story (design: farmer-app/Timeline) ────────────────────────────

export type StoryKind = 'joined' | 'paid' | 'vaccinated' | 'visit' | 'problem' | 'problem_closed' | 'vaccine_paid';

export interface StoryEvent {
  id: string;
  at: string;
  kind: StoryKind;
  text: string;
}

/** Everything that happened on the farm, newest first, in short sentences. */
export function farmStory(input: {
  joinedAt: string | null;
  collections: readonly CollectionLike[];
  vaccinations: readonly (VaccinationLike & { id: string })[];
  rounds: readonly RoundLike[];
  visits: readonly VisitLike[];
  cases: readonly CaseLike[];
  vaccinePayments: readonly VaccinePaymentLike[];
}): StoryEvent[] {
  const roundOf = (id: string | null) => input.rounds.find((r) => r.id === id) ?? null;
  const events: StoryEvent[] = [];
  if (input.joinedAt) events.push({ id: 'joined', at: input.joinedAt, kind: 'joined', text: 'Joined Wechiau Poultry' });
  for (const c of live(input.collections)) {
    if (!c.collected_at) continue;
    events.push({ id: `c:${c.id}`, at: c.collected_at, kind: 'paid', text: `Paid ${formatGhs(c.amount_paid ?? 0)} for ${plural(c.crates ?? 0, 'crate')}` });
  }
  for (const v of live(input.vaccinations)) {
    if (!v.vaccinated_at) continue;
    const round = roundOf(v.round_id);
    const what = round ? `, round ${round.number}${round.is_free ? ', free' : ''}` : '';
    events.push({ id: `v:${v.id}`, at: v.vaccinated_at, kind: 'vaccinated', text: `${plural(v.birds_vaccinated ?? 0, 'bird')} vaccinated${what}` });
  }
  for (const v of live(input.visits)) {
    if (!v.visited_at) continue;
    const deaths = v.deaths ?? 0;
    events.push({ id: `visit:${v.id}`, at: v.visited_at, kind: 'visit', text: deaths ? `Visit from Wechiau. ${plural(deaths, 'bird')} had died.` : 'Visit from Wechiau' });
  }
  for (const c of live(input.cases)) {
    if (c.created_at) {
      events.push({ id: `p:${c.id}`, at: c.created_at, kind: 'problem', text: c.channel === 'visit' ? 'The vet found a problem on a visit' : 'You reported a problem' });
    }
    if (c.status === 'closed' && c.closed_at) {
      events.push({ id: `pc:${c.id}`, at: c.closed_at, kind: 'problem_closed', text: c.diagnosis ? `Problem closed by the vet: ${c.diagnosis}` : 'Problem closed by the vet' });
    }
  }
  for (const p of live(input.vaccinePayments)) {
    if (!p.paid_at) continue;
    const round = roundOf(p.round_id);
    events.push({ id: `vp:${p.id}`, at: p.paid_at, kind: 'vaccine_paid', text: `You paid ${formatGhs(p.amount ?? 0)} for vaccine${round ? `, round ${round.number}` : ''}` });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

// ── Messages (design: farmer-app/Chat) ──────────────────────────────────

export type ChatItem =
  | { type: 'message'; id: string; at: string; message: MessageLike }
  | { type: 'paid'; id: string; at: string; text: string; detail: string };

/**
 * The farmer's one conversation with the vet team: messages both ways, with
 * each egg payment in between as a receipt, oldest first like a chat.
 */
export function chatItems(messages: readonly MessageLike[], collections: readonly CollectionLike[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const m of live(messages)) if (m.created_at) items.push({ type: 'message', id: m.id, at: m.created_at, message: m });
  for (const c of live(collections)) {
    if (!c.collected_at) continue;
    items.push({ type: 'paid', id: `c:${c.id}`, at: c.collected_at, text: `Paid ${formatGhs(c.amount_paid ?? 0)}`, detail: `${plural(c.crates ?? 0, 'crate')} of eggs` });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Messages from the vets newer than the last time this phone showed the chat. */
export function unreadCount(messages: readonly MessageLike[], lastSeen: string | null, direction: 'to_farmer' | 'from_farmer'): number {
  return live(messages).filter((m) => m.direction === direction && (m.created_at ?? '') > (lastSeen ?? '')).length;
}

// ── What farmers and vets send ──────────────────────────────────────────

export interface MessageContent {
  /** A recorded voice note, already saved on the phone under this upload id. */
  voice?: { uploadId: string; seconds: number } | null;
  text?: string | null;
  photoUploadId?: string | null;
}

function messageFields(content: MessageContent) {
  const text = content.text?.trim() || null;
  const voice = content.voice ?? null;
  if (!voice && !text) throw new Error('Record a voice message or write something first.');
  return {
    kind: voice ? 'voice' : 'text',
    body: text,
    audio_uri: voice ? uploadRef(voice.uploadId) : null,
    audio_seconds: voice ? Math.max(1, Math.min(600, Math.round(voice.seconds))) : null,
    photo_uri: content.photoUploadId ? uploadRef(content.photoUploadId) : null,
    transcript: null,
    translation: null,
    delivery: 'app',
  };
}

/** A message in the farmer's conversation, from the farmer or from a vet (or the admin). */
export function buildMessage(
  make: RowFactory,
  input: { farmerId: string; senderId: string; from: 'farmer' | 'staff'; healthCaseId?: string | null } & MessageContent,
) {
  return make({
    farmer_id: input.farmerId,
    health_case_id: input.healthCaseId ?? null,
    direction: input.from === 'farmer' ? 'from_farmer' : 'to_farmer',
    sender_id: input.senderId,
    ...messageFields(input),
  });
}

/**
 * "Report a problem" (design: farmer-app/Report; addendum rule 3): a health
 * case and its first message, saved together. The server gives the case the
 * farmer's own vet; a vet then decides how urgent it is.
 */
export function buildFarmerReport(make: RowFactory, input: { farmerId: string; farmerUserId: string } & MessageContent) {
  const healthCase = make({
    farmer_id: input.farmerId,
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
  });
  const message = buildMessage(make, { ...input, senderId: input.farmerUserId, from: 'farmer', healthCaseId: healthCase.id });
  return { healthCase, message };
}
