import { uploadRef } from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatSeconds } from '@/format';
import { discardVoice, doneRecording, getReadyToRecord, keepRecording, MAX_VOICE_SECONDS, VOICE_RECORDING, type RecordedVoice } from '@/uploads/voice';
import { AppText } from './AppText';
import { Button } from './Button';
import { Mic, Square } from './icons';
import { VoicePlayer } from './VoicePlayer';

/**
 * Records a voice note (design: farmer-app/Report): one big round button to
 * start and stop, the time while recording, then listen or record again.
 * The note is kept on the phone and goes up after its message syncs.
 */
export function VoiceRecorder({
  value,
  onChange,
  size = 'large',
}: {
  value: RecordedVoice | null;
  onChange(voice: RecordedVoice | null): void;
  size?: 'large' | 'small';
}) {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const state = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);
  const stopping = useRef(false);

  async function start() {
    setError(null);
    try {
      await getReadyToRecord();
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start recording.');
    }
  }

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    const seconds = state.durationMillis / 1000;
    try {
      await recorder.stop();
      await doneRecording();
      const uri = recorder.uri;
      if (!uri || seconds < 1) {
        setError('That was too short. Tap the button, speak, then tap it again.');
        return;
      }
      if (value) discardVoice(value.id);
      onChange(keepRecording(uri, seconds));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the recording.');
    } finally {
      stopping.current = false;
    }
  }

  // Stops by itself at the longest length allowed.
  const tooLong = state.isRecording && state.durationMillis >= MAX_VOICE_SECONDS * 1000;
  useEffect(() => {
    // stop() changes state only after the recorder has stopped (asynchronously), not during this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tooLong) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop reads the latest state when it runs
  }, [tooLong]);

  if (value && !state.isRecording) {
    return (
      <View style={styles.done}>
        <VoicePlayer value={uploadRef(value.id)} seconds={Math.round(value.seconds)} />
        <Button
          label="Record again"
          kind="secondary"
          size="small"
          onPress={() => {
            discardVoice(value.id);
            onChange(null);
          }}
        />
      </View>
    );
  }

  const recording = state.isRecording;
  const big = size === 'large';
  return (
    <View style={styles.center}>
      <Pressable
        onPress={() => void (recording ? stop() : start())}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
        style={({ pressed }) => [
          big ? styles.circle : styles.circleSmall,
          recording ? styles.recording : styles.idle,
          pressed && { opacity: 0.85 },
        ]}
      >
        {recording ? <Square size={big ? 44 : 26} color={colors.white} fill={colors.white} /> : <Mic size={big ? 56 : 30} color={colors.red} />}
      </Pressable>
      <AppText variant={big ? 'bodyLarge' : 'body'} bold style={{ color: colors.red }}>
        {recording ? `Stop recording · ${formatSeconds(state.durationMillis / 1000)}` : 'Start recording'}
      </AppText>
      {recording ? (
        <AppText variant="small" muted>
          Up to {MAX_VOICE_SECONDS / 60} minutes
        </AppText>
      ) : null}
      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.red }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 10 },
  done: { gap: 10 },
  circle: { width: 150, height: 150, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  circleSmall: { width: 72, height: 72, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  idle: { backgroundColor: colors.redTint, borderWidth: 4, borderColor: colors.red },
  recording: { backgroundColor: colors.red, borderWidth: 6, borderColor: colors.redRing },
});
