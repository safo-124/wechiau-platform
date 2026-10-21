import { colors, radii, touch } from '@wechiau/ui/theme';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View, type TextInputInstance } from 'react-native';
import { useReducedMotion } from '@/components/motion';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkServer } from '@/api/health';
import { useSession } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { HatchingEgg, type EggState } from '@/components/HatchingEgg';
import { Eye, EyeOff } from '@/components/icons';
import { TextField } from '@/components/TextField';
import { apiUrl, appVariant, VARIANT_TITLES } from '@/config';
import { formatPhoneInput } from '@/format';
import { SyncError } from '@/sync/errors';

/** Each app in its own colour, so nobody signs in to the wrong one. */
const LOOK = {
  field: { band: colors.green, egg: colors.eggButton, crack: '#7A4B00', subtitle: 'For egg collectors and the admin', other: 'Are you a vet? Use the Wechiau Vet app.' },
  vet: { band: colors.blue, egg: colors.white, crack: '#8C98AA', subtitle: "For Wechiau Poultry's vets", other: 'Do you collect eggs? Use the Wechiau Field app.' },
  farmer: {
    band: colors.eggButton,
    egg: colors.white,
    crack: '#B98A3A',
    subtitle: 'Your birds, your money, and a vet when you need one',
    other: 'Staff use the Wechiau Field or Wechiau Vet app.',
  },
} as const;

const LAST_PHONE_KEY = `wechiau.${appVariant}.last-phone`;

type Problem = { field: 'phone' | 'secret' | 'general'; text: string };

/**
 * Sign in, once per phone (designs: the apps' colours and the egg from the
 * icons). Staff use their phone number and password; farmers the 6-digit PIN
 * their field agent gave them. A right password hatches the egg.
 */
