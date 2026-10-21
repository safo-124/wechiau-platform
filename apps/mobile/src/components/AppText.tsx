import { colors, fonts, fontSizes } from '@wechiau/ui/theme';
import { StyleSheet, Text, type TextProps } from 'react-native';

type Variant = 'title' | 'body' | 'bodyLarge' | 'label' | 'small';

interface AppTextProps extends TextProps {
  variant?: Variant;
  bold?: boolean;
  muted?: boolean;
}

/** Text in Atkinson Hyperlegible at the design sizes. */
export function AppText({ variant = 'body', bold, muted, style, ...props }: AppTextProps) {
  return (
    <Text
      {...props}
      style={[
        styles.base,
        styles[variant],
        (bold || variant === 'title' || variant === 'label') && styles.bold,
        muted && styles.muted,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: fonts.regular, color: colors.text },
  bold: { fontFamily: fonts.bold },
  muted: { color: colors.textMuted },
  title: { fontSize: fontSizes.title },
  body: { fontSize: fontSizes.body },
  bodyLarge: { fontSize: fontSizes.bodyLarge },
  label: { fontSize: fontSizes.label },
  small: { fontSize: fontSizes.small },
});
