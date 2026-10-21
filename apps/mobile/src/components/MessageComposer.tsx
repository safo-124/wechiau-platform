import { colors, radii } from '@wechiau/ui/theme';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import type { Outgoing } from '@/chat/send';
import type { RecordedVoice } from '@/uploads/voice';
import { AppText } from './AppText';
import { Button } from './Button';
import { TextField } from './TextField';
import { VoiceRecorder } from './VoiceRecorder';

/**
 * Record a voice message or type one, then send (farmer chat and vet replies).
 * `send` saves on the phone; it goes when there is network.
 */
export function MessageComposer({ send, placeholder, sendLabel = 'Send' }: { send(outgoing: Outgoing): void; placeholder: string; sendLabel?: string }) {
  const [voice, setVoice] = useState<RecordedVoice | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    try {
      send({ voice, text });
      setVoice(null);
      setText('');
      setError(null);
    } catch (e) {
      setError(e instanceof ZodError ? (e.issues[0]?.message ?? 'Not saved.') : e instanceof Error ? e.message : 'Not saved.');
    }
  }

  return (
    <View style={styles.box}>
      <VoiceRecorder value={voice} onChange={setVoice} size="small" />
      <TextField label="Or write it" value={text} onChangeText={setText} multiline placeholder={placeholder} maxLength={2000} />
      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.red }}>
          {error}
        </AppText>
      ) : null}
      <Button label={sendLabel} onPress={submit} disabled={!voice && !text.trim()} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 12 },
});
