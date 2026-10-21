import { z } from 'zod';
import { positivePesewas, signedPesewas, syncColumns, timestamp, uuid } from './fields.js';

export const FUNDS = ['egg', 'vaccine'] as const;
export type Fund = (typeof FUNDS)[number];

export const LEDGER_SOURCES = [
  'collection',
  'sale_payment',
  'vaccine_payment',
  'vaccine_purchase',
  'grant',
  'adjustment',
] as const;
export type LedgerSource = (typeof LEDGER_SOURCES)[number];

/** Sources that point at another row. Grants, purchases and adjustments may stand alone. */
const SOURCES_WITH_ROW: readonly LedgerSource[] = ['collection', 'sale_payment', 'vaccine_payment'];

/**
 * Money only, in pesewas. Append only: a mistake is fixed with an `adjustment`
 * entry, never by editing. Balances are sums of these rows, never stored.
 */
export const ledgerEntrySchema = z
  .object({
    ...syncColumns,
    fund: z.enum(FUNDS),
    amount: signedPesewas,
    source_type: z.enum(LEDGER_SOURCES),
    source_id: uuid.nullable(),
    note: z.string().trim().max(300).nullable(),
  })
  .refine((e) => !SOURCES_WITH_ROW.includes(e.source_type) || e.source_id !== null, {
    message: 'This entry must point at the record it came from',
    path: ['source_id'],
  })
  .refine((e) => e.source_type !== 'collection' || (e.fund === 'egg' && e.amount < 0), {
    message: 'A collection takes money out of the egg fund',
    path: ['amount'],
  })
  .refine((e) => e.source_type !== 'sale_payment' || (e.fund === 'egg' && e.amount > 0), {
    message: 'A sale payment adds money to the egg fund',
    path: ['amount'],
  })
  .refine((e) => e.source_type !== 'vaccine_payment' || (e.fund === 'vaccine' && e.amount > 0), {
    message: 'A vaccine payment adds money to the vaccine fund',
    path: ['amount'],
  });
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/**
 * A person counting the cash they hold and saying whether it matches what the
 * app expected (design: field-app/Cash, "I counted the cash"). Append only.
 * The count is of the recorder's own cash.
 */
export const cashCountSchema = z.object({
  ...syncColumns,
  /** What the app said they should have, in pesewas, when they counted. */
  expected: z.int(),
  /** What they counted. */
  counted: z.int().nonnegative(),
  note: z.string().trim().max(300).nullable(),
  counted_at: timestamp,
});
export type CashCount = z.infer<typeof cashCountSchema>;

/**
 * Cash moving between people (Gloria giving an agent cash to pay farmers, or
 * an agent handing cash back). Does not change the fund total. Append only.
 */
export const cashHandoverSchema = z
  .object({
    ...syncColumns,
    from_user_id: uuid,
    to_user_id: uuid,
    amount: positivePesewas,
    handed_at: timestamp,
  })
  .refine((h) => h.from_user_id !== h.to_user_id, {
    message: 'Cash must move between two different people',
    path: ['to_user_id'],
  });
export type CashHandover = z.infer<typeof cashHandoverSchema>;
