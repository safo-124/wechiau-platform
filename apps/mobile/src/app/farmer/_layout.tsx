import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/auth/session';
import { appVariant } from '@/config';

/**
 * Screens for the farmer app: only in the farmer build, only when signed in
 * (phone number and the PIN from the field agent). No device PIN on top: the
 * app is for farmers who may read little, and holds only their own farm.
 */
export default function FarmerLayout() {
  const { session } = useSession();
  if (appVariant !== 'farmer') return <Redirect href="/" />;
  if (session.status === 'loading') return null;
  if (session.status === 'signed_out') return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
