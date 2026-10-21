import { colors, spacing } from '@wechiau/ui/theme';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appVariant } from '@/config';
import { BottomNav, FIELD_NAV, VET_NAV } from './BottomNav';

/** A screen with the bottom navigation bar of this app (field or vet). */
export function TabScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <BottomNav items={appVariant === 'vet' ? VET_NAV : FIELD_NAV} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: spacing.screenPadding, gap: 14 },
});
