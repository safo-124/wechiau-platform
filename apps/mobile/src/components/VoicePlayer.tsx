import { parseUploadRef } from '@wechiau/shared';
import { colors, radii, touch } from '@wechiau/ui/theme';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { uploadUrl } from '@/api/client';
import { useSession } from '@/auth/session';
import { formatSeconds } from '@/format';
import { localVoice } from '@/uploads/voice';
import { AppText } from './AppText';
import { Pause, Play } from './icons';

/**
 * Plays a voice note from a record's "upload:<id>": the copy on this phone
 * when there is one (works offline), otherwise from the server with the sign-in.
 */
export function VoicePlayer({ value, seconds, tone = 'light' }: { value: string | null | undefined; seconds: number | null; tone?: 'light' | 'dark' }) {
  const { session } = useSession();
  const id = parseUploadRef(value);
  const token = session.status === 'signed_in' ? session.token : null;
  const source = useMemo(() => {
    if (!id) return null;
    const local = localVoice(id);
    if (local.exists) return { uri: local.uri };
    return token ? { uri: uploadUrl(id), headers: { Authorization: `Bearer ${token}` } } : null;
  }, [id, token]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  if (!id) return null;
  const length = seconds ?? (status.duration ? Math.round(status.duration) : null);
  const dark = tone === 'dark';

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
    player.play();
  }

  if (!source) {
    return (
      <AppText variant="small" style={{ color: dark ? colors.white : colors.textMuted }}>
        Voice note{length ? ` ${formatSeconds(length)}` : ''}: it plays once there is network.
      </AppText>
    );
  }

  const shown = status.playing || status.currentTime > 0 ? `${formatSeconds(status.currentTime)} / ${formatSeconds(length ?? 0)}` : `Voice ${formatSeconds(length ?? 0)}`;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause the voice note' : 'Play the voice note'}
        style={({ pressed }) => [styles.button, dark ? styles.buttonDark : styles.buttonLight, pressed && { opacity: 0.8 }]}
      >
        {status.playing ? <Pause size={22} color={dark ? colors.green : colors.white} /> : <Play size={22} color={dark ? colors.green : colors.white} />}
      </Pressable>
      <AppText bold style={{ color: dark ? colors.white : colors.text }}>
        {shown}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { width: touch.minTarget + 4, height: touch.minTarget + 4, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  buttonLight: { backgroundColor: colors.green },
  buttonDark: { backgroundColor: colors.white },
});
