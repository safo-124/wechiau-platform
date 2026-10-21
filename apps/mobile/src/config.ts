import { APP_VARIANTS, type AppVariant } from '@wechiau/shared';
import Constants from 'expo-constants';

function readVariant(): AppVariant {
  const value: unknown = Constants.expoConfig?.extra?.appVariant;
  if (typeof value === 'string' && (APP_VARIANTS as readonly string[]).includes(value)) return value as AppVariant;
  throw new Error(`Unknown app variant: ${String(value)}. Start the app with npm run dev:field, dev:vet or dev:farmer.`);
}

/** Which of the three apps this build is: field, vet or farmer. */
export const appVariant: AppVariant = readVariant();

/** The server's API base URL. Set EXPO_PUBLIC_API_URL in apps/mobile/.env.local. */
export const apiUrl: string = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');

export const VARIANT_TITLES: Record<AppVariant, string> = {
  field: 'Wechiau Field',
  vet: 'Wechiau Vet',
  farmer: 'Wechiau Farmer',
};
