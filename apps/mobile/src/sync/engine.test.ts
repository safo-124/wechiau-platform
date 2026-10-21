import type { PullChange, PullResponse, PushRequest, PushResponse } from '@wechiau/shared';
import { describe, expect, it } from 'vitest';
import { runSync, takeBatch, type OutboxEntry, type SyncApi, type SyncStore } from './engine';
import { SyncError } from './errors';

function entry(seq: number, rowId: string, table = 'farmer'): OutboxEntry {
  return { seq, table, rowId, op: 'upsert', payload: { id: rowId }, previous: null, updatedAt: '2026-10-20T08:00:00.000Z' };
}

class MemoryStore implements SyncStore {
  readonly deviceId = 'test-phone';
  outbox: OutboxEntry[] = [];
  rejections: { entry: OutboxEntry; reason: string }[] = [];
  pulled: PullChange[] = [];
  savedCursor = 0;
  lastSyncedAt: string | null = null;

  pendingBatch(limit: number) {
    return this.outbox.slice(0, limit);
  }
  markAccepted(entries: OutboxEntry[]) {
    const done = new Set(entries.map((e) => e.seq));
    this.outbox = this.outbox.filter((e) => !done.has(e.seq));
  }
  markRejected(rejections: { entry: OutboxEntry; reason: string }[]) {
    this.rejections.push(...rejections);
    this.markAccepted(rejections.map((r) => r.entry));
  }
  cursor() {
    return this.savedCursor;
  }
  applyPage(changes: PullChange[], nextCursor: number) {
    this.pulled.push(...changes);
    this.savedCursor = nextCursor;
  }
  setLastSyncedAt(at: string) {
    this.lastSyncedAt = at;
  }
}

/** A server that accepts everything except ids in `reject`, and serves `pages` in order. */
function fakeApi(options: { reject?: Record<string, string>; pages?: PullResponse[]; dropIds?: string[] } = {}) {
  const pushes: PushRequest[] = [];
  const pulls: number[] = [];
  const pages = [...(options.pages ?? [{ changes: [], nextCursor: 0, hasMore: false }])];
  const api: SyncApi = {
    async push(request): Promise<PushResponse> {
      pushes.push(request);
      const ids = request.changes.map((c) => c.id).filter((id) => !options.dropIds?.includes(id));
      return {
        accepted: ids.filter((id) => !options.reject?.[id]),
        rejected: ids.filter((id) => options.reject?.[id]).map((id) => ({ id, table: 'farmer', reason: options.reject![id]! })),
      };
    },
    async pull(since) {
      pulls.push(since);
      return pages.shift() ?? { changes: [], nextCursor: since, hasMore: false };
    },
  };
  return { api, pushes, pulls };
}

const change = (seq: number): PullChange => ({ table: 'farmer', id: `row-${seq}`, op: 'upsert', data: {}, seq });

describe('takeBatch', () => {
  it('keeps order and stops before a second change to the same row', () => {
    const batch = takeBatch([entry(1, 'a'), entry(2, 'b'), entry(3, 'a'), entry(4, 'c')]);
    expect(batch.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('treats the same id in different tables as different rows', () => {
    expect(takeBatch([entry(1, 'a', 'farmer'), entry(2, 'a', 'visit')])).toHaveLength(2);
  });

  it('respects the limit', () => {
    expect(takeBatch([entry(1, 'a'), entry(2, 'b'), entry(3, 'c')], 2)).toHaveLength(2);
  });
});

describe('runSync', () => {
  it('pushes the outbox, then pulls every page, then records the time', async () => {
    const store = new MemoryStore();
    store.outbox = [entry(1, 'ama'), entry(2, 'naa')];
    const { api, pushes, pulls } = fakeApi({
      pages: [
        { changes: [change(1), change(2)], nextCursor: 2, hasMore: true },
        { changes: [change(3)], nextCursor: 3, hasMore: false },
      ],
    });

    const result = await runSync(store, api, () => '2026-10-20T10:00:00.000Z');

    expect(result).toEqual({ pushed: 2, rejected: 0, pulled: 3 });
    expect(pushes[0]?.deviceId).toBe('test-phone');
    expect(pushes[0]?.changes.map((c) => c.id)).toEqual(['ama', 'naa']);
    expect(pulls).toEqual([0, 2]);
    expect(store.outbox).toEqual([]);
    expect(store.savedCursor).toBe(3);
    expect(store.lastSyncedAt).toBe('2026-10-20T10:00:00.000Z');
  });

  it('sends two changes to one row in separate pushes, in order', async () => {
    const store = new MemoryStore();
    store.outbox = [entry(1, 'ama'), entry(2, 'ama')];
    const { api, pushes } = fakeApi();
    await runSync(store, api);
    expect(pushes.map((p) => p.changes.length)).toEqual([1, 1]);
  });

  it('keeps the reason for turned-down changes and carries on', async () => {
    const store = new MemoryStore();
    store.outbox = [entry(1, 'ama'), entry(2, 'naa')];
    const { api } = fakeApi({ reject: { naa: "Vets can't add farmer profiles." } });

    const result = await runSync(store, api);

    expect(result).toMatchObject({ pushed: 1, rejected: 1 });
    expect(store.rejections).toEqual([{ entry: entry(2, 'naa'), reason: "Vets can't add farmer profiles." }]);
    expect(store.outbox).toEqual([]);
  });

  it('keeps unconfirmed changes queued and stops instead of looping', async () => {
    const store = new MemoryStore();
    store.outbox = [entry(1, 'ama'), entry(2, 'naa')];
    const { api, pushes } = fakeApi({ dropIds: ['naa'] });

    await expect(runSync(store, api)).rejects.toBeInstanceOf(SyncError);
    expect(pushes).toHaveLength(1);
    expect(store.outbox.map((e) => e.rowId)).toEqual(['naa']);
  });

  it('leaves everything in place when the network fails, so nothing is lost', async () => {
    const store = new MemoryStore();
    store.outbox = [entry(1, 'ama')];
    const api: SyncApi = {
      push: async () => {
        throw new SyncError('offline', 'No network');
      },
      pull: async () => ({ changes: [], nextCursor: 0, hasMore: false }),
    };

    await expect(runSync(store, api)).rejects.toMatchObject({ kind: 'offline' });
    expect(store.outbox).toHaveLength(1);
    expect(store.lastSyncedAt).toBeNull();
  });

  it('stops pulling if the cursor stops moving', async () => {
    const store = new MemoryStore();
    store.savedCursor = 5;
    const { api, pulls } = fakeApi({ pages: [{ changes: [], nextCursor: 5, hasMore: true }] });
    await runSync(store, api);
    expect(pulls).toEqual([5]);
  });
});
