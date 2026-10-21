/**
 * The device PIN, kept in secure storage as a salted SHA-256 hash.
 * It only unlocks this phone; the server never sees it.
 */
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { appVariant } from '@/config';

const PIN_KEY = `wechiau.${appVariant}.pin`;
const FAILURES_KEY = `wechiau.${appVariant}.pin.failures`;

interface StoredPin {
  salt: string;
  hash: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hash(pin: string, salt: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) !== null;
}

export async function setPin(pin: string): Promise<void> {
  const salt = toHex(getRandomBytes(16));
  const stored: StoredPin = { salt, hash: await hash(pin, salt) };
  await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(stored));
  await SecureStore.deleteItemAsync(FAILURES_KEY);
}

/** Checks a PIN and counts failures. Returns how many wrong tries there have been in a row. */
export async function checkPin(pin: string): Promise<{ ok: boolean; failures: number }> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  if (!raw) return { ok: false, failures: 0 };
  const stored = JSON.parse(raw) as StoredPin;
  if ((await hash(pin, stored.salt)) === stored.hash) {
    await SecureStore.deleteItemAsync(FAILURES_KEY);
    return { ok: true, failures: 0 };
  }
  const failures = Number((await SecureStore.getItemAsync(FAILURES_KEY)) ?? '0') + 1;
  await SecureStore.setItemAsync(FAILURES_KEY, String(failures));
  return { ok: false, failures };
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await SecureStore.deleteItemAsync(FAILURES_KEY);
}
