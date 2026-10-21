/**
 * Where the sign-in is kept on the phone (secure storage), shared by the app
 * and the background sync, which runs without any screen open.
 */
import { ROLES_BY_VARIANT, type SessionUser } from '@wechiau/shared';
import * as SecureStore from 'expo-secure-store';
import { appVariant } from '@/config';

// Per variant, so the three apps tried in Expo Go on one phone don't share a sign-in.
export const TOKEN_KEY = `wechiau.${appVariant}.session.token`;
export const USER_KEY = `wechiau.${appVariant}.session.user`;
export const DEVICE_KEY = 'wechiau.device.id';

export interface StoredSession {
  token: string;
  user: SessionUser;
  deviceId: string;
}

/** The sign-in saved on this phone, or null when nobody is signed in to this app. */
export async function readStoredSession(): Promise<StoredSession | null> {
  const [token, userJson, deviceId] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
    SecureStore.getItemAsync(DEVICE_KEY),
  ]);
  if (!token || !userJson || !deviceId) return null;
  const user = JSON.parse(userJson) as SessionUser;
  return ROLES_BY_VARIANT[appVariant].includes(user.role) ? { token, user, deviceId } : null;
}
