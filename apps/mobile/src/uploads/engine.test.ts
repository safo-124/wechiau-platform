import { describe, expect, it } from 'vitest';
import { SyncError } from '@/sync/errors';
import { runUploads, type UploadApi, type UploadEntry, type UploadStore } from './engine';

const entry = (id: string): UploadEntry => ({
  id,
  table: 'visit',
  rowId: `visit-${id}`,
  fileUri: `file:///uploads/${id}.jpg`,
  contentType: 'image/jpeg',
  attempts: 0,
});

class MemoryUploads implements UploadStore {
  waiting: UploadEntry[];
  done: string[] = [];
  failed: { id: string; permanent: boolean }[] = [];
  constructor(entries: UploadEntry[]) {
    this.waiting = entries;
  }
  readyUploads(limit: number) {
    return this.waiting.slice(0, limit);
  }
  markUploaded(id: string) {
    this.done.push(id);
    this.waiting = this.waiting.filter((e) => e.id !== id);
  }
  markFailed(id: string, _error: string, permanent: boolean) {
    this.failed.push({ id, permanent });
  }
}

const apiAnswering = (answers: Record<string, () => never | void>): UploadApi => ({
  async upload(e) {
    answers[e.id]?.();
  },
});

describe('runUploads', () => {
  it('sends each waiting photo once', async () => {
    const store = new MemoryUploads([entry('a'), entry('b')]);
    expect(await runUploads(store, apiAnswering({}))).toEqual({ uploaded: 2, failed: 0 });
    expect(store.done).toEqual(['a', 'b']);
  });

  it('leaves a photo waiting while its visit has not reached the server', async () => {
    const store = new MemoryUploads([entry('a'), entry('b')]);
    const api = apiAnswering({
      a: () => {
        throw new SyncError('server', 'not synced yet', 409);
      },
    });
    expect(await runUploads(store, api)).toEqual({ uploaded: 1, failed: 0 });
    expect(store.waiting.map((e) => e.id)).toEqual(['a']);
    expect(store.failed).toEqual([]);
  });

  it('stops trying files the server will never take', async () => {
    const store = new MemoryUploads([entry('a'), entry('b')]);
    const api = apiAnswering({
      a: () => {
        throw new SyncError('server', 'not a photo', 415);
      },
      b: () => {
        throw new SyncError('server', 'server busy', 503);
      },
    });
    expect(await runUploads(store, api)).toEqual({ uploaded: 0, failed: 2 });
    expect(store.failed).toEqual([
      { id: 'a', permanent: true },
      { id: 'b', permanent: false },
    ]);
  });

  it('stops at the first sign of no network, keeping everything queued', async () => {
    const store = new MemoryUploads([entry('a'), entry('b')]);
    const api = apiAnswering({
      a: () => {
        throw new SyncError('offline', 'no network');
      },
    });
    await expect(runUploads(store, api)).rejects.toMatchObject({ kind: 'offline' });
    expect(store.waiting).toHaveLength(2);
  });
});
