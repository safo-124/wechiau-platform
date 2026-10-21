import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

/** Opens the right screen when a notification is tapped, also when the tap started the app. */
export function NotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const url = last.notification.request.content.data?.['url'];
    if (typeof url !== 'string') return;
    // After the first screen is up, so the navigator is ready.
    const frame = requestAnimationFrame(() => {
      try {
        router.push(url as Href);
      } catch {
        // The screen isn't available (signed out, or another app's link): stay where we are.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [last]);
  return null;
}
