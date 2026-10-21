import { z } from 'zod';
import { uploadRefColumn } from '../uploads.js';
import { date, syncColumns, timestamp, uuid } from './fields.js';

export const TRIAGE_LEVELS = ['low', 'medium', 'urgent'] as const;
export type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export const CASE_CHANNELS = ['app', 'voice', 'visit'] as const;
export const CASE_STATUSES = ['open', 'closed'] as const;

/**
 * The clinical record for a problem. The conversation (including the
 * farmer's voice report) is in Message.
 *
 * AI is advisory: `triage_suggested` comes from the AI step on the server;
 * `triage` is set only when a vet confirms or changes it.
 */
export const healthCaseSchema = z
  .object({
    ...syncColumns,
    farmer_id: uuid,
    channel: z.enum(CASE_CHANNELS),
    triage_suggested: z.enum(TRIAGE_LEVELS).nullable(),
    triage: z.enum(TRIAGE_LEVELS).nullable(),
    triage_confirmed_by: uuid.nullable(),
    assigned_vet_id: uuid.nullable(),
    status: z.enum(CASE_STATUSES),
    diagnosis: z.string().trim().max(500).nullable(),
    treatment: z.string().trim().max(2000).nullable(),
    follow_up_on: date.nullable(),
    closed_at: timestamp.nullable(),
  })
  .refine((c) => (c.triage === null) === (c.triage_confirmed_by === null), {
    message: 'A confirmed urgency records which vet confirmed it',
    path: ['triage_confirmed_by'],
  })
  .refine((c) => (c.status === 'closed') === (c.closed_at !== null), {
    message: 'Closed cases record when they were closed',
    path: ['closed_at'],
  })
  .refine((c) => c.status !== 'closed' || c.triage !== null, {
    message: 'A vet must confirm the urgency before closing a case',
    path: ['triage'],
  });
export type HealthCase = z.infer<typeof healthCaseSchema>;

export const CASE_NOTE_KINDS = ['triage', 'diagnosis', 'treatment', 'note', 'handover', 'closed', 'reopened'] as const;
export type CaseNoteKind = (typeof CASE_NOTE_KINDS)[number];

/**
 * The history of a case, one entry per decision, by the vet who made it.
 * Append only, so when two vets work the same case offline, nothing either of
 * them wrote is lost (v0.3 section 7: case notes never conflict). The
 * HealthCase row holds the current state; these notes hold how it got there.
 */
export const caseNoteSchema = z.object({
  ...syncColumns,
  health_case_id: uuid,
  kind: z.enum(CASE_NOTE_KINDS),
  body: z.string().trim().min(1).max(2000),
});
export type CaseNote = z.infer<typeof caseNoteSchema>;

export const MESSAGE_DIRECTIONS = ['from_farmer', 'to_farmer'] as const;
export const MESSAGE_KINDS = ['voice', 'text', 'notice'] as const;
export const MESSAGE_DELIVERY = ['app', 'sms', 'call'] as const;

/**
 * One conversation per farmer with the vet team. Append only.
 * All voice audio lives here, so consent and deletion apply in one place.
 * The server fills `transcript` and `translation` after sync.
 */
export const messageSchema = z
  .object({
    ...syncColumns,
    farmer_id: uuid,
    health_case_id: uuid.nullable(),
    direction: z.enum(MESSAGE_DIRECTIONS),
    /** Null for automatic messages (reminders) and voice-line calls. */
    sender_id: uuid.nullable(),
    kind: z.enum(MESSAGE_KINDS),
    body: z.string().trim().max(2000).nullable(),
    /** "upload:<id>": the voice note goes up separately once the message has synced. */
    audio_uri: uploadRefColumn('Voice audio'),
    audio_seconds: z.int().positive().max(600).nullable(),
    transcript: z.string().max(5000).nullable(),
    translation: z.string().max(5000).nullable(),
    delivery: z.enum(MESSAGE_DELIVERY),
    /** An optional photo with the message ("Add photo" on Report a problem). */
    photo_uri: uploadRefColumn('A photo'),
  })
  .refine((m) => (m.kind === 'voice') === (m.audio_uri !== null), {
    message: 'Voice messages have audio; other messages do not',
    path: ['audio_uri'],
  })
  .refine((m) => m.kind === 'voice' || (m.body !== null && m.body.length > 0), {
    message: 'Text and notice messages need a body',
    path: ['body'],
  });
export type Message = z.infer<typeof messageSchema>;
