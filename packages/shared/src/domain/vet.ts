/**
 * The vet app's rules (v0.3 Phase 3; addendum sections 4 and 5), as plain
 * logic tested in Node. Several vets share the work: each farmer has a vet
 * (their latest assignment), but any vet can see and help with any farm.
 */
import type { TriageLevel } from '../schemas/health.js';
import type { RecordRow, RowEditor, RowFactory } from './eggs.js';

interface Deletable {
  deleted_at?: string | null;
}

// ── Who looks after whom ───────────────────────────────────────────────

interface AssignmentLike extends Deletable {
  farmer_id: string | null;
  vet_id: string | null;
  assigned_at: string | null;
}

/** Each farmer's vet now: the latest assignment wins. */
export function currentVets(assignments: readonly AssignmentLike[]): Map<string, string> {
  const latest = new Map<string, AssignmentLike>();
  for (const a of assignments) {
    if (a.deleted_at || !a.farmer_id || !a.vet_id) continue;
    const seen = latest.get(a.farmer_id);
    if (!seen || (a.assigned_at ?? '') > (seen.assigned_at ?? '')) latest.set(a.farmer_id, a);
  }
  return new Map([...latest].map(([farmerId, a]) => [farmerId, a.vet_id!]));
}

// ── Vaccination rounds ─────────────────────────────────────────────────

interface VaccinationLike extends Deletable {
  farmer_id: string | null;
  round_id: string | null;
  vet_id: string | null;
  birds_vaccinated: number | null;
  vaccinated_at: string | null;
}

export interface FarmInRound {
  farmerId: string;
  vetId: string | null;
  done: { birds: number; byVet: string | null; at: string | null } | null;
}

/** Every active farm in a round, whether it's done, and whose it is. */
export function farmsInRound(
  farmers: readonly ({ id: string; status: string | null } & Deletable)[],
  vaccinations: readonly VaccinationLike[],
  vets: Map<string, string>,
  roundId: string,
): FarmInRound[] {
  const done = new Map<string, VaccinationLike>();
  for (const v of vaccinations) if (!v.deleted_at && v.round_id === roundId && v.farmer_id) done.set(v.farmer_id, v);
  return farmers
    .filter((f) => !f.deleted_at && f.status !== 'inactive')
    .map((f) => {
      const v = done.get(f.id);
      return {
        farmerId: f.id,
        vetId: vets.get(f.id) ?? null,
        done: v ? { birds: v.birds_vaccinated ?? 0, byVet: v.vet_id, at: v.vaccinated_at } : null,
      };
    });
}

// ── Stock and cold chain ───────────────────────────────────────────────

interface StockLike extends Deletable {
  batch_id: string | null;
  doses: number | null;
}

/** Doses left, in all and per batch. Never stored: the sum of stock entries. */
export function dosesLeft(entries: readonly StockLike[]): { total: number; byBatch: Map<string, number> } {
  const byBatch = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    if (e.deleted_at || !e.batch_id) continue;
    byBatch.set(e.batch_id, (byBatch.get(e.batch_id) ?? 0) + (e.doses ?? 0));
    total += e.doses ?? 0;
  }
  return { total, byBatch };
}

interface ReadingLike extends Deletable {
  temp_c: number | null;
  read_at: string | null;
  recorded_by: string | null;
}

/** A vet's own latest cold-box reading: each vet carries their own box. */
export function latestReading<T extends ReadingLike>(readings: readonly T[], vetId: string): T | null {
  let latest: T | null = null;
  for (const r of readings) {
    if (r.deleted_at || r.recorded_by !== vetId) continue;
    if (!latest || (r.read_at ?? '') > (latest.read_at ?? '')) latest = r;
  }
  return latest;
}

// ── Cases ──────────────────────────────────────────────────────────────

interface CaseLike extends Deletable {
  status: string | null;
  triage: string | null;
  triage_suggested: string | null;
  created_at: string;
}

const URGENCY_ORDER: Record<string, number> = { urgent: 0, medium: 1, low: 2 };

/** The urgency to sort and show by: the vet's, or else the AI's suggestion. */
export function caseUrgency(c: Pick<CaseLike, 'triage' | 'triage_suggested'>): TriageLevel | null {
  return (c.triage ?? c.triage_suggested ?? null) as TriageLevel | null;
}

/** Open before closed; most urgent first (unknown urgency with the urgent ones, to be looked at); then oldest first. */
export function sortCases<T extends CaseLike>(cases: readonly T[]): T[] {
  const rank = (c: T) => {
    const urgency = caseUrgency(c);
    return urgency === null ? 0.5 : URGENCY_ORDER[urgency]!;
  };
  return [...cases]
    .filter((c) => !c.deleted_at)
    .sort((a, b) => {
      const open = Number(b.status === 'open') - Number(a.status === 'open');
      if (open !== 0) return open;
      if (a.status === 'closed') return b.created_at.localeCompare(a.created_at);
      return rank(a) - rank(b) || a.created_at.localeCompare(b.created_at);
    });
}

export const TRIAGE_LABELS: Record<TriageLevel, string> = { urgent: 'Urgent', medium: 'Medium', low: 'Low' };

export interface CaseDecision {
  triage?: TriageLevel;
  diagnosis?: string | null;
  treatment?: string | null;
  followUpOn?: string | null;
  assignTo?: { id: string; name: string };
  close?: boolean;
  reopen?: boolean;
  note?: string;
}

