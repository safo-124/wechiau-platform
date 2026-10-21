import type { z } from 'zod';
import { birdCountSchema, visitSchema } from './farm.js';
import { buyerSchema, collectionSchema, salePaymentSchema, saleSchema } from './eggs.js';
import { caseNoteSchema, healthCaseSchema, messageSchema } from './health.js';
import { cashCountSchema, cashHandoverSchema, ledgerEntrySchema } from './ledger.js';
import { farmerSchema, userSchema, vetAssignmentSchema } from './people.js';
import { monthlyReportSchema, settingSchema, smsOutboxSchema } from './system.js';
import {
  coldChainReadingSchema,
  vaccinationRoundSchema,
  vaccinationSchema,
  vaccineBatchSchema,
  vaccinePaymentSchema,
  vaccineStockEntrySchema,
} from './vaccines.js';

export * from './fields.js';
export * from './farm.js';
export * from './eggs.js';
export * from './health.js';
export * from './ledger.js';
export * from './people.js';
export * from './system.js';
export * from './vaccines.js';

/** Every table, by the name used in the database, the sync API and the permissions map. */
export const tableSchemas = {
  user: userSchema,
  farmer: farmerSchema,
  vet_assignment: vetAssignmentSchema,
  visit: visitSchema,
  bird_count: birdCountSchema,
  collection: collectionSchema,
  buyer: buyerSchema,
  sale: saleSchema,
  sale_payment: salePaymentSchema,
  ledger_entry: ledgerEntrySchema,
  cash_handover: cashHandoverSchema,
  cash_count: cashCountSchema,
  vaccination_round: vaccinationRoundSchema,
  vaccination: vaccinationSchema,
  vaccine_batch: vaccineBatchSchema,
  vaccine_stock_entry: vaccineStockEntrySchema,
  cold_chain_reading: coldChainReadingSchema,
  vaccine_payment: vaccinePaymentSchema,
  health_case: healthCaseSchema,
  case_note: caseNoteSchema,
  message: messageSchema,
  sms_outbox: smsOutboxSchema,
  setting: settingSchema,
  monthly_report: monthlyReportSchema,
} as const;

export type TableName = keyof typeof tableSchemas;
export const TABLES = Object.keys(tableSchemas) as TableName[];
export type TableRow<T extends TableName> = z.infer<(typeof tableSchemas)[T]>;

export function isTableName(value: string): value is TableName {
  return Object.hasOwn(tableSchemas, value);
}

/**
 * Column naming rule, checked by a test: `*_at` columns are timestamps,
 * `*_on` columns and `date` are calendar dates. Used to convert values
 * between JSON (strings) and databases.
 */
export function timestampColumns(table: TableName): string[] {
  return Object.keys(tableSchemas[table].shape).filter((column) => column.endsWith('_at'));
}

export function dateColumns(table: TableName): string[] {
  return Object.keys(tableSchemas[table].shape).filter((column) => column.endsWith('_on') || column === 'date');
}
