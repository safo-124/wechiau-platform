import { ROLE_LABELS, ROLES_BY_VARIANT, type Role, type SessionUser } from '@wechiau/shared';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, logout } from '@/api/client';
import { appVariant, VARIANT_TITLES } from '@/config';
import { prepareForUser } from '@/sync/store';
import { clearPin } from './pin';
import { DEVICE_KEY, TOKEN_KEY, USER_KEY } from './stored';


export type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out'; reason?: string }
  | { status: 'signed_in'; token: string; user: SessionUser; deviceId: string };

interface SessionContextValue {
  session: SessionState;
  signIn(phone: string, password: string): Promise<void>;
  /** Forgets the token. Data and unsynced changes stay on the phone. */
  signOut(reason?: string): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** A random id for this install, made once and kept in secure storage. */
async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY);
  if (existing) return existing;
  const id = randomUUID();
  await SecureStore.setItemAsync(DEVICE_KEY, id);
  return id;
}

const VARIANT_FOR_ROLE: Record<Role, keyof typeof VARIANT_TITLES> = {
  admin: 'field',
  field_agent: 'field',
  vet: 'vet',
  farmer: 'farmer',
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    void (async () => {
      const [token, userJson, deviceId] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
        getDeviceId(),
      ]);
      const user = userJson ? (JSON.parse(userJson) as SessionUser) : null;
      if (token && user && ROLES_BY_VARIANT[appVariant].includes(user.role)) {
        setSession({ status: 'signed_in', token, user, deviceId });
      } else {
        setSession({ status: 'signed_out' });
      }
    })();
  }, []);

  const signIn = useCallback(async (phone: string, password: string) => {
    const deviceId = await getDeviceId();
    const { token, user } = await api.login({ phone, password, deviceId });
    if (!ROLES_BY_VARIANT[appVariant].includes(user.role)) {
      await logout(token);
      const roleApp = VARIANT_TITLES[VARIANT_FOR_ROLE[user.role]];
      throw new Error(`This is the ${VARIANT_TITLES[appVariant]} app. ${ROLE_LABELS[user.role]}s use ${roleApp}.`);
    }
    if (prepareForUser(user.id) === 'previous_user_has_changes') {
      await logout(token);
      throw new Error(
        "Someone else's changes on this phone haven't reached the server yet. Ask them to sign in and sync first.",
      );
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    setSession({ status: 'signed_in', token, user, deviceId });
  }, []);

  const signOut = useCallback(async (reason?: string) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    // The next person to sign in on this phone chooses their own PIN.
    await clearPin();
    setSession({ status: 'signed_out', reason });
    if (token) await logout(token);
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** For screens that only render when signed in. */
export function useSignedIn(): Extract<SessionState, { status: 'signed_in' }> {
  const { session } = useSession();
  if (session.status !== 'signed_in') throw new Error('This screen needs a signed-in person');
  return session;
}
