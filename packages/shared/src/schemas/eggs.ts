import { z } from 'zod';
import { date, ghanaPhone, pesewas, positiveCount, positivePesewas, syncColumns, timestamp, uuid } from './fields.js';

/**
 * Eggs bought from a farmer. Saving one also writes an egg-fund LedgerEntry (−)
 * and an SmsOutbox receipt in the same transaction.
 * `price_per_crate` is copied from Settings when the collection is made.
 */
export const collectionSchema = z
  .object({
    ...syncColumns,
    farmer_id: uuid,
    collected_at: timestamp,
    crates: positiveCount,
    price_per_crate: positivePesewas,
    amount_paid: pesewas,
    receipt_sms_id: uuid.nullable(),
  })
  .refine((c) => c.amount_paid === c.crates * c.price_per_crate, {
    message: 'Amount paid must be crates × price per crate',
    path: ['amount_paid'],
  });
export type Collection = z.infer<typeof collectionSchema>;

export const BUYER_TYPES = ['wholesaler', 'hotel', 'school'] as const;

export const buyerSchema = z.object({
  ...syncColumns,
  name: z.string().trim().min(1).max(100),
  type: z.enum(BUYER_TYPES),
  phone: ghanaPhone.nullable(),
  location: z.string().trim().max(200).nullable(),
});
export type Buyer = z.infer<typeof buyerSchema>;

/**
 * Eggs sold in Wa. Total = crates × price_per_crate. What was received and
 * what is owed are calculated from SalePayment rows, never stored.
 */
export const saleSchema = z.object({
  ...syncColumns,
  buyer_id: uuid,
  sold_at: timestamp,
  crates: positiveCount,
  price_per_crate: positivePesewas,
  /** When an owed amount should be paid. Null when paid in full at the sale. */
  due_on: date.nullable(),
});
export type Sale = z.infer<typeof saleSchema>;

/** Append only. Each one writes an egg-fund LedgerEntry (+) in the same transaction. */
export const salePaymentSchema = z.object({
  ...syncColumns,
  sale_id: uuid,
  amount: positivePesewas,
  received_at: timestamp,
});
export type SalePayment = z.infer<typeof salePaymentSchema>;
