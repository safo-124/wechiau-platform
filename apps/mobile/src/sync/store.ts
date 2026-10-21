import type { PullChange } from '@wechiau/shared';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db/client';
import { deleteRow, localTable, upsertRow } from '@/db/rows';
import { sync_meta, sync_outbox, sync_rejection, syncedTables } from '@/db/schema';
import { File } from 'expo-file-system';
import { dropUploadsFor } from '@/uploads/store';
import type { OutboxEntry, SyncStore } from './engine';

/**
 * Raise when a schema change means the phone should pull everything again
 * (for example a new table it didn't keep before). Pulling again is safe:
 * rows are upserted.
 */
export const LOCAL_SCHEMA_VERSION = '1';

const CURSOR = 'pull_cursor';
const LAST_SYNCED = 'last_synced_at';
const SCHEMA_VERSION = 'schema_version';

export function getMeta(conn: DbOrTx, key: string): string | null {
  return conn.select().from(sync_meta).where(eq(sync_meta.key, key)).get()?.value ?? null;
}

export function setMeta(conn: DbOrTx, key: string, value: string): void {
  conn.insert(sync_meta).values({ key, value }).onConflictDoUpdate({ target: sync_meta.key, set: { value } }).run();
}

/** Run once at startup, after migrations. */
export function prepareLocalSync(): void {
  if (getMeta(db, SCHEMA_VERSION) !== LOCAL_SCHEMA_VERSION) {
    db.transaction((tx) => {
      setMeta(tx, CURSOR, '0');
      setMeta(tx, SCHEMA_VERSION, LOCAL_SCHEMA_VERSION);
    });
  }
}

export function lastSyncedAt(): string | null {
  return getMeta(db, LAST_SYNCED);
}

const LOCAL_USER = 'user_id';

/**
 * Called when someone signs in. If it's a different person from last time,
 * the phone's records are cleared and pulled fresh for them, so nobody sees
 * what only the previous person was allowed to see. Refuses if the previous
 * person still has changes waiting, so nothing is lost.
 */
export function prepareForUser(userId: string): 'ready' | 'previous_user_has_changes' {
  const previous = getMeta(db, LOCAL_USER);
  if (previous === userId) return 'ready';
  const waiting = db.select({ seq: sync_outbox.seq }).from(sync_outbox).limit(1).get();
  if (waiting) {
    // Data from before this check was added has no owner recorded: assume it's this person's.
    if (previous === null) {
      setMeta(db, LOCAL_USER, userId);
      return 'ready';
    }
    return 'previous_user_has_changes';
  }
  db.transaction((tx) => {
    for (const table of Object.values(syncedTables)) tx.delete(table).run();
    tx.delete(sync_rejection).run();
    tx.delete(sync_meta).where(eq(sync_meta.key, LAST_SYNCED)).run();
    setMeta(tx, CURSOR, '0');
    setMeta(tx, LOCAL_USER, userId);
  });
  return 'ready';
}

function toEntry(row: typeof sync_outbox.$inferSelect): OutboxEntry {
  return {
    seq: row.seq,
    table: row.table_name,
    rowId: row.row_id,
    op: row.op,
    payload: row.payload,
    previous: row.previous ?? null,
    updatedAt: row.updated_at,
  };
}

export function createSyncStore(deviceId: string): SyncStore {
  return {
    deviceId,

    pendingBatch(limit) {
      return db.select().from(sync_outbox).orderBy(asc(sync_outbox.seq)).limit(limit).all().map(toEntry);
    },

    markAccepted(entries) {
      if (entries.length === 0) return;
      db.delete(sync_outbox).where(inArray(sync_outbox.seq, entries.map((e) => e.seq))).run();
    },

    markRejected(rejections) {
      if (rejections.length === 0) return;
      const now = new Date().toISOString();
      const unusedFiles: string[] = [];
      db.transaction((tx) => {
        for (const { entry, reason } of rejections) {
          // A record the server turned down can't have its photos accepted either.
          if (!entry.previous) unusedFiles.push(...dropUploadsFor(tx, entry.table, entry.rowId).map((f) => f.fileUri));
          // Put the row back as it was, unless a later change to it is still waiting.
          const later = tx
            .select({ seq: sync_outbox.seq })
            .from(sync_outbox)
            .where(and(eq(sync_outbox.table_name, entry.table), eq(sync_outbox.row_id, entry.rowId), gt(sync_outbox.seq, entry.seq)))
            .get();
          const table = localTable(entry.table);
          if (!later && table) {
            if (entry.previous) upsertRow(tx, table, entry.previous);
            else deleteRow(tx, table, entry.rowId);
          }
          tx.insert(sync_rejection)
            .values({ table_name: entry.table, row_id: entry.rowId, reason, payload: entry.payload, rejected_at: now })
            .run();
          tx.delete(sync_outbox).where(eq(sync_outbox.seq, entry.seq)).run();
        }
      });
      for (const uri of unusedFiles) {
        const file = new File(uri);
        if (file.exists) file.delete();
      }
    },

    cursor() {
      return Number(getMeta(db, CURSOR) ?? '0');
    },

    applyPage(changes: PullChange[], nextCursor: number) {
      db.transaction((tx) => {
        for (const change of changes) {
          const table = localTable(change.table);
          if (!table) continue;
          // A change made on this phone that hasn't gone up yet wins until it is pushed.
          const waiting = tx
            .select({ seq: sync_outbox.seq })
            .from(sync_outbox)
            .where(and(eq(sync_outbox.table_name, change.table), eq(sync_outbox.row_id, change.id)))
            .get();
          if (waiting) continue;
          upsertRow(tx, table, { ...change.data, id: change.id });
        }
        setMeta(tx, CURSOR, String(nextCursor));
      });
    },

    setLastSyncedAt(at) {
      setMeta(db, LAST_SYNCED, at);
    },
  };
}
