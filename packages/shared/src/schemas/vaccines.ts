import { z } from 'zod';
import { count, date, pesewas, positivePesewas, syncColumns, timestamp, uuid } from './fields.js';

/**
 * A vaccination round (1 to 3). Round 1 is free.
 * `price_per_dose` is filled by the server from Settings when the round first
 * syncs (vets never see prices), so it is null until then.
 */
export const vaccinationRoundSchema = z
  .object({
    ...syncColumns,
    number: z.int().min(1).max(3),
    date,
    is_free: z.boolean(),
    price_per_dose: pesewas.nullable(),
  })
  .refine((r) => !r.is_free || r.price_per_dose === null || r.price_per_dose === 0, {
    message: 'A free round has no price per dose',
    path: ['price_per_dose'],
  });
export type VaccinationRound = z.infer<typeof vaccinationRoundSchema>;

/**
 * Doses given at one farm in one round (one dose per bird). Saving one also
 * writes a VaccineStockEntry (used), the farm ColdChainReading and an SMS
 * receipt in the same transaction. No money here: that is VaccinePayment.
 */
export const vaccinationSchema = z.object({
  ...syncColumns,
  farmer_id: uuid,
  round_id: uuid,
  vet_id: uuid,
  batch_id: uuid,
  birds_vaccinated: count,
  farm_reading_id: uuid.nullable(),
  vaccinated_at: timestamp,
});
export type Vaccination = z.infer<typeof vaccinationSchema>;

export const vaccineBatchSchema = z.object({
  ...syncColumns,
  batch_no: z.string().trim().min(1).max(60),
  vaccine_name: z.string().trim().min(1).max(100),
  expiry_on: date,
  received_at: timestamp,
});
export type VaccineBatch = z.infer<typeof vaccineBatchSchema>;

export const STOCK_REASONS = ['received', 'used', 'wasted', 'adjustment'] as const;

/** Doses in or out of stock. Append only. Doses left is the sum of `doses`. */
export const vaccineStockEntrySchema = z
  .object({
    ...syncColumns,
    batch_id: uuid,
    doses: z.int().refine((n) => n !== 0, 'Doses cannot be 0'),
    reason: z.enum(STOCK_REASONS),
    source_type: z.enum(['vaccination', 'cold_chain_reading']).nullable(),
    source_id: uuid.nullable(),
  })
  .refine((s) => s.reason === 'adjustment' || (s.reason === 'received' ? s.doses > 0 : s.doses < 0), {
    message: 'Received doses are added; used and wasted doses are taken away',
    path: ['doses'],
  })
  .refine((s) => s.reason !== 'used' || (s.source_type === 'vaccination' && s.source_id !== null), {
    message: 'Used doses must point at the vaccination',
    path: ['source_id'],
  });
export type VaccineStockEntry = z.infer<typeof vaccineStockEntrySchema>;

export const READING_PLACES = ['pickup', 'storage', 'farm'] as const;

/**
 * A cold-box temperature. Append only. Outside the Settings range (2 to 8°C)
 * the vet app shows red at once; the server alerts Gloria when it syncs.
 */
export const coldChainReadingSchema = z
  .object({
    ...syncColumns,
    temp_c: z.number().min(-30).max(60),
    place: z.enum(READING_PLACES),
    farmer_id: uuid.nullable(),
    round_id: uuid.nullable(),
    read_at: timestamp,
  })
  .refine((r) => (r.place === 'farm') === (r.farmer_id !== null), {
    message: 'Farm readings name the farm; other readings do not',
    path: ['farmer_id'],
  });
export type ColdChainReading = z.infer<typeof coldChainReadingSchema>;

/**
 * A farmer paying for doses in a paid round. Recorded by operations, never by
 * vets. Writes a vaccine-fund LedgerEntry (+) and an SMS receipt. Append only.
 */
export const vaccinePaymentSchema = z.object({
  ...syncColumns,
  farmer_id: uuid,
  round_id: uuid,
  amount: positivePesewas,
  paid_at: timestamp,
});
export type VaccinePayment = z.infer<typeof vaccinePaymentSchema>;
