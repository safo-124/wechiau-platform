/**
 * One sync: send this phone's changes, get everyone else's, send waiting
 * files, then notify about what arrived. Used by the open app (SyncProvider)
 * and by the background task, with one lock so the two never sync at once.
 */
import { caseUrgency, type SessionUser } from '@wechiau/shared';
import { isNull } from 'drizzle-orm';
import { api } from '@/api/client';
import { db } from '@/db/client';
import { health_case, message } from '@/db/schema';
import { notifyArrivals, type Snapshot } from '@/notify/notify';
import { runUploads } from '@/uploads/engine';
import { createUploadStore } from '@/uploads/store';
import { runSync, type SyncResult } from './engine';
import { createSyncStore, lastSyncedAt } from './store';

let inFlight: Promise<SyncResult> | null = null;

/** Which messages and urgent cases are on the phone, to see what a sync brought. */
function snapshot(): Snapshot {
  const messages = db.select({ id: message.id }).from(message).where(isNull(message.deleted_at)).all();
  const cases = db
    .select({ id: health_case.id, status: health_case.status, triage: health_case.triage, triage_suggested: health_case.triage_suggested })
    .from(health_case)
    .where(isNull(health_case.deleted_at))
    .all();
  return {
    messageIds: new Set(messages.map((m) => m.id)),
    urgentCaseIds: new Set(cases.filter((c) => c.status === 'open' && caseUrgency(c) === 'urgent').map((c) => c.id)),
  };
}

export function syncOnce(session: { token: string; deviceId: string; user: SessionUser }): Promise<SyncResult> {
  if (inFlight) return inFlight;
  const run = (async () => {
    // The first sync on a phone brings everything; that is history, not news.
    const firstSync = lastSyncedAt() === null;
    const before = snapshot();
    const result = await runSync(createSyncStore(session.deviceId), {
      push: (request) => api.push(session.token, request),
      pull: (since) => api.pull(session.token, since),
    });
    // Photos and voice notes go up after their records, which have just been pushed.
    await runUploads(createUploadStore(), { upload: async (entry) => void (await api.upload(session.token, entry)) });
    if (!firstSync) await notifyArrivals(session.user, before, snapshot()).catch(() => undefined);
    return result;
  })();
  inFlight = run;
  void run.finally(() => {
    if (inFlight === run) inFlight = null;
  }).catch(() => undefined);
  return run;
}
