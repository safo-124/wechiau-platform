import { colors, radii } from '@wechiau/ui/theme';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const;

/** Big number keys for PIN entry (touch targets well above 44 px). */
export function NumberPad({ onDigit, onBack }: { onDigit(digit: string): void; onBack(): void }) {
  return (
    <View style={styles.grid}>
      {KEYS.map((key, index) =>
        key === '' ? (
          <View key={index} style={styles.key} />
        ) : (
          <Pressable
            key={index}
            onPress={() => (key === 'back' ? onBack() : onDigit(key))}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Delete last number' : key}
            style={({ pressed }) => [styles.key, styles.button, pressed && styles.pressed]}
          >
            <AppText bold style={styles.label}>
              {key === 'back' ? '⌫' : key}
            </AppText>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  key: { width: '31%', height: 68, alignItems: 'center', justifyContent: 'center' },
  button: { borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  pressed: { backgroundColor: colors.greenTint },
  label: { fontSize: 28, color: colors.text },
});
