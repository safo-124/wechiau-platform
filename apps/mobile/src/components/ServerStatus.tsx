import { colors, radii, tones, touch, type Tone } from '@wechiau/ui/theme';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { checkServer, type ServerCheck } from '@/api/health';
import { apiUrl } from '@/config';
import { AppText } from './AppText';

const TEXT: Record<ServerCheck['state'] | 'checking', { title: string; tone: Tone }> = {
  checking: { title: 'Checking the server…', tone: 'neutral' },
  ok: { title: 'Connected to the server', tone: 'good' },
  degraded: { title: 'Server is up, but its database is not', tone: 'comingUp' },
  unreachable: { title: "Can't reach the server", tone: 'problem' },
};

/** Shows whether this phone can reach the server (GET /api/health). */
export function ServerStatus() {
  const [check, setCheck] = useState<ServerCheck | null>(null);

  const run = useCallback(async () => {
    setCheck(null);
    setCheck(await checkServer());
  }, []);

  useEffect(() => {
    let live = true;
    void checkServer().then((result) => {
      if (live) setCheck(result);
    });
    return () => {
      live = false;
    };
  }, []);

  const { title, tone } = TEXT[check?.state ?? 'checking'];
  const colorsForTone = tones[tone];
  const detail =
    check === null
      ? apiUrl
      : check.state === 'unreachable'
        ? `${check.error} Address: ${apiUrl}`
        : `Version ${check.health.version} · database ${check.health.database}`;

  return (
    <View style={[styles.card, { backgroundColor: colorsForTone.background }]} accessibilityLiveRegion="polite">
      <AppText variant="bodyLarge" bold style={{ color: colorsForTone.text }}>
        {title}
      </AppText>
      <AppText variant="small" style={{ color: colorsForTone.text }}>
        {detail}
      </AppText>
      <Pressable
        onPress={run}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <AppText variant="label" style={styles.buttonText}>
          Check again
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 6 },
  button: {
    marginTop: 6,
    minHeight: touch.minTarget,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: colors.green,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.greenTint },
  buttonText: { color: colors.green },
});
