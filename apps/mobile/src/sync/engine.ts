/**
 * The sync cycle (v0.3 figure 3): push the outbox in batches, then pull until
 * the server has nothing more. Storage and network are passed in, so this
 * file has no React Native code and is tested in Node.
 */
import type { PullChange, PullResponse, PushChange, PushRequest, PushResponse, SyncOp } from '@wechiau/shared';
import { SyncError } from './errors';

export interface OutboxEntry {
  seq: number;
  table: string;
  rowId: string;
  op: SyncOp;
  payload: Record<string, unknown>;
  /** The row before this change, or null if the change created it. */
  previous: Record<string, unknown> | null;
  updatedAt: string;
}

export interface SyncStore {
  readonly deviceId: string;
  /** The oldest queued changes. */
  pendingBatch(limit: number): OutboxEntry[];
  /** The server has these; remove them from the outbox. */
  markAccepted(entries: OutboxEntry[]): void;
  /** The server turned these down: keep the reason for the person and undo the change on the phone. */
  markRejected(rejections: { entry: OutboxEntry; reason: string }[]): void;
  cursor(): number;
  /** Saves pulled rows and the new cursor together. */
  applyPage(changes: PullChange[], nextCursor: number): void;
  setLastSyncedAt(at: string): void;
}

export interface SyncApi {
  push(request: PushRequest): Promise<PushResponse>;
  pull(since: number): Promise<PullResponse>;
}

export interface SyncResult {
  pushed: number;
  rejected: number;
  pulled: number;
}

/** v0.3 asks for batches of 100 to 500; 100 keeps each request small on a weak signal. */
export const PUSH_BATCH_SIZE = 100;

/**
 * Takes entries in order, stopping before a second change to the same row, so
 * the server's answer (by row id) maps back to exactly one entry and nothing
 * is pushed out of order.
 */
export function takeBatch(entries: OutboxEntry[], limit = PUSH_BATCH_SIZE): OutboxEntry[] {
  const seen = new Set<string>();
  const batch: OutboxEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.table}:${entry.rowId}`;
    if (seen.has(key) || batch.length >= limit) break;
    seen.add(key);
    batch.push(entry);
  }
  return batch;
}

function toPushChange(entry: OutboxEntry): PushChange {
  return { table: entry.table, id: entry.rowId, op: entry.op, data: entry.payload, updatedAt: entry.updatedAt };
}

export async function runSync(store: SyncStore, api: SyncApi, now: () => string = () => new Date().toISOString()): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, rejected: 0, pulled: 0 };

  for (;;) {
    const batch = takeBatch(store.pendingBatch(PUSH_BATCH_SIZE));
    if (batch.length === 0) break;

    const response = await api.push({ deviceId: store.deviceId, changes: batch.map(toPushChange) });
    const reasons = new Map(response.rejected.map((r) => [r.id, r.reason]));
    const accepted = new Set(response.accepted);

    const done = batch.filter((entry) => accepted.has(entry.rowId) && !reasons.has(entry.rowId));
    const turnedDown = batch
      .filter((entry) => reasons.has(entry.rowId))
      .map((entry) => ({ entry, reason: reasons.get(entry.rowId)! }));

    store.markAccepted(done);
    store.markRejected(turnedDown);
    result.pushed += done.length;
    result.rejected += turnedDown.length;

    // Anything the server didn't answer for stays queued; stop rather than send it again in a loop.
    if (done.length + turnedDown.length < batch.length) {
      throw new SyncError('server', 'The server did not confirm every change. They stay on this phone and will be sent again.');
    }
  }

  let cursor = store.cursor();
  for (;;) {
    const page = await api.pull(cursor);
    store.applyPage(page.changes, page.nextCursor);
    result.pulled += page.changes.length;
    if (!page.hasMore || page.nextCursor <= cursor) break;
    cursor = page.nextCursor;
  }

  store.setLastSyncedAt(now());
  return result;
}