export default function Login() {
  const { session, signIn } = useSession();
  const look = LOOK[appVariant];
  const farmer = appVariant === 'farmer';
  const secret = farmer ? 'PIN' : 'password';
  const reduced = useReducedMotion();
  const secretRef = useRef<TextInputInstance>(null);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [egg, setEgg] = useState<EggState>('idle');
  const [shake, setShake] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(
    session.status === 'signed_out' && session.reason ? { field: 'general', text: session.reason } : null,
  );
  const [connection, setConnection] = useState<'checking' | 'ok' | 'offline'>('checking');

  // The phone number used last time on this phone, so only the password is needed again.
  useEffect(() => {
    void SecureStore.getItemAsync(LAST_PHONE_KEY).then((saved) => {
      if (saved) setPhone((typed) => typed || formatPhoneInput(saved));
    });
  }, []);

  // Says whether the server can be reached before anyone taps Sign in.
  const checkConnection = useCallback(() => {
    void checkServer(6000).then((result) => setConnection(result.state === 'unreachable' ? 'offline' : 'ok'));
  }, []);
  useEffect(() => {
    checkConnection();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkConnection();
    });
    return () => subscription.remove();
  }, [checkConnection]);

  async function submit() {
    if (egg !== 'idle') return;
    if (phone.replace(/\D/g, '').length < 9) {
      setProblem({ field: 'phone', text: 'Enter your phone number, like 024 123 4567.' });
      return;
    }
    if (!password) {
      setProblem({ field: 'secret', text: `Enter your ${secret}.` });
      return;
    }
    Keyboard.dismiss();
    setProblem(null);
    setEgg('busy');
    try {
      await signIn(phone, password);
      void SecureStore.setItemAsync(LAST_PHONE_KEY, phone);
      setEgg('hatched');
      setConnection('ok');
      // Let the chick come out before the app opens.
      setTimeout(() => router.replace('/'), reduced ? 300 : 1700);
    } catch (e) {
      setEgg('idle');
      if (e instanceof SyncError && e.kind === 'offline') {
        setConnection('offline');
        setProblem({ field: 'general', text: 'No network. Connect to mobile data or Wi-Fi, then try again.' });
        return;
      }
      const wrong = e instanceof SyncError && e.status === 401;
      setProblem(wrong ? { field: 'secret', text: `Phone number or ${secret} is wrong.` } : { field: 'general', text: e instanceof Error ? e.message : 'Could not sign in.' });
      setShake((n) => n + 1);
    }
  }

  const testServer = apiUrl.startsWith('https://') ? null : apiUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
  const version = Constants.expoConfig?.version;

  return (
    <View style={[styles.page, { backgroundColor: look.band }]}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.band}>
              <HatchingEgg state={egg} shake={shake} color={look.egg} crackColor={look.crack} size={104} />
              <AppText variant="title" style={styles.title}>
                {VARIANT_TITLES[appVariant]}
              </AppText>
              <AppText variant="bodyLarge" style={styles.subtitle}>
                {look.subtitle}
              </AppText>
            </View>

            <View style={styles.sheet}>
              <Connection state={connection} onRetry={checkConnection} />

              <TextField
                label="Phone number"
                value={phone}
                onChangeText={(text) => setPhone(formatPhoneInput(text))}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="e.g. 024 123 4567"
                returnKeyType="next"
                onSubmitEditing={() => secretRef.current?.focus()}
                error={problem?.field === 'phone' ? problem.text : null}
              />
              <TextField
                inputRef={secretRef}
                label={farmer ? 'PIN' : 'Password'}
                value={password}
                onChangeText={farmer ? (v) => setPassword(v.replace(/\D/g, '').slice(0, 6)) : setPassword}
                secureTextEntry={!showSecret}
                keyboardType={farmer ? 'number-pad' : 'default'}
                autoComplete={farmer ? 'off' : 'password'}
                maxLength={farmer ? 6 : undefined}
                placeholder={farmer ? '6 numbers' : undefined}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                error={problem?.field === 'secret' ? problem.text : null}
                hint={farmer ? 'Forgot your PIN? Your field agent can give you a new one.' : 'Forgot your password? Ask the admin to set a new one.'}
                accessory={
                  <Pressable
                    onPress={() => setShowSecret((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showSecret ? `Hide the ${secret}` : `Show the ${secret}`}
                    style={styles.eye}
                    hitSlop={6}
                  >
                    {showSecret ? <EyeOff size={22} color={colors.textMuted} /> : <Eye size={22} color={colors.textMuted} />}
                  </Pressable>
                }
              />

              {problem?.field === 'general' ? (
                <View style={styles.problem} accessibilityRole="alert">
                  <AppText style={{ color: colors.red }}>{problem.text}</AppText>
                </View>
              ) : null}

              <Button label={egg === 'hatched' ? 'Welcome!' : 'Sign in'} onPress={() => void submit()} busy={egg === 'busy'} disabled={egg === 'hatched'} />

              <View style={styles.footer}>
                <AppText variant="small" style={styles.footerText}>
                  {look.other}
                </AppText>
                <AppText variant="small" style={styles.footerText}>
                  Wechiau Poultry{version ? ` · version ${version}` : ''}
                  {testServer ? ` · test server ${testServer}` : ''}
                </AppText>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** One line before signing in: can this phone reach the server? */
function Connection({ state, onRetry }: { state: 'checking' | 'ok' | 'offline'; onRetry(): void }) {
  if (state === 'checking') {
    return (
      <AppText variant="small" style={styles.footerText}>
        Checking the connection…
      </AppText>
    );
  }
  const ok = state === 'ok';
  return (
    <View style={[styles.connection, { backgroundColor: ok ? colors.greenTint : colors.amberTint }]}>
      <View style={[styles.dot, { backgroundColor: ok ? colors.greenStrong : colors.eggButton }]} />
      <AppText variant="small" bold style={{ flex: 1, color: ok ? colors.green : colors.amber }}>
        {ok ? 'Connected to Wechiau' : 'No network. You need it to sign in, this once only.'}
      </AppText>
      {ok ? null : (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <AppText variant="small" bold style={{ color: colors.amber, textDecorationLine: 'underline' }}>
            Try again
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flexGrow: 1 },
  band: { alignItems: 'center', paddingTop: 28, paddingBottom: 26, paddingHorizontal: 24, gap: 8 },
  title: { color: colors.white, fontSize: 30, marginTop: 6 },
  subtitle: { color: colors.white, textAlign: 'center', opacity: 0.95 },
  sheet: {
    flexGrow: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.card + 10,
    borderTopRightRadius: radii.card + 10,
    padding: 22,
    paddingTop: 24,
    gap: 16,
  },
  eye: { minWidth: touch.minTarget, minHeight: touch.minTarget, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  problem: { borderRadius: radii.input, backgroundColor: colors.redTint, padding: 12 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.input, paddingHorizontal: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  footer: { marginTop: 'auto', paddingTop: 12, gap: 4, alignItems: 'center' },
  footerText: { color: colors.textMuted, textAlign: 'center' },
});
