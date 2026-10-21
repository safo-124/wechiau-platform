import { radii, tones, type Tone } from '@wechiau/ui/theme';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

/** A coloured tile with a big number and a line under it (design: Today, Cash, Farmer). */
export function StatTile({ value, label, tone, onPress }: { value: string; label: string; tone: Tone; onPress?(): void }) {
  const look = tones[tone];
  const content = (
    <>
      <AppText bold style={[styles.value, { color: look.text }]}>
        {value}
      </AppText>
      <AppText variant="small" style={{ color: look.text }}>
        {label}
      </AppText>
    </>
  );
  if (!onPress) return <View style={[styles.tile, { backgroundColor: look.background }]}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.tile, { backgroundColor: look.background }]}>
      {content}
    </Pressable>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** A small coloured label: "Not synced", "Owes GHS 104". */
export function Tag({ label, tone }: { label: string; tone: Tone }) {
  const look = tones[tone];
  return (
    <View style={[styles.tag, { backgroundColor: look.background }]}>
      <AppText variant="small" bold style={{ color: look.text }}>
        {label}
      </AppText>
    </View>
  );
}

/** A box of plain information (design: neutral info boxes). */
export function InfoBox({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <View style={[styles.info, { backgroundColor: tones[tone].background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: radii.tile, padding: 12, gap: 2 },
  value: { fontSize: 22 },
  tag: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  info: { borderRadius: radii.tile, padding: 14, gap: 4 },
});
