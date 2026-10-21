import type { TableName } from '@wechiau/shared';

/** The Prisma client property for each synced table. */
const DELEGATES: Record<TableName, string> = {
  user: 'user',
  farmer: 'farmer',
  vet_assignment: 'vetAssignment',
  visit: 'visit',
  bird_count: 'birdCount',
  collection: 'collection',
  buyer: 'buyer',
  sale: 'sale',
  sale_payment: 'salePayment',
  ledger_entry: 'ledgerEntry',
  cash_handover: 'cashHandover',
  cash_count: 'cashCount',
  vaccination_round: 'vaccinationRound',
  vaccination: 'vaccination',
  vaccine_batch: 'vaccineBatch',
  vaccine_stock_entry: 'vaccineStockEntry',
  cold_chain_reading: 'coldChainReading',
  vaccine_payment: 'vaccinePayment',
  health_case: 'healthCase',
  case_note: 'caseNote',
  message: 'message',
  sms_outbox: 'smsOutbox',
  setting: 'setting',
  monthly_report: 'monthlyReport',
};

export type DbRow = Record<string, unknown>;

/** The few Prisma model methods the sync code needs, the same for every table. */
export interface TableDelegate {
  findUnique(args: { where: { id: string } }): Promise<DbRow | null>;
  findMany(args?: { where?: Record<string, unknown> }): Promise<DbRow[]>;
  upsert(args: { where: { id: string }; create: DbRow; update: DbRow }): Promise<DbRow>;
}

/** Works with the main client or a transaction client. */
export function tableDelegate(client: object, table: TableName): TableDelegate {
  return (client as Record<string, TableDelegate>)[DELEGATES[table]]!;
}
