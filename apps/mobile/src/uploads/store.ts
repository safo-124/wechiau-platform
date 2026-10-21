import { and, asc, eq, lt, notExists, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db/client';
import { sync_outbox, sync_upload } from '@/db/schema';
import type { UploadEntry, UploadStore } from './engine';

/** After this many failed tries (other than "not synced yet"), a file is marked failed. */
const MAX_ATTEMPTS = 10;

export interface NewUpload {
  id: string;
  table: string;
  rowId: string;
  fileUri: string;
  contentType: string;
}

/** Queues a file; called in the same transaction that saves its record. */
export function queueUpload(conn: DbOrTx, upload: NewUpload): void {
  conn
    .insert(sync_upload)
    .values({
      id: upload.id,
      table_name: upload.table,
      row_id: upload.rowId,
      file_uri: upload.fileUri,
      content_type: upload.contentType,
      status: 'pending',
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
    })
    .run();
}

/** A record was turned down by the server: its files will never be accepted either. */
export function dropUploadsFor(conn: DbOrTx, table: string, rowId: string): { fileUri: string }[] {
  const files = conn
    .select({ fileUri: sync_upload.file_uri })
    .from(sync_upload)
    .where(and(eq(sync_upload.table_name, table), eq(sync_upload.row_id, rowId)))
    .all();
  conn.delete(sync_upload).where(and(eq(sync_upload.table_name, table), eq(sync_upload.row_id, rowId))).run();
  return files;
}

export function createUploadStore(): UploadStore {
  return {
    readyUploads(limit) {
      return db
        .select()
        .from(sync_upload)
        .where(
          and(
            eq(sync_upload.status, 'pending'),
            lt(sync_upload.attempts, MAX_ATTEMPTS),
            // Only once the record itself has left the outbox (reached the server).
            notExists(
              db
                .select({ one: sql`1` })
                .from(sync_outbox)
                .where(and(eq(sync_outbox.table_name, sync_upload.table_name), eq(sync_outbox.row_id, sync_upload.row_id))),
            ),
          ),
        )
        .orderBy(asc(sync_upload.created_at))
        .limit(limit)
        .all()
        .map(
          (row): UploadEntry => ({
            id: row.id,
            table: row.table_name,
            rowId: row.row_id,
            fileUri: row.file_uri,
            contentType: row.content_type,
            attempts: row.attempts,
          }),
        );
    },

    markUploaded(id) {
      db.update(sync_upload).set({ status: 'done', last_error: null }).where(eq(sync_upload.id, id)).run();
    },

    markFailed(id, error, permanent) {
      const row = db.select({ attempts: sync_upload.attempts }).from(sync_upload).where(eq(sync_upload.id, id)).get();
      const attempts = (row?.attempts ?? 0) + 1;
      db.update(sync_upload)
        .set({ attempts, last_error: error, status: permanent || attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' })
        .where(eq(sync_upload.id, id))
        .run();
    },
  };
}
