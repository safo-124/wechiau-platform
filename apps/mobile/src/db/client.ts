import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import { appVariant } from '@/config';
import * as schema from './schema';

// One file per app, so the three apps tried in Expo Go on one phone stay separate.
// The change listener lets screens update live when rows change.
export const expoDb = openDatabaseSync(`wechiau-${appVariant}.db`, { enableChangeListener: true });
export const db = drizzle(expoDb, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either the database or an open transaction. */
export type DbOrTx = Db | Tx;
