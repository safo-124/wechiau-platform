import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
  useFonts,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import migrations from '../../drizzle/migrations';
import { SessionProvider } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { db } from '@/db/client';
import { NotificationTaps } from '@/notify/NotificationTaps';
import { prepareLocalSync } from '@/sync/store';
import { SyncProvider } from '@/sync/SyncProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold });
  // Brings the phone's database up to date before any screen reads it.
  const migration = useMigrations(db, migrations);
  const [prepared, setPrepared] = useState(false);

  useEffect(() => {
    if (migration.success) {
      prepareLocalSync();
      // Screens wait for this, so their syncing starts only once the sync tables are ready.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one extra render at startup, on purpose
      setPrepared(true);
    }
  }, [migration.success]);

  const ready = (fontsLoaded || fontError !== null) && (prepared || migration.error !== undefined);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (migration.error) {
    return (
      <Screen>
        <AppText variant="title">The app could not start</AppText>
        <AppText>The phone's database could not be updated. Your data is still on the phone. Please tell the admin.</AppText>
        <AppText variant="small" muted>
          {migration.error.message}
        </AppText>
      </Screen>
    );
  }

  return (
    <SessionProvider>
      <SyncProvider>
        <StatusBar style="dark" />
        <NotificationTaps />
        <Stack screenOptions={{ headerShown: false }} />
      </SyncProvider>
    </SessionProvider>
  );
}
