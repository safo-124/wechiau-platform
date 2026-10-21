import { count, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/auth/session';
import { db } from '@/db/client';
import { sync_outbox, sync_rejection, sync_upload } from '@/db/schema';
import { setUpNotifications } from '@/notify/notify';
import { startBackgroundSync, stopBackgroundSync } from './background';
import type { SyncResult } from './engine';
import { SyncError } from './errors';
import { syncOnce } from './run';
import { lastSyncedAt } from './store';

/** While the app is open, sync this often even if nothing happened. */
const SYNC_EVERY_MS = 5 * 60 * 1000;
/** After a save, wait briefly so several quick saves go up together. */
const AFTER_SAVE_MS = 1500;

export interface SyncState {
  running: boolean;
  /** Changes on this phone not yet on the server. */
  pending: number;
  /** Photos waiting to go up. */
  pendingUploads: number;
  /** Changes the server turned down, waiting for the person to see them. */
  rejections: (typeof sync_rejection.$inferSelect)[];
  lastError: SyncError | null;
  lastResult: SyncResult | null;
  lastSyncedAt: string | null;
  syncNow(): Promise<void>;
  /** Call after saving: syncs shortly, if there is network. */
  requestSync(): void;
  dismissRejection(id: number): void;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session, signOut } = useSession();
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<SyncError | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(() => lastSyncedAt());
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: pendingRows } = useLiveQuery(db.select({ n: count() }).from(sync_outbox));
  const { data: rejections } = useLiveQuery(db.select().from(sync_rejection).orderBy(sync_rejection.id));
  const { data: uploadRows } = useLiveQuery(
    db.select({ n: count() }).from(sync_upload).where(eq(sync_upload.status, 'pending')),
  );

  const signedIn = session.status === 'signed_in' ? session : null;

  const syncNow = useCallback(async () => {
    if (!signedIn) return;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setRunning(true);
      try {
        const result = await syncOnce(signedIn);
        setLastResult(result);
        setLastError(null);
        setSyncedAt(lastSyncedAt());
      } catch (error) {
        const syncError = error instanceof SyncError ? error : new SyncError('server', 'Sync stopped unexpectedly.');
        setLastError(syncError);
        // Unsynced changes stay on the phone and go up after signing in again.
        if (syncError.kind === 'signed_out') await signOut('Please sign in again to keep syncing.');
      } finally {
        setRunning(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [signedIn, signOut]);

  const requestSync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), AFTER_SAVE_MS);
  }, [syncNow]);

  // Signed in: notifications, and syncing with the app closed too. Signed out: no background sync.
  const signedInUserId = signedIn?.user.id ?? null;
  useEffect(() => {
    if (!signedInUserId) {
      void stopBackgroundSync().catch(() => undefined);
      return;
    }
    void setUpNotifications().catch(() => undefined);
    void startBackgroundSync().catch(() => undefined);
  }, [signedInUserId]);

  // Sync when signed in, when the app comes back to the front, and every few minutes.
  useEffect(() => {
    if (!signedIn) return;
    void syncNow();
    const interval = setInterval(() => void syncNow(), SYNC_EVERY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [signedIn, syncNow]);

  const dismissRejection = useCallback((id: number) => {
    db.delete(sync_rejection).where(eq(sync_rejection.id, id)).run();
  }, []);

  const value = useMemo<SyncState>(
    () => ({
      running,
      pending: pendingRows[0]?.n ?? 0,
      pendingUploads: uploadRows[0]?.n ?? 0,
      rejections,
      lastError,
      lastResult,
      lastSyncedAt: syncedAt,
      syncNow,
      requestSync,
      dismissRejection,
    }),
    [running, pendingRows, uploadRows, rejections, lastError, lastResult, syncedAt, syncNow, requestSync, dismissRejection],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
