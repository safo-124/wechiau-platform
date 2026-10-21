import type { Language } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import * as Location from 'expo-location';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { LANGUAGE_LABELS } from '@/format';
import {
  validateFarmerForm,
  type FarmerFormData,
  type FarmerFormField,
  type FarmerFormValues,
} from '@/forms/farmer-form';
import { OFFLINE_MESSAGE } from '@/sync/errors';
import { AppText } from './AppText';
import { Button } from './Button';
import { ChipGroup } from './ChipGroup';
import { TextField } from './TextField';

const LANGUAGE_OPTIONS = (Object.keys(LANGUAGE_LABELS) as Language[]).map((value) => ({ value, label: LANGUAGE_LABELS[value] }));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

interface FarmerFormProps {
  initial: FarmerFormValues;
  submitLabel: string;
  /** Saves the checked form. Returns a message to show if saving failed, or null. */
  onSubmit(data: FarmerFormData): string | null;
}

/** Farmer details, for registering and for editing. Works with no network; GPS needs none either. */
export function FarmerForm({ initial, submitLabel, onSubmit }: FarmerFormProps) {
  const [values, setValues] = useState<FarmerFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<FarmerFormField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const set = <K extends keyof FarmerFormValues>(key: K) => (value: FarmerFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function captureLocation() {
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('Location permission was not given. You can add the location later.');
        return;
      }
      const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 30_000);
      set('location')({ lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) });
    } catch {
      setLocationError('Could not get the location. Stand outside and try again, or add it later.');
    } finally {
      setLocating(false);
    }
  }

  function submit() {
    const result = validateFarmerForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError('Please check the fields marked in red.');
      return;
    }
    setErrors({});
    setFormError(onSubmit(result.data));
  }

  return (
    <>
      <TextField label="Name" value={values.name} onChangeText={set('name')} error={errors.name} autoCapitalize="words" />
      <TextField
        label="Phone number"
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        placeholder="024 123 4567"
        hint="Receipts and reminders go to this number."
      />
      <ChipGroup<Language>
        label="Language"
        options={LANGUAGE_OPTIONS}
        value={values.language}
        onChange={set('language')}
        error={errors.language}
      />
      <TextField
        label="Number of birds now"
        value={values.birds}
        onChangeText={set('birds')}
        error={errors.birds}
        keyboardType="number-pad"
      />
      <TextField label="Landmark (optional)" value={values.landmark} onChangeText={set('landmark')} placeholder="near the borehole" />
      <TextField
        label="Digital address (optional)"
        value={values.address}
        onChangeText={set('address')}
        error={errors.address}
        autoCapitalize="characters"
        placeholder="XX-000-0001"
        hint="GhanaPostGPS address, if the farmer has one."
      />

      <View style={styles.box}>
        <AppText variant="label">Farm location</AppText>
        {values.location ? (
          <AppText style={{ color: tones.good.text }}>
            Saved: {values.location.lat}, {values.location.lng}
          </AppText>
        ) : (
          <AppText variant="small" muted>
            Stand at the farm and tap below. Directions use this.
          </AppText>
        )}
        {locationError ? (
          <AppText variant="small" style={{ color: colors.red }}>
            {locationError}
          </AppText>
        ) : null}
        <Button
          label={values.location ? 'Save the location again' : 'Save farm location'}
          kind="secondary"
          size="small"
          busy={locating}
          onPress={() => void captureLocation()}
        />
      </View>

      <View style={[styles.box, styles.consent]}>
        <View style={styles.consentText}>
          <AppText variant="label">Voice recordings for research</AppText>
          <AppText variant="small" muted>
            The farmer agrees, after it was explained in their language, that their voice reports may be used to train
            the Dagaare speech model.
          </AppText>
        </View>
        <Switch
          value={values.consent}
          onValueChange={set('consent')}
          accessibilityLabel="Farmer agrees to recordings being used"
        />
      </View>

      {formError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.red }}>
          {formError}
        </AppText>
      ) : null}
      <Button label={submitLabel} onPress={submit} />
      <AppText variant="small" muted>
        {OFFLINE_MESSAGE}
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 8 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  consentText: { flex: 1, gap: 4 },
});
