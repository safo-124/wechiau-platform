import { ROLE_LABELS } from '@wechiau/shared';
import { colors, radii, tones, touch } from '@wechiau/ui/theme';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession, useSignedIn } from '@/auth/session';
import { appVariant, VARIANT_TITLES } from '@/config';
import { describeSync } from '@/sync/describe';
import { useSync } from '@/sync/SyncProvider';
import { AppText } from './AppText';
import { LogOut, RefreshCw } from './icons';

const CIRCLE = { field: colors.green, vet: colors.blue, farmer: colors.eggButton } as const;

/**
 * The person's initial in the header. It opens a small menu: who is signed
 * in, sync details with "Sync now", and "Sign out", which warns first if
 * changes haven't reached the server yet.
 */
export function AccountMenu() {
  const { user } = useSignedIn();
  const { signOut } = useSession();
  const sync = useSync();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const summary = describeSync(sync);
  const version = Constants.expoConfig?.version;

  function confirmSignOut() {
    setOpen(false);
    if (sync.pending === 0) {
      void signOut();
      return;
    }
    Alert.alert(
      'Changes not on the server yet',
      `${sync.pending} change${sync.pending === 1 ? ' is' : 's are'} only on this phone. They will be sent after you sign in again.`,
      [
        { text: 'Stay signed in', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${user.name}: account and sync`}
        hitSlop={6}
        style={({ pressed }) => [styles.initial, { backgroundColor: CIRCLE[appVariant] }, pressed && { opacity: 0.8 }]}
      >
        <AppText bold style={styles.initialText}>
          {user.name.trim().slice(0, 1).toUpperCase()}
        </AppText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close the menu">
          <Pressable style={[styles.menu, { top: insets.top + 64 }]} onPress={() => undefined} accessibilityViewIsModal>
            <View>
              <AppText variant="bodyLarge" bold>
                {user.name}
              </AppText>
              <AppText variant="small" muted>
                {ROLE_LABELS[user.role]} · {VARIANT_TITLES[appVariant]}
              </AppText>
            </View>

            <View style={[styles.status, { backgroundColor: tones[summary.tone].background }]}>
              <AppText variant="small" bold style={{ color: tones[summary.tone].text }}>
                {summary.title}
              </AppText>
              <AppText variant="small" style={{ color: tones[summary.tone].text }}>
                {summary.detail}
              </AppText>
            </View>

            <Pressable
              onPress={() => void sync.syncNow()}
              disabled={sync.running}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <RefreshCw size={20} color={colors.green} />
              <AppText bold style={{ color: colors.green }}>
                {sync.running ? 'Syncing…' : 'Sync now'}
              </AppText>
            </Pressable>
            <Pressable onPress={confirmSignOut} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <LogOut size={20} color={colors.red} />
              <AppText bold style={{ color: colors.red }}>
                Sign out
              </AppText>
            </Pressable>

            <AppText variant="small" muted>
              Wechiau Poultry{version ? ` · version ${version}` : ''}
            </AppText>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: colors.white, fontSize: 18 },
  backdrop: { flex: 1, backgroundColor: 'rgba(27, 42, 33, 0.25)' },
  menu: {
    position: 'absolute',
    right: 16,
    width: 280,
    maxWidth: '90%',
    borderRadius: radii.card,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  status: { borderRadius: radii.input, padding: 10, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.minTarget, paddingHorizontal: 4, borderRadius: radii.input },
  rowPressed: { backgroundColor: colors.neutralTint },
});
