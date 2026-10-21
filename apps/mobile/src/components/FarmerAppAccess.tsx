import { colors, radii, tones } from '@wechiau/ui/theme';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { api } from '@/api/client';
import { useSignedIn } from '@/auth/session';
import { useUsers } from '@/data/hooks';
import { displayPhone } from '@/forms/farmer-form';
import { useSync } from '@/sync/SyncProvider';
import { AppText } from './AppText';
import { Button } from './Button';

/**
 * "Farmer app" on the farmer's profile (field app): with the farmer, and with
 * network, the agent gets a 6-digit PIN. The farmer signs in to Wechiau Farmer
 * with their phone number and that PIN. It is shown once; a new PIN signs the
 * old one out, for a lost phone or a forgotten PIN.
 */
export function FarmerAppAccess({ farmerId, name, phone }: { farmerId: string; name: string; phone: string | null }) {
  const { token } = useSignedIn();
  const { requestSync } = useSync();
  const login = useUsers().find((u) => u.role === 'farmer' && u.farmer_id === farmerId && u.status === 'active');
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function give() {
    setBusy(true);
    setError(null);
    try {
      const access = await api.farmerAccess(token, farmerId);
      setPin(access.pin);
      requestSync(); // brings the farmer's login onto this phone
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set up the farmer app.');
    } finally {
      setBusy(false);
    }
  }

  function confirmNewPin() {
    Alert.alert(`Give ${name} a new PIN?`, 'The old PIN stops working, and the farmer app on their phone signs out until they use the new one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New PIN', onPress: () => void give() },
    ]);
  }

  if (pin) {
    return (
      <View style={[styles.box, { backgroundColor: tones.good.background }]}>
        <AppText variant="label" style={{ color: tones.good.text }}>
          PIN for {name}
        </AppText>
        <AppText style={styles.pin} accessibilityLabel={`PIN ${pin.split('').join(' ')}`}>
          {pin.slice(0, 3)} {pin.slice(3)}
        </AppText>
        <AppText style={{ color: tones.good.text }}>
          {name} signs in to Wechiau Farmer with {phone ? displayPhone(phone) : 'their phone number'} and this PIN.
        </AppText>
        <AppText bold style={{ color: tones.good.text }}>
          Write it down for them now. It is not shown again.
        </AppText>
        <Button label="Done" size="small" onPress={() => setPin(null)} />
      </View>
    );
  }

  return (
    <View style={[styles.box, { borderWidth: 1.5, borderColor: colors.border }]}>
      <AppText variant="label">Farmer app</AppText>
      <AppText muted>
        {login
          ? `Set up. ${name} signs in with their phone number and PIN. If they forget it or lose the phone, give a new PIN.`
          : `Not set up yet. Do this with ${name}, where there is network, and help them sign in.`}
      </AppText>
      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.red }}>
          {error}
        </AppText>
      ) : null}
      <Button
        label={login ? 'Give a new PIN' : 'Set up the farmer app'}
        kind="secondary"
        size="small"
        busy={busy}
        onPress={login ? confirmNewPin : () => void give()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.tile, padding: 14, gap: 8 },
  pin: { fontSize: 40, fontWeight: '700', letterSpacing: 6, color: colors.green },
});
