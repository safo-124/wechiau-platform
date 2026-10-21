/**
 * The dashboard API (admins only): what each page reads, and the changes it
 * can make. Every change goes through the same permission checks and change
 * log as a phone's sync push, so phones receive it at their next sync.
 */
import { z } from 'zod';
import type { MonthlyFigures } from './domain/report.js';
import type { Pesewas } from './money.js';
import type { Role } from './roles.js';
import { date, ghanaPhone, positivePesewas, signedPesewas, uuid } from './schemas/fields.js';
import { FUNDS } from './schemas/ledger.js';
import { USER_STATUSES } from './schemas/people.js';
import { REPORT_STATUSES } from './schemas/system.js';
import { settingValueSchemas, type SettingValues } from './settings.js';

export type DashboardTone = 'problem' | 'comingUp' | 'good' | 'money' | 'neutral';

export interface AttentionItem {
  tone: DashboardTone;
  text: string;
  /** Which page to open: 'farmers', 'health', 'money'. */
  page: 'farmers' | 'health' | 'money';
}

export interface OverviewPage {
  month: string;
  /** When the server last received a change from anyone. */
  lastChangeAt: string | null;
  farmers: { enrolled: number; target: number };
  crates: { bought: number; sold: number; inStore: number };
  margin: { pesewas: Pesewas; perCrate: Pesewas | null; cratesSold: number };
  fund: { cash: Pesewas; owedByBuyers: Pesewas; nextDue: string | null };
  doses: { left: number; received: number; round: { number: number; done: number; total: number } | null };
  cases: { open: number; urgent: number };
  weeklyCrates: { label: string; crates: number }[];
  attention: AttentionItem[];
}

export interface FarmerRowView {
  id: string;
  name: string;
  language: string | null;
  phone: string | null;
  verified: number | null;
  reported: number | null;
  vetId: string | null;
  digitalAddress: string | null;
  landmark: string | null;
  monthCrates: number;
  monthPaid: Pesewas;
  tag: { label: string; tone: DashboardTone };
}

export interface VetView {
  id: string;
  name: string;
  farmers: number;
  openCases: number;
  lastSeen: string | null;
}

export interface FarmersPage {
  farmers: FarmerRowView[];
  vets: VetView[];
}

export interface CaseView {
  id: string;
  farmerName: string;
  summary: string;
  channel: string | null;
  vetName: string | null;
  triage: string | null;
  triageSuggested: string | null;
  status: string | null;
  createdAt: string;
  followUpOn: string | null;
}

export interface RoundView {
  id: string;
  number: number;
  date: string | null;
  isFree: boolean;
  pricePerDose: Pesewas | null;
  done: number;
  total: number;
  doses: number;
  /** Birds found dead on visits from this round's date until the next round (v0.3 phase 4: deaths per round). */
  deaths: number;
}

/** One line of the vaccine stock history: doses in or out, newest first. */
export interface StockEntryView {
  id: string;
  at: string;
  batchNo: string;
  vaccineName: string;
  reason: string;
  doses: number;
  by: string | null;
  /** For doses used: the farm vaccinated. */
  farmerName: string | null;
}

export interface ReadingView {
  id: string;
  tempC: number;
  safe: boolean;
  where: string;
  vetName: string | null;
  readAt: string;
}

export interface HealthPage {
  cases: CaseView[];
  vets: VetView[];
  rounds: RoundView[];
  readings: ReadingView[];
  stock: { left: number; received: number; alertBelow: number };
  stockHistory: StockEntryView[];
}

export interface LedgerRowView {
  id: string;
  at: string;
  fund: string;
  /** collection, sale_payment, grant, adjustment, vaccine_payment, vaccine_purchase. */
  source: string;
  entry: string;
  amount: Pesewas;
  /** The egg fund's balance after this entry (egg fund entries only). */
  balance: Pesewas | null;
  by: string | null;
  /** The farmer, for collections and their corrections (filter by farmer). */
  farmerId: string | null;
  farmerName: string | null;
}

export interface BuyerView {
  id: string;
  name: string;
  type: string | null;
  phone: string | null;
  crates: number;
  owed: Pesewas;
  owedSaleId: string | null;
  dueOn: string | null;
}

export interface PersonCashView {
  id: string;
  name: string;
  role: Role;
  cash: Pesewas;
  lastCount: { at: string; expected: Pesewas; counted: Pesewas } | null;
}

export interface MoneyPage {
  from: string;
  to: string;
  summary: { cash: Pesewas; started: Pesewas; owed: Pesewas; inStore: number; inStoreWorth: Pesewas; margin: Pesewas; cratesSold: number };
  ledger: LedgerRowView[];
  buyers: BuyerView[];
  people: PersonCashView[];
}

