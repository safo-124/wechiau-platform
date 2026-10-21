import { colors, touch } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';

export function BackLink({ label = 'Back' }: { label?: string }) {
  return (
    <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.link}>
      <AppText variant="bodyLarge" bold style={{ color: colors.green }}>
        ‹ {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: touch.minTarget, justifyContent: 'center', alignSelf: 'flex-start' },
});
