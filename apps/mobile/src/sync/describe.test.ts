import { describe, expect, it } from 'vitest';
import { describeSync } from './describe';
import { SyncError } from './errors';

const base = { running: false, pending: 0, pendingUploads: 0, lastError: null, lastSyncedAt: null };

describe('describeSync (header chip and account menu)', () => {
  it('shows a green tick and the time when everything is on the server', () => {
    const at = new Date();
    at.setHours(1, 2, 0, 0);
    expect(describeSync({ ...base, lastSyncedAt: at.toISOString() })).toMatchObject({ kind: 'synced', tone: 'good', chip: '01:02' });
    expect(describeSync(base).chip).toBe('Not synced');
  });

  it('turns amber when changes are waiting, with or without network', () => {
    expect(describeSync({ ...base, pending: 3 })).toMatchObject({ kind: 'waiting', tone: 'comingUp', chip: '3 to send' });
    const offline = new SyncError('offline', 'No network');
    expect(describeSync({ ...base, pending: 2, lastError: offline })).toMatchObject({ tone: 'comingUp', chip: '2 to send' });
    expect(describeSync({ ...base, lastError: offline })).toMatchObject({ kind: 'offline', tone: 'neutral', chip: 'Offline' });
  });

  it('says when it is syncing or could not sync, and counts files still to go up', () => {
    expect(describeSync({ ...base, running: true }).chip).toBe('Syncing');
    expect(describeSync({ ...base, lastError: new SyncError('server', 'The server answered 500.') })).toMatchObject({ kind: 'failed', title: "Couldn't sync" });
    expect(describeSync({ ...base, pendingUploads: 1 }).detail).toContain('1 photo or voice note waiting to go up');
  });
});
