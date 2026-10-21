import { colors, radii, touch } from '@wechiau/ui/theme';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';

type Kind = 'primary' | 'secondary' | 'egg' | 'danger';

const KINDS: Record<Kind, { background: string; text: string; border: string; pressed: string }> = {
  primary: { background: colors.green, text: colors.white, border: colors.green, pressed: colors.greenPressed },
  secondary: { background: colors.white, text: colors.green, border: colors.border, pressed: colors.greenTint },
  egg: { background: colors.eggButton, text: colors.eggButtonText, border: colors.eggButton, pressed: '#B37A14' },
  danger: { background: colors.red, text: colors.white, border: colors.red, pressed: '#932B21' },
};

interface ButtonProps {
  label: string;
  onPress(): void;
  kind?: Kind;
  /** `main` actions are 64 tall (design rule); `small` ones 48. */
  size?: 'main' | 'small';
  disabled?: boolean;
  busy?: boolean;
}

export function Button({ label, onPress, kind = 'primary', size = 'main', disabled, busy }: ButtonProps) {
  const look = KINDS[kind];
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        size === 'main' ? styles.main : styles.small,
        { backgroundColor: pressed ? look.pressed : look.background, borderColor: look.border },
        inactive && styles.inactive,
      ]}
    >
      {busy ? <ActivityIndicator color={look.text} /> : null}
      <AppText variant={size === 'main' ? 'bodyLarge' : 'body'} bold style={{ color: look.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.card,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  main: { minHeight: touch.mainAction },
  small: { minHeight: 48, borderRadius: radii.tile },
  inactive: { opacity: 0.55 },
});
