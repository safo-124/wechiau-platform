import { Redirect, Stack } from 'expo-router';
import { PinGate } from '@/auth/PinGate';
import { useSession } from '@/auth/session';
import { appVariant } from '@/config';

/** Screens for the field app: only in the field build, only when signed in, behind the device PIN. */
export default function FieldLayout() {
  const { session } = useSession();
  if (appVariant !== 'field') return <Redirect href="/" />;
  if (session.status === 'loading') return null;
  if (session.status === 'signed_out') return <Redirect href="/login" />;
  return (
    <PinGate>
      <Stack screenOptions={{ headerShown: false }} />
    </PinGate>
  );
}
