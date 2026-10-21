import { uploadRef } from '@wechiau/shared';
import { colors } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ZodError } from 'zod';
import { sendFarmerReport } from '@/chat/send';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { InfoBox } from '@/components/Tiles';
import { TextField } from '@/components/TextField';
import { UploadImage } from '@/components/UploadImage';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { useMyFarm } from '@/data/farmer';
import { useRowFactory } from '@/data/hooks';
import { discardPhoto, takePhoto, type TakenPhoto } from '@/uploads/photos';
import type { RecordedVoice } from '@/uploads/voice';
import { useSync } from '@/sync/SyncProvider';
import { Screen } from '@/components/Screen';

/**
 * Report a problem (design: farmer-app/Report): speak, add a photo if it
 * helps, send. It becomes a health case for the farmer's vet, and the vet
 * replies in Messages. Saved on the phone first, so it works with no network.
 */
export default function ReportProblem() {
  const { me, farmerId } = useMyFarm();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const [voice, setVoice] = useState<RecordedVoice | null>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<TakenPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto() {
    try {
      const taken = await takePhoto();
      if (!taken) return;
      if (photo) discardPhoto(photo.id);
      setPhoto(taken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take the photo.');
    }
  }

  function send() {
    try {
      sendFarmerReport(make, { farmerId, farmerUserId: me.id }, { voice, text, photo });
    } catch (e) {
      setError(e instanceof ZodError ? (e.issues[0]?.message ?? 'Not saved.') : e instanceof Error ? e.message : 'Not saved.');
      return;
    }
    requestSync();
    router.replace('/farmer/messages');
  }

  return (
    <Screen>
      <BackLink />
      <View>
        <AppText variant="title">Tell us what is wrong</AppText>
        <AppText muted>Speak in Dagaare, Waale or English</AppText>
      </View>

      <VoiceRecorder value={voice} onChange={setVoice} />

      <TextField label="Or write it" value={text} onChangeText={setText} multiline maxLength={2000} placeholder="My birds are coughing" />

      {photo ? (
        <View style={{ gap: 8 }}>
          <UploadImage value={uploadRef(photo.id)} label="Photo of the problem" />
          <Button label="Take the photo again" kind="secondary" size="small" onPress={() => void addPhoto()} />
        </View>
      ) : (
        <Button label="Add photo" kind="secondary" onPress={() => void addPhoto()} />
      )}

      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.red }}>
          {error}
        </AppText>
      ) : null}
      <Button label="Send" kind="danger" onPress={send} disabled={!voice && !text.trim()} />
      <InfoBox>
        <AppText>A vet will reply in Messages, or call you back.</AppText>
        <AppText variant="small" muted>
          No network? Your message is kept and sent later.
        </AppText>
      </InfoBox>
    </Screen>
  );
}
