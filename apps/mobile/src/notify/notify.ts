/**
 * Notifications on this phone, raised by the phone itself after a sync (open
 * app or background) when something arrived for this person: no SMS, and no
 * push service account needed. A real push service can be added later for
 * instant alerts; these come with the next sync (up to about 15 minutes in
 * the background, often longer when the phone is saving battery).
 */
import { currentVets, type SessionUser } from '@wechiau/shared';
import { colors } from '@wechiau/ui/theme';
import { inArray, isNull } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { appVariant } from '@/config';
import { db } from '@/db/client';
import { farmer, health_case, message, user, vet_assignment } from '@/db/schema';
import { newNotices } from './notices';

export interface Snapshot {
  messageIds: Set<string>;
  urgentCaseIds: Set<string>;
}

const CHANNEL = 'default';
const COLOR = { field: colors.green, vet: colors.blue, farmer: colors.eggButton } as const;

// Show notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/** Once signed in: the Android channel, and asking permission (Android 13 and newer ask). */
export async function setUpNotifications(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Messages and urgent cases',
    // The enum is re-exported through `export *`, which the lint rule can't follow; it exists at runtime.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: COLOR[appVariant],
  });
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') await Notifications.requestPermissionsAsync();
}

/** Raises a notification for each thing that arrived with the sync and matters to this person. */
export async function notifyArrivals(me: SessionUser, before: Snapshot, after: Snapshot): Promise<void> {
  const newIds = [...after.messageIds].filter((id) => !before.messageIds.has(id));
  const urgentIds = [...after.urgentCaseIds].filter((id) => !before.urgentCaseIds.has(id));
  if (newIds.length === 0 && urgentIds.length === 0) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const messages = newIds.length ? db.select().from(message).where(inArray(message.id, newIds)).all() : [];
  const cases = urgentIds.length ? db.select().from(health_case).where(inArray(health_case.id, urgentIds)).all() : [];
  const farmers = db.select({ id: farmer.id, name: farmer.name }).from(farmer).all();
  const users = db.select({ id: user.id, name: user.name }).from(user).all();
  const vets = currentVets(db.select().from(vet_assignment).where(isNull(vet_assignment.deleted_at)).all());

  const notices = newNotices({
    role: me.role,
    userId: me.id,
    farmerId: me.farmer_id,
    newMessages: messages,
    newlyUrgent: cases,
    farmerName: (id) => farmers.find((f) => f.id === id)?.name ?? 'A farmer',
    userName: (id) => users.find((u) => u.id === id)?.name ?? null,
    vetOf: (farmerId) => vets.get(farmerId) ?? null,
  });
  for (const notice of notices) {
    await Notifications.scheduleNotificationAsync({ content: { title: notice.title, body: notice.body, data: { url: notice.url } }, trigger: null });
  }
}
