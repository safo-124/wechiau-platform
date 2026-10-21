import { colors, fontSizes, radii, tones, type Tone } from '@wechiau/ui/theme';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

interface StepperProps {
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  /** Under the number, for example "crates of 30 eggs". */
  unit: string;
  tone?: Tone;
  /** What one step is, for screen readers: "crate". */
  stepLabel: string;
}

/** The design's big plus and minus (field-app/Collect, Sale; vet-app/Vaccinate). */
export function Stepper({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, unit, tone = 'comingUp', stepLabel }: StepperProps) {
  const look = tones[tone];
  const minusBorder = tone === 'money' ? colors.blueBorder : tone === 'comingUp' ? colors.amberBorder : colors.border;
  const canLower = value > min;
  const canRaise = value < max;
  return (
    <View style={[styles.box, { backgroundColor: look.background }]}>
      <Pressable
        onPress={() => canLower && onChange(value - 1)}
        disabled={!canLower}
        accessibilityRole="button"
        accessibilityLabel={`One ${stepLabel} less`}
        style={[styles.button, styles.minus, { borderColor: minusBorder }, !canLower && styles.disabled]}
      >
        <AppText style={[styles.sign, { color: look.text }]}>−</AppText>
      </Pressable>
      <View style={styles.middle} accessibilityLiveRegion="polite">
        <AppText bold style={[styles.number, { color: look.text }]}>
          {value}
        </AppText>
        <AppText variant="label" style={{ color: look.text }}>
          {unit}
        </AppText>
      </View>
      <Pressable
        onPress={() => canRaise && onChange(value + 1)}
        disabled={!canRaise}
        accessibilityRole="button"
        accessibilityLabel={`One ${stepLabel} more`}
        style={[styles.button, { backgroundColor: look.text }, !canRaise && styles.disabled]}
      >
        <AppText style={[styles.sign, { color: colors.white }]}>+</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.card, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { width: 64, height: 64, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
  minus: { backgroundColor: colors.white, borderWidth: 1.5 },
  disabled: { opacity: 0.4 },
  sign: { fontSize: 30, fontWeight: '700', lineHeight: 34 },
  middle: { alignItems: 'center' },
  number: { fontSize: fontSizes.numberLarge, lineHeight: fontSizes.numberLarge + 4 },
});
