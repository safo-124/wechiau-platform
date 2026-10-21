import { isColdChainSafe } from '@wechiau/shared';
import { radii, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { useRowFactory, useSettings } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

const PLACES = [
  { value: 'pickup', label: 'At pickup' },
  { value: 'storage', label: 'In storage' },
] as const;

/** A cold-box reading away from a farm: picking up vaccine, or checking the store. Each vet logs their own box. */
export default function LogReading() {
  const make = useRowFactory();
  const { requestSync } = useSync();
  const settings = useSettings();
  const [place, setPlace] = useState<(typeof PLACES)[number]['value']>('pickup');
  const [temp, setTemp] = useState(5);
  const safe = isColdChainSafe(temp, settings.values);
  const look = safe ? tones.good : tones.problem;

  function save() {
    saveRecords([
      { table: 'cold_chain_reading', row: make({ temp_c: temp, place, farmer_id: null, round_id: null, read_at: new Date().toISOString() }) },
    ]);
    requestSync();
    router.back();
  }

  return (
    <Screen>
      <BackLink label="Clinic day" />
      <AppText variant="title">Cold box reading</AppText>
      <ChipGroup options={PLACES} value={place} onChange={setPlace} />
      <View style={[styles.box, { backgroundColor: look.background }]}>
        <Stepper value={temp} onChange={setTemp} min={-10} max={40} unit="°C" tone={safe ? 'good' : 'problem'} stepLabel="degree" />
        <AppText bold style={{ color: look.text }}>
          {safe
            ? `Safe (${settings.values.cold_chain_min_c} to ${settings.values.cold_chain_max_c}°C)`
            : 'Out of range. Do not use this vaccine. Gloria is told when this syncs.'}
        </AppText>
      </View>
      <Button label="Save reading" kind={safe ? 'primary' : 'danger'} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.tile, padding: 14, gap: 10 },
});

