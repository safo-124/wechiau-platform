/**
 * The phone's own database (SQLite). Every synced table mirrors the shared
 * schema in packages/shared, column for column; a test checks they match.
 *
 * Domain columns are nullable here because some roles receive only a summary
 * of a table (for example field agents get health cases without the
 * diagnosis). Rows are validated with the shared zod schemas before saving.
 *
 * After changing this file: `npm run db:generate -w @wechiau/mobile`, then
 * raise LOCAL_SCHEMA_VERSION in src/sync/store.ts if the server's data needs
 * to be pulled again.
 */
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const sync = () => ({
  id: text('id').primaryKey(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at'),
  device_id: text('device_id').notNull(),
  recorded_by: text('recorded_by'),
});

export const user = sqliteTable('user', {
  ...sync(),
  name: text('name'),
  phone: text('phone'),
  email: text('email'),
  role: text('role'),
  farmer_id: text('farmer_id'),
  status: text('status'),
});

export const farmer = sqliteTable('farmer', {
  ...sync(),
  name: text('name'),
  phone: text('phone'),
  language: text('language'),
  lat: real('lat'),
  lng: real('lng'),
  digital_address: text('digital_address'),
  landmark: text('landmark'),
  joined_on: text('joined_on'),
  status: text('status'),
  consent_training: integer('consent_training', { mode: 'boolean' }),
  consent_recorded_at: text('consent_recorded_at'),
});

export const vet_assignment = sqliteTable('vet_assignment', {
  ...sync(),
  farmer_id: text('farmer_id'),
  vet_id: text('vet_id'),
  assigned_at: text('assigned_at'),
});

export const visit = sqliteTable('visit', {
  ...sync(),
  farmer_id: text('farmer_id'),
  visited_at: text('visited_at'),
  deaths: integer('deaths'),
  suspected_cause: text('suspected_cause'),
  notes: text('notes'),
  photo_uri: text('photo_uri'),
});

export const bird_count = sqliteTable('bird_count', {
  ...sync(),
  farmer_id: text('farmer_id'),
  count: integer('count'),
  kind: text('kind'),
  source_type: text('source_type'),
  source_id: text('source_id'),
  counted_at: text('counted_at'),
});

export const collection = sqliteTable('collection', {
  ...sync(),
  farmer_id: text('farmer_id'),
  collected_at: text('collected_at'),
  crates: integer('crates'),
  price_per_crate: integer('price_per_crate'),
  amount_paid: integer('amount_paid'),
  receipt_sms_id: text('receipt_sms_id'),
});

export const buyer = sqliteTable('buyer', {
  ...sync(),
  name: text('name'),
  type: text('type'),
  phone: text('phone'),
  location: text('location'),
});

export const sale = sqliteTable('sale', {
  ...sync(),
  buyer_id: text('buyer_id'),
  sold_at: text('sold_at'),
  crates: integer('crates'),
  price_per_crate: integer('price_per_crate'),
  due_on: text('due_on'),
});

export const sale_payment = sqliteTable('sale_payment', {
  ...sync(),
  sale_id: text('sale_id'),
  amount: integer('amount'),
  received_at: text('received_at'),
});

export const ledger_entry = sqliteTable('ledger_entry', {
  ...sync(),
  fund: text('fund'),
  amount: integer('amount'),
  source_type: text('source_type'),
  source_id: text('source_id'),
  note: text('note'),
});

export const cash_handover = sqliteTable('cash_handover', {
  ...sync(),
  from_user_id: text('from_user_id'),
  to_user_id: text('to_user_id'),
  amount: integer('amount'),
  handed_at: text('handed_at'),
});

export const cash_count = sqliteTable('cash_count', {
  ...sync(),
  expected: integer('expected'),
  counted: integer('counted'),
  note: text('note'),
  counted_at: text('counted_at'),
});

export const vaccination_round = sqliteTable('vaccination_round', {
  ...sync(),
  number: integer('number'),
  date: text('date'),
  is_free: integer('is_free', { mode: 'boolean' }),
  price_per_dose: integer('price_per_dose'),
});

export const vaccination = sqliteTable('vaccination', {
  ...sync(),
  farmer_id: text('farmer_id'),
  round_id: text('round_id'),
  vet_id: text('vet_id'),
  batch_id: text('batch_id'),
  birds_vaccinated: integer('birds_vaccinated'),
  farm_reading_id: text('farm_reading_id'),
  vaccinated_at: text('vaccinated_at'),
});

export const vaccine_batch = sqliteTable('vaccine_batch', {
  ...sync(),
  batch_no: text('batch_no'),
  vaccine_name: text('vaccine_name'),
  expiry_on: text('expiry_on'),
  received_at: text('received_at'),
});

export const vaccine_stock_entry = sqliteTable('vaccine_stock_entry', {
  ...sync(),
  batch_id: text('batch_id'),
  doses: integer('doses'),
  reason: text('reason'),
  source_type: text('source_type'),
  source_id: text('source_id'),
});

export const cold_chain_reading = sqliteTable('cold_chain_reading', {
  ...sync(),
  temp_c: real('temp_c'),
  place: text('place'),
  farmer_id: text('farmer_id'),
  round_id: text('round_id'),
  read_at: text('read_at'),
});

export const vaccine_payment = sqliteTable('vaccine_payment', {
  ...sync(),
  farmer_id: text('farmer_id'),
  round_id: text('round_id'),
  amount: integer('amount'),
  paid_at: text('paid_at'),
});

export const health_case = sqliteTable('health_case', {
  ...sync(),
  farmer_id: text('farmer_id'),
  channel: text('channel'),
  triage_suggested: text('triage_suggested'),
  triage: text('triage'),
  triage_confirmed_by: text('triage_confirmed_by'),
  assigned_vet_id: text('assigned_vet_id'),
  status: text('status'),
  diagnosis: text('diagnosis'),
  treatment: text('treatment'),
  follow_up_on: text('follow_up_on'),
  closed_at: text('closed_at'),
});

export const case_note = sqliteTable('case_note', {
  ...sync(),
  health_case_id: text('health_case_id'),
  kind: text('kind'),
  body: text('body'),
});

export const message = sqliteTable('message', {
  ...sync(),
  farmer_id: text('farmer_id'),
  health_case_id: text('health_case_id'),
  direction: text('direction'),
  sender_id: text('sender_id'),
  kind: text('kind'),
  body: text('body'),
  audio_uri: text('audio_uri'),
  audio_seconds: integer('audio_seconds'),
  transcript: text('transcript'),
  translation: text('translation'),
  delivery: text('delivery'),
  photo_uri: text('photo_uri'),
});

export const sms_outbox = sqliteTable('sms_outbox', {
  ...sync(),
  to_phone: text('to_phone'),
  body: text('body'),
  status: text('status'),
  attempts: integer('attempts'),
});

export const setting = sqliteTable('setting', {
  ...sync(),
  key: text('key').unique(),
  value: text('value', { mode: 'json' }),
});

export const monthly_report = sqliteTable('monthly_report', {
  ...sync(),
  month: text('month'),
  draft_text: text('draft_text'),
  final_text: text('final_text'),
  status: text('status'),
  approved_by: text('approved_by'),
  approved_at: text('approved_at'),
});

// ── Sync bookkeeping (phone only) ──────────────────────────────────────

/** Changes waiting to be pushed, oldest first. `previous` is the row before the change (null for a new row). */
export const sync_outbox = sqliteTable('sync_outbox', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  table_name: text('table_name').notNull(),
  row_id: text('row_id').notNull(),
  op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  previous: text('previous', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  updated_at: text('updated_at').notNull(),
});

/** Changes the server turned down, with its reason, until the person has seen them. */
export const sync_rejection = sqliteTable('sync_rejection', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  table_name: text('table_name').notNull(),
  row_id: text('row_id').notNull(),
  reason: text('reason').notNull(),
  payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  rejected_at: text('rejected_at').notNull(),
});

/**
 * Files waiting to go up (visit photos). A file is sent only after its record
 * has synced; `id` is the upload id in the record's "upload:<id>".
 */
export const sync_upload = sqliteTable('sync_upload', {
  id: text('id').primaryKey(),
  table_name: text('table_name').notNull(),
  row_id: text('row_id').notNull(),
  file_uri: text('file_uri').notNull(),
  content_type: text('content_type').notNull(),
  status: text('status', { enum: ['pending', 'done', 'failed'] }).notNull(),
  attempts: integer('attempts').notNull(),
  last_error: text('last_error'),
  created_at: text('created_at').notNull(),
});

/** Small key-value store: pull cursor, last sync time, schema version. */
export const sync_meta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** The synced tables by their shared name. */
export const syncedTables = {
  user,
  farmer,
  vet_assignment,
  visit,
  bird_count,
  collection,
  buyer,
  sale,
  sale_payment,
  ledger_entry,
  cash_handover,
  cash_count,
  vaccination_round,
  vaccination,
  vaccine_batch,
  vaccine_stock_entry,
  cold_chain_reading,
  vaccine_payment,
  health_case,
  case_note,
  message,
  sms_outbox,
  setting,
  monthly_report,
} as const;
