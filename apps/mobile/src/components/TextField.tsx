import { colors, fonts, radii } from '@wechiau/ui/theme';
import type { ReactNode, Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { AppText } from './AppText';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Inside the box on the right, for example a show-password button. */
  accessory?: ReactNode;
  inputRef?: Ref<TextInputInstance>;
}

export function TextField({ label, error, hint, accessory, inputRef, ...input }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <View style={[styles.box, error ? styles.boxError : null]}>
        <TextInput {...input} ref={inputRef} accessibilityLabel={label} placeholderTextColor={colors.textMuted} style={styles.input} />
        {accessory}
      </View>
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  boxError: { borderColor: colors.red },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.text,
  },
  error: { color: colors.red },
});
