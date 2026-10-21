import { Redirect } from 'expo-router';
import { useSession } from '@/auth/session';
import { appVariant } from '@/config';

/** Each build opens its own app (/field, /vet or /farmer), after sign-in. */
export default function Index() {
  const { session } = useSession();
  if (session.status === 'loading') return null;
  if (session.status === 'signed_out') return <Redirect href="/login" />;
  return <Redirect href={`/${appVariant}`} />;
}
