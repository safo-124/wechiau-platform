/**
 * Sends waiting files (visit photos, voice notes and message photos) after
 * their records sync. Plain logic,
 * tested in Node; storage and network are passed in.
 */
import { SyncError } from '@/sync/errors';

export interface UploadEntry {
  id: string;
  table: string;
  rowId: string;
  fileUri: string;
  contentType: string;
  attempts: number;
}

export interface UploadStore {
  /** Waiting files whose records have already gone up, oldest first. */
  readyUploads(limit: number): UploadEntry[];
  markUploaded(id: string): void;
  /** `permanent`: the server will never take this file, so stop trying. */
  markFailed(id: string, error: string, permanent: boolean): void;
}

export interface UploadApi {
  upload(entry: UploadEntry): Promise<void>;
}

export const UPLOAD_BATCH = 10;
/** The server will never accept these: bad request, not yours, too big, not a photo or voice note. */
const PERMANENT = new Set([400, 403, 413, 415]);

export async function runUploads(store: UploadStore, api: UploadApi): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  for (const entry of store.readyUploads(UPLOAD_BATCH)) {
    try {
      await api.upload(entry);
      store.markUploaded(entry.id);
      uploaded += 1;
    } catch (error) {
      // No network or signed out: stop here; everything stays queued for next time.
      if (error instanceof SyncError && (error.kind === 'offline' || error.kind === 'signed_out')) throw error;
      const status = error instanceof SyncError ? error.status : undefined;
      // The record hasn't reached the server yet: leave the file waiting.
      if (status === 409) continue;
      store.markFailed(entry.id, error instanceof Error ? error.message : String(error), status !== undefined && PERMANENT.has(status));
      failed += 1;
    }
  }
  return { uploaded, failed };
}