/**
 * A vet's decision on a case: the case row is updated, and every decision is
 * also written as a case note (append only), so two vets working the same
 * case never lose each other's notes. Returns null when nothing changes.
 */
export function buildCaseDecision(
  make: RowFactory,
  edit: RowEditor,
  input: { healthCase: RecordRow; vetId: string; decision: CaseDecision; now: string },
): { healthCase: RecordRow; notes: RecordRow[] } | null {
  const { healthCase: current, decision, vetId, now } = input;
  const changes: Record<string, unknown> = {};
  const notes: RecordRow[] = [];
  const note = (kind: string, body: string) => notes.push(make({ health_case_id: current.id, kind, body }));

  if (decision.triage && decision.triage !== current['triage']) {
    changes['triage'] = decision.triage;
    changes['triage_confirmed_by'] = vetId;
    const suggested = current['triage_suggested'] as TriageLevel | null;
    const ai = suggested && suggested !== decision.triage ? ` (AI suggested ${TRIAGE_LABELS[suggested].toLowerCase()})` : '';
    note('triage', `Urgency: ${TRIAGE_LABELS[decision.triage]}${ai}`);
  }
  if (decision.diagnosis !== undefined && (decision.diagnosis || null) !== (current['diagnosis'] ?? null)) {
    changes['diagnosis'] = decision.diagnosis || null;
    if (decision.diagnosis) note('diagnosis', decision.diagnosis);
  }
  if (decision.treatment !== undefined && (decision.treatment || null) !== (current['treatment'] ?? null)) {
    changes['treatment'] = decision.treatment || null;
    if (decision.treatment) note('treatment', decision.treatment);
  }
  if (decision.followUpOn !== undefined && decision.followUpOn !== (current['follow_up_on'] ?? null)) {
    changes['follow_up_on'] = decision.followUpOn;
    if (decision.followUpOn) note('note', `Follow up on ${decision.followUpOn}`);
  }
  if (decision.assignTo && decision.assignTo.id !== current['assigned_vet_id']) {
    changes['assigned_vet_id'] = decision.assignTo.id;
    note('handover', `Handed to ${decision.assignTo.name}`);
  }
  if (decision.close && current['status'] !== 'closed') {
    changes['status'] = 'closed';
    changes['closed_at'] = now;
    note('closed', 'Case closed');
  }
  if (decision.reopen && current['status'] === 'closed') {
    changes['status'] = 'open';
    changes['closed_at'] = null;
    note('reopened', 'Case opened again');
  }
  if (decision.note?.trim()) note('note', decision.note.trim());

  if (notes.length === 0 && Object.keys(changes).length === 0) return null;
  return { healthCase: Object.keys(changes).length ? edit(current, changes) : current, notes };
}

/** A case a vet opens on a visit (channel "visit"); it goes to the farmer's vet, or the vet who opened it. */
export function buildCaseFromVisit(
  make: RowFactory,
  input: { farmerId: string; vetId: string; farmersVet: string | null; triage: TriageLevel; problem: string },
): { healthCase: RecordRow; notes: RecordRow[] } {
  const healthCase = make({
    farmer_id: input.farmerId,
    channel: 'visit',
    triage_suggested: null,
    triage: input.triage,
    triage_confirmed_by: input.vetId,
    assigned_vet_id: input.farmersVet ?? input.vetId,
    status: 'open',
    diagnosis: null,
    treatment: null,
    follow_up_on: null,
    closed_at: null,
  });
  const notes = [
    make({ health_case_id: healthCase.id, kind: 'note', body: input.problem.trim() }),
    make({ health_case_id: healthCase.id, kind: 'triage', body: `Urgency: ${TRIAGE_LABELS[input.triage]}` }),
  ];
  return { healthCase, notes };
}

// ── Vaccinating a farm ─────────────────────────────────────────────────

export function vaccinationReceipt(birds: number, roundNumber: number, isFree: boolean): string {
  return `Wechiau Poultry: ${birds} of your birds were vaccinated today (round ${roundNumber}${isFree ? ', free' : ''}). Thank you.`;
}

/**
 * Doses given at one farm (addendum section 5, rule 3): the cold-box reading at
 * the farm, the vaccination, the doses out of stock, and the farmer's receipt,
 * saved together. No money here: payment is recorded by operations.
 */
export function buildVaccination(
  make: RowFactory,
  input: {
    farmerId: string;
    farmerPhone: string | null;
    roundId: string;
    roundNumber: number;
    isFree: boolean;
    vetId: string;
    batchId: string;
    birds: number;
    tempC: number;
    now: string;
  },
): { reading: RecordRow; vaccination: RecordRow; used: RecordRow; sms: RecordRow | null } {
  const reading = make({
    temp_c: input.tempC,
    place: 'farm',
    farmer_id: input.farmerId,
    round_id: input.roundId,
    read_at: input.now,
  });
  const vaccination = make({
    farmer_id: input.farmerId,
    round_id: input.roundId,
    vet_id: input.vetId,
    batch_id: input.batchId,
    birds_vaccinated: input.birds,
    farm_reading_id: reading.id,
    vaccinated_at: input.now,
  });
  const used = make({
    batch_id: input.batchId,
    doses: -input.birds,
    reason: 'used',
    source_type: 'vaccination',
    source_id: vaccination.id,
  });
  const sms = input.farmerPhone
    ? make({ to_phone: input.farmerPhone, body: vaccinationReceipt(input.birds, input.roundNumber, input.isFree), status: 'queued', attempts: 0 })
    : null;
  return { reading, vaccination, used, sms };
}
