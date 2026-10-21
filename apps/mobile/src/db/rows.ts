import { eq, getTableColumns } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DbOrTx } from './client';
import { syncedTables } from './schema';

export type Row = Record<string, unknown>;

/** Any synced table: they all have an `id` primary key. */
type SyncedTable = SQLiteTable & { id: SQLiteColumn };

/** The local table for a shared table name, or null for names this app version doesn't know. */
export function localTable(name: string): SyncedTable | null {
  return (syncedTables as Record<string, SyncedTable>)[name] ?? null;
}

/** Keeps only columns the local table has (a newer server may send more). */
export function knownColumns(table: SQLiteTable, data: Row): Row {
  const out: Row = {};
  for (const column of Object.keys(getTableColumns(table))) if (column in data) out[column] = data[column];
  return out;
}

export function findRow(db: DbOrTx, table: SyncedTable, id: string): Row | null {
  return (db.select().from(table).where(eq(table.id, id)).get() as Row | undefined) ?? null;
}

export function upsertRow(db: DbOrTx, table: SyncedTable, row: Row): void {
  const values = knownColumns(table, row);
  // Values were checked against the shared zod schema (or came from the server); the
  // generic table type can't express each table's columns, hence `never`.
  db.insert(table).values(values as never).onConflictDoUpdate({ target: table.id, set: values }).run();
}

export function deleteRow(db: DbOrTx, table: SyncedTable, id: string): void {
  db.delete(table).where(eq(table.id, id)).run();
}
