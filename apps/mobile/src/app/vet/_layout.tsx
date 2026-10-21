import { Redirect, Stack } from 'expo-router';
import { PinGate } from '@/auth/PinGate';
import { useSession } from '@/auth/session';
import { appVariant } from '@/config';

/** Screens for the vet app: only in the vet build, only when signed in, behind the device PIN. */
export default function VetLayout() {
  const { session } = useSession();
  if (appVariant !== 'vet') return <Redirect href="/" />;
  if (session.status === 'loading') return null;
  if (session.status === 'signed_out') return <Redirect href="/login" />;
  return (
    <PinGate>
      <Stack screenOptions={{ headerShown: false }} />
    </PinGate>
  );
}
