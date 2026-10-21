import type { Tone } from '@wechiau/ui/theme';
import { formatSyncTime } from '@/format';
import { OFFLINE_MESSAGE } from './errors';
import type { SyncState } from './SyncProvider';

export interface SyncSummary {
  tone: Tone;
  /** "Everything is on the server", "3 waiting to sync"… */
  title: string;
  detail: string;
  /** Short words for the header chip: "01:02", "3 to send", "Offline". */
  chip: string;
  kind: 'syncing' | 'synced' | 'waiting' | 'offline' | 'failed';
}

/** What is on this phone versus the server, in words, for the header chip and the account menu. */
export function describeSync(sync: Pick<SyncState, 'running' | 'pending' | 'pendingUploads' | 'lastError' | 'lastSyncedAt'>): SyncSummary {
  const files = sync.pendingUploads ? ` ${sync.pendingUploads} photo${sync.pendingUploads === 1 ? '' : 's'} or voice note${sync.pendingUploads === 1 ? '' : 's'} waiting to go up.` : '';
  const waiting = `${sync.pending} waiting to sync`;
  if (sync.running) {
    return { kind: 'syncing', tone: 'neutral', title: 'Syncing…', detail: sync.pending ? `${sync.pending} to send.` : 'Getting the latest records.', chip: 'Syncing' };
  }
  if (sync.lastError?.kind === 'offline') {
    return sync.pending
      ? { kind: 'waiting', tone: 'comingUp', title: waiting, detail: `${OFFLINE_MESSAGE}${files}`, chip: `${sync.pending} to send` }
      : { kind: 'offline', tone: 'neutral', title: 'No network', detail: `${OFFLINE_MESSAGE}${files}`, chip: 'Offline' };
  }
  if (sync.lastError) {
    return { kind: 'failed', tone: 'comingUp', title: "Couldn't sync", detail: sync.lastError.message, chip: "Couldn't sync" };
  }
  if (sync.pending) {
    return { kind: 'waiting', tone: 'comingUp', title: waiting, detail: `${OFFLINE_MESSAGE}${files}`, chip: `${sync.pending} to send` };
  }
  const last = sync.lastSyncedAt ? formatSyncTime(sync.lastSyncedAt) : null;
  return {
    kind: 'synced',
    tone: 'good',
    title: 'Everything is on the server',
    detail: `${last ? `Last synced ${last}.` : 'Not synced yet.'}${files}`,
    chip: last ?? 'Not synced',
  };
}
