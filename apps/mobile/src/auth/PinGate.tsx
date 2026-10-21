import { colors } from '@wechiau/ui/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { NumberPad } from '@/components/NumberPad';
import { Screen } from '@/components/Screen';
import { firstName } from '@/format';
import { checkPin, clearPin, hasPin, setPin } from './pin';
import { MAX_PIN_FAILURES, PIN_LENGTH, pinProblem, shouldLock } from './pin-rules';
import { useSession, useSignedIn } from './session';

type GateState = 'checking' | 'choose' | 'confirm' | 'locked' | 'open';

/**
 * Asks for the device PIN when the app opens and after it has been in the
 * background a while (v0.3 Phase 1 step 6). The first time after signing in,
 * the person chooses a PIN.
 */
export function PinGate({ children }: { children: ReactNode }) {
  const { user } = useSignedIn();
  const { signOut } = useSession();
  const [state, setState] = useState<GateState>('checking');
  const [entry, setEntry] = useState('');
  const [chosen, setChosen] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    void hasPin().then((exists) => setState(exists ? 'locked' : 'choose'));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgroundedAt.current = Date.now();
      if (next === 'active') {
        if (shouldLock(backgroundedAt.current, Date.now())) {
          setEntry('');
          setMessage(null);
          setState((current) => (current === 'open' ? 'locked' : current));
        }
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  async function complete(pin: string) {
    if (state === 'choose') {
      const problem = pinProblem(pin);
      if (problem) {
        setMessage(problem);
        setEntry('');
        return;
      }
      setChosen(pin);
      setEntry('');
      setMessage(null);
      setState('confirm');
    } else if (state === 'confirm') {
      if (pin !== chosen) {
        setMessage("The two PINs didn't match. Choose your PIN again.");
        setEntry('');
        setChosen('');
        setState('choose');
        return;
      }
      await setPin(pin);
      setEntry('');
      setMessage(null);
      setState('open');
    } else if (state === 'locked') {
      const result = await checkPin(pin);
      setEntry('');
      if (result.ok) {
        setMessage(null);
        setState('open');
      } else if (result.failures >= MAX_PIN_FAILURES) {
        await clearPin();
        await signOut('Too many wrong PINs. Sign in with your password, then choose a new PIN.');
      } else {
        const left = MAX_PIN_FAILURES - result.failures;
        setMessage(`Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before you need your password.`);
      }
    }
  }

  function press(digit: string) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + digit;
    setEntry(next);
    if (next.length === PIN_LENGTH) void complete(next);
  }

  async function forgot() {
    await clearPin();
    await signOut('Sign in with your password, then choose a new PIN.');
  }

  if (state === 'open') return <>{children}</>;
  if (state === 'checking') return null;

  const title =
    state === 'choose' ? 'Choose a PIN' : state === 'confirm' ? 'Type the PIN again' : `Welcome back, ${firstName(user.name)}`;
  const subtitle =
    state === 'locked' ? 'Enter your PIN to open the app.' : `${PIN_LENGTH} numbers you will type each time you open the app.`;

  return (
    <Screen scroll={false}>
      <View style={styles.top}>
        <AppText variant="title">{title}</AppText>
        <AppText muted>{subtitle}</AppText>
        <View style={styles.dots} accessibilityLabel={`${entry.length} of ${PIN_LENGTH} numbers entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View key={i} style={[styles.dot, i < entry.length && styles.dotFilled]} />
          ))}
        </View>
        {message ? (
          <AppText accessibilityRole="alert" style={styles.message}>
            {message}
          </AppText>
        ) : null}
      </View>
      <NumberPad onDigit={press} onBack={() => setEntry((e) => e.slice(0, -1))} />
      {state === 'locked' ? <Button label="Forgot PIN? Sign in with password" kind="secondary" size="small" onPress={() => void forgot()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flex: 1, gap: 10, justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 18, justifyContent: 'center', marginVertical: 18 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.green },
  dotFilled: { backgroundColor: colors.green },
  message: { color: colors.red, textAlign: 'center' },
});
