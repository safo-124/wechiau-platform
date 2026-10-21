import { z } from 'zod';
import { DIGITAL_ADDRESS_PATTERN, GHANA_PHONE_PATTERN } from '../contact.js';

/** UTC timestamp as ISO 8601 with a Z, for example 2026-10-20T09:30:00.000Z. */
export const timestamp = z.iso.datetime();
/** Calendar date, for example 2026-10-24. */
export const date = z.iso.date();
export const uuid = z.uuid();

/** Whole pesewas, 0 or more. */
export const pesewas = z.int().nonnegative();
/** Whole pesewas, more than 0. */
export const positivePesewas = z.int().positive();
/** Whole pesewas, plus or minus, never 0 (ledger entries). */
export const signedPesewas = z.int().refine((n) => n !== 0, 'Amount cannot be 0');

export const count = z.int().nonnegative();
export const positiveCount = z.int().positive();

export const ghanaPhone = z.string().regex(GHANA_PHONE_PATTERN, 'Phone must look like +233241234567');
export const digitalAddress = z.string().regex(DIGITAL_ADDRESS_PATTERN, 'Digital address must look like XX-000-0001');

/** ISO 639-3 codes: Dagaare, Waale (Wali), English. */
export const LANGUAGES = ['dga', 'wlx', 'eng'] as const;
export const language = z.enum(LANGUAGES);
export type Language = z.infer<typeof language>;

/**
 * Columns on every synced table (v0.3 section 6, plus `recorded_by` from the addendum).
 * `recorded_by` is the user who created the row. It is null only on rows the
 * server creates itself (voice line, scheduler).
 */
export const syncColumns = {
  id: uuid,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: timestamp.nullable(),
  device_id: z.string().min(1).max(100),
  recorded_by: uuid.nullable(),
};

export const SYNC_COLUMN_NAMES = Object.keys(syncColumns) as (keyof typeof syncColumns)[];
