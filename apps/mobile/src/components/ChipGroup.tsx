import { colors, touch } from '@wechiau/ui/theme';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

interface ChipGroupProps<T extends string> {
  label?: string;
  options: readonly { value: T; label: string }[];
  value: NoInfer<T> | null;
  onChange(value: NoInfer<T>): void;
  error?: string | null;
}

/** One choice from a few, as large tappable chips (design: filter chips). */
export function ChipGroup<T extends string>({ label, options, value, onChange, error }: ChipGroupProps<T>) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {label ? (
        <AppText variant="label" muted>
          {label}
        </AppText>
      ) : null}
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.chip, selected ? styles.selected : styles.unselected]}
            >
              <AppText variant="label" style={{ color: selected ? colors.white : colors.green }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="small" style={{ color: colors.red }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: touch.minTarget, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, justifyContent: 'center' },
  selected: { backgroundColor: colors.green, borderColor: colors.green },
  unselected: { backgroundColor: colors.white, borderColor: colors.border },
});
