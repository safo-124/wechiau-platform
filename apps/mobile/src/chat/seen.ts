/**
 * When this phone last showed a conversation, so Home can say "1 new". Kept
 * on this phone only (secure storage), per app and per farmer's conversation.
 */
import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';
import { appVariant } from '@/config';

const values = new Map<string, string | null>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};
const keyFor = (conversation: string) => `wechiau.${appVariant}.seen.${conversation}`;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(conversation: string) {
  if (values.has(conversation)) return;
  values.set(conversation, null);
  void SecureStore.getItemAsync(keyFor(conversation)).then((stored) => {
    if (stored && stored > (values.get(conversation) ?? '')) {
      values.set(conversation, stored);
      notify();
    }
  });
}

/** The time of the newest message this phone has shown in the conversation. */
export function useLastSeen(conversation: string): string | null {
  useEffect(() => load(conversation), [conversation]);
  return useSyncExternalStore(subscribe, () => values.get(conversation) ?? null);
}

/** For lists of conversations (the vet's Messages): when each was last shown on this phone. */
export function useSeenTimes(conversations: readonly string[]): (conversation: string) => string | null {
  const key = conversations.join(',');
  useEffect(() => {
    for (const conversation of key.split(',')) if (conversation) load(conversation);
  }, [key]);
  useSyncExternalStore(subscribe, () => version);
  return (conversation) => values.get(conversation) ?? null;
}

export function markSeen(conversation: string, at: string | null | undefined): void {
  if (!at || at <= (values.get(conversation) ?? '')) return;
  values.set(conversation, at);
  notify();
  void SecureStore.setItemAsync(keyFor(conversation), at);
}
