import { tableSchemas, type TableName } from '@wechiau/shared';
import { randomUUID } from 'expo-crypto';
import { db } from './client';
import { findRow, localTable, upsertRow, type Row } from './rows';
import { sync_outbox } from './schema';
import { queueUpload, type NewUpload } from '@/uploads/store';

export interface WriteContext {
  userId: string;
  deviceId: string;
}

/** Sync columns for a new row entered by the signed-in person on this phone. */
export function newRow(context: WriteContext, fields: Row): Row {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    device_id: context.deviceId,
    recorded_by: context.userId,
    ...fields,
  };
}

/** The same row with a fresh updated_at, for edits. */
export function editedRow(row: Row, context: WriteContext, changes: Row): Row {
  return { ...row, ...changes, updated_at: new Date().toISOString(), device_id: context.deviceId };
}

/**
 * The one way screens save data (v0.3 Phase 1 step 2). Every row is checked
 * against the shared schema first; then the rows and their outbox entries are
 * written in one transaction, so a save is either fully on the phone or not at all.
 * Files (photos) for those rows can be queued in the same transaction.
 * Throws the zod error if a row is invalid, and writes nothing.
 */
export function saveRecords(changes: { table: TableName; row: Row }[], options: { uploads?: NewUpload[] } = {}): void {
  const checked = changes.map(({ table, row }) => ({ table, row: tableSchemas[table].parse(row) as Row }));

  db.transaction((tx) => {
    for (const { table: name, row } of checked) {
      const table = localTable(name)!;
      const id = row['id'] as string;
      const previous = findRow(tx, table, id);
      upsertRow(tx, table, row);
      tx.insert(sync_outbox)
        .values({
          table_name: name,
          row_id: id,
          op: row['deleted_at'] ? 'delete' : 'upsert',
          payload: row,
          previous,
          updated_at: row['updated_at'] as string,
        })
        .run();
    }
    // Files go up after their records; queued in the same transaction so neither is saved without the other.
    for (const upload of options.uploads ?? []) queueUpload(tx, upload);
  });
}