export interface ReportView {
  id: string;
  status: (typeof REPORT_STATUSES)[number];
  /** The server's draft from the figures (AI-written from R3). */
  draftText: string;
  /** Gloria's edited text, once she has saved or approved it. */
  finalText: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

/** The monthly report for funders (v0.3 phase 5). Figures are worked out live; only the text is stored. */
export interface ReportPage {
  figures: MonthlyFigures;
  report: ReportView | null;
}

export interface UserView {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  status: (typeof USER_STATUSES)[number];
  hasPassword: boolean;
  lastSeen: string | null;
  /** For farmers' logins: their farmer profile. */
  farmerId: string | null;
}

export interface SettingsPage {
  values: SettingValues;
  /** Staff and farmers' logins. */
  users: UserView[];
  /** Registered farmers with no farmer app login yet, for "Invite a person › Farmer". */
  farmersWithoutLogin: { id: string; name: string; phone: string }[];
}

// ── Changes ────────────────────────────────────────────────────────────

export const assignVetRequestSchema = z.object({ vet_id: uuid });
export type AssignVetRequest = z.infer<typeof assignVetRequestSchema>;

export const scheduleRoundRequestSchema = z.object({
  number: z.int().min(1).max(3),
  date,
  is_free: z.boolean(),
});
export type ScheduleRoundRequest = z.infer<typeof scheduleRoundRequestSchema>;

export const settingsUpdateSchema = z.object(settingValueSchemas).partial();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

/**
 * Staff the admin adds with a name, phone and password. Farmers' logins are
 * made from their farmer profile instead, with a PIN (POST /api/farmers/<id>/app-access).
 */
export const STAFF_ROLES_FOR_INVITE = ['admin', 'field_agent', 'vet'] as const;

export const inviteUserRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().min(1).max(30),
  email: z.email().nullable(),
  role: z.enum(STAFF_ROLES_FOR_INVITE),
});
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;

export const updateUserRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: ghanaPhone.optional(),
  email: z.email().nullable().optional(),
  role: z.enum(STAFF_ROLES_FOR_INVITE).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const PASSWORD_MIN_LENGTH = 8;
export const setPasswordRequestSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200),
});
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

/**
 * Money the admin adds to the ledger by hand: a grant into a fund (the money
 * it starts with, or more later), or a correction with a reason. Entries are
 * never edited; a mistake in one of these is fixed with another correction.
 */
export const ledgerRecordRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('grant'),
    fund: z.enum(FUNDS),
    amount: positivePesewas,
    note: z.string().trim().max(300).nullable(),
  }),
  z.object({
    kind: z.literal('adjustment'),
    fund: z.enum(FUNDS),
    amount: signedPesewas,
    note: z.string().trim().min(3, 'Say what the correction is for').max(300),
  }),
]);
export type LedgerRecordRequest = z.infer<typeof ledgerRecordRequestSchema>;

/** Cash moving between the admin and a field agent. The fund total doesn't change. */
export const handoverRequestSchema = z
  .object({ from_user_id: uuid, to_user_id: uuid, amount: positivePesewas })
  .refine((h) => h.from_user_id !== h.to_user_id, { message: 'Choose two different people', path: ['to_user_id'] });
export type HandoverRequest = z.infer<typeof handoverRequestSchema>;

// ── Messages between farmers and the vet team (Health › Messages) ───────

export interface ConversationSummary {
  farmerId: string;
  farmerName: string;
  /** The farmer's own vet, if they have one. */
  vetName: string | null;
  lastAt: string;
  lastDirection: 'from_farmer' | 'to_farmer';
  /** "Voice 0:12", or the start of the text. */
  lastPreview: string;
  fromFarmer: number;
  openCase: boolean;
}

export interface MessageView {
  id: string;
  at: string;
  direction: 'from_farmer' | 'to_farmer';
  kind: 'voice' | 'text' | 'notice';
  body: string | null;
  /** Upload ids, played and shown from /api/uploads/<id>. */
  audioId: string | null;
  audioSeconds: number | null;
  photoId: string | null;
  transcript: string | null;
  senderName: string;
  caseId: string | null;
}

export interface ConversationPage {
  farmer: { id: string; name: string; phone: string; language: string | null };
  vetName: string | null;
  messages: MessageView[];
}

/** A written reply from the admin to a farmer. It reaches the farmer app at its next sync. */
export const replyRequestSchema = z.object({ body: z.string().trim().min(1, 'Write the reply first').max(2000) });
export type ReplyRequest = z.infer<typeof replyRequestSchema>;

/** Gloria's text for the month's funder summary, when she saves or approves it. */
export const reportTextRequestSchema = z.object({
  final_text: z.string().trim().min(1, 'Write the summary first').max(20000),
});
export type ReportTextRequest = z.infer<typeof reportTextRequestSchema>;

export const reminderResponseSchema = z.object({ to: z.string(), body: z.string() });
export type ReminderResponse = z.infer<typeof reminderResponseSchema>;
