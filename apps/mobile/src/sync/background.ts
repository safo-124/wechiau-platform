/**
 * Syncing with the app closed (v0.3 phase 2, step 3). Android runs this about
 * every 15 minutes at most, less often when the phone is saving battery, and
 * only with network. Defined in index.ts, before the app starts, so Android
 * can run it without opening any screen.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { readStoredSession } from '@/auth/stored';
import { syncOnce } from './run';

export const BACKGROUND_SYNC = 'wechiau-background-sync';

TaskManager.defineTask(BACKGROUND_SYNC, async () => {
  try {
    const session = await readStoredSession();
    if (session) await syncOnce(session);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // No network, or signed out: the next run (or opening the app) tries again.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function startBackgroundSync(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC))) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC, { minimumInterval: 15 });
  }
}

export async function stopBackgroundSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC)) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC);
}
