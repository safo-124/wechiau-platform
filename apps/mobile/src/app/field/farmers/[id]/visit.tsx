import { uploadRef } from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import { useFarmerCounts, useFarmers, useRowFactory } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { OFFLINE_MESSAGE } from '@/sync/errors';
import { useSync } from '@/sync/SyncProvider';
import { CameraPermissionError, discardPhoto, takePhoto, type TakenPhoto } from '@/uploads/photos';

/**
 * Log a farm visit (v0.3 Phase 1 step 3). The count is saved as a verified
 * bird count. A photo stays on the phone and goes up after the visit syncs.
 */
export default function LogVisit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const farmer = useFarmers().find((f) => f.id === id);
  const lastCount = useFarmerCounts(id).find((c) => c.kind === 'verified')?.count ?? null;
  const [birds, setBirds] = useState<string | null>(null);
  const [deaths, setDeaths] = useState(0);
  const [cause, setCause] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<TakenPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A photo taken here but never saved with a visit is removed from the phone.
  const unsavedPhoto = useRef<TakenPhoto | null>(null);
  useEffect(() => () => {
    if (unsavedPhoto.current) discardPhoto(unsavedPhoto.current.id);
  }, []);

  const typedBirds = birds ?? (lastCount === null ? '' : String(lastCount));

  async function capture() {
    setPhotoBusy(true);
    setError(null);
    try {
      const taken = await takePhoto();
      if (!taken) return;
      if (photo) discardPhoto(photo.id);
      setPhoto(taken);
      unsavedPhoto.current = taken;
    } catch (e) {
      setError(e instanceof CameraPermissionError ? e.message : 'Could not take the photo. Try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    if (photo) discardPhoto(photo.id);
    setPhoto(null);
    unsavedPhoto.current = null;
  }

  function save() {
    if (!/^\d+$/.test(typedBirds.trim())) return setError('Enter how many birds you counted, as a number.');
    const now = new Date().toISOString();
    const visit = make({
      farmer_id: id,
      visited_at: now,
      deaths,
      suspected_cause: deaths > 0 && cause.trim() ? cause.trim() : null,
      notes: notes.trim() || null,
      photo_uri: photo ? uploadRef(photo.id) : null,
    });
    const count = make({
      farmer_id: id,
      count: Number(typedBirds.trim()),
      kind: 'verified',
      source_type: 'visit',
      source_id: visit.id,
      counted_at: now,
    });
    try {
      saveRecords(
        [
          { table: 'visit', row: visit },
          { table: 'bird_count', row: count },
        ],
        {
          uploads: photo
            ? [{ id: photo.id, table: 'visit', rowId: visit.id, fileUri: photo.uri, contentType: 'image/jpeg' }]
            : [],
        },
      );
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    unsavedPhoto.current = null;
    requestSync();
    router.back();
  }

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">Visit to {farmer?.name ?? 'farm'}</AppText>
      <TextField
        label="Birds counted today"
        value={typedBirds}
        onChangeText={setBirds}
        keyboardType="number-pad"
        hint={lastCount === null ? undefined : `Last count: ${lastCount}`}
      />
      <AppText variant="label" muted>
        Birds that died since the last visit
      </AppText>
      <Stepper value={deaths} onChange={setDeaths} min={0} max={999} unit="deaths" tone="neutral" stepLabel="death" />
      {deaths > 0 ? (
        <TextField label="What do you think caused it? (optional)" value={cause} onChangeText={setCause} placeholder="coughing, heat, a hawk…" />
      ) : null}
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.photoBox}>
        <AppText variant="label">Photo (optional)</AppText>
        {photo ? (
          <>
            <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityLabel="Photo for this visit" />
            <View style={styles.pair}>
              <View style={styles.half}>
                <Button label="Take again" kind="secondary" size="small" busy={photoBusy} onPress={() => void capture()} />
              </View>
              <View style={styles.half}>
                <Button label="Remove photo" kind="secondary" size="small" onPress={removePhoto} />
              </View>
            </View>
          </>
        ) : (
          <>
            <AppText variant="small" muted>
              Sick birds, the pen, the feed: a photo helps the vets. It goes up when there is network.
            </AppText>
            <Button label="Take a photo" kind="secondary" size="small" busy={photoBusy} onPress={() => void capture()} />
          </>
        )}
      </View>

      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Save visit" onPress={save} />
      <AppText variant="small" muted>
        {OFFLINE_MESSAGE} Sick birds? Ask the farmer to report it, or tell the vet: they handle health cases.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoBox: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 10 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.input, backgroundColor: colors.neutralTint },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
