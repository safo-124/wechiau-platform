import { buildVaccination, dosesLeft, isColdChainSafe } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { ReceiptBox } from '@/components/ReceiptBox';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { InfoBox } from '@/components/Tiles';
import { useBatches, useFarmerCounts, useFarmers, useRounds, useRowFactory, useSettings, useStockEntries } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { OFFLINE_MESSAGE } from '@/sync/errors';
import { useSync } from '@/sync/SyncProvider';

/** Record vaccination at one farm (design: vet-app/Vaccinate). One dose per bird. No money on this screen. */
export default function Vaccinate() {
  const { roundId, farmerId } = useLocalSearchParams<{ roundId: string; farmerId: string }>();
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const settings = useSettings();
  const round = useRounds().find((r) => r.id === roundId);
  const farmer = useFarmers().find((f) => f.id === farmerId);
  const counts = useFarmerCounts(farmerId);
  const batches = useBatches();
  const left = dosesLeft(useStockEntries()).byBatch;
  const birdsNow = counts.find((c) => c.kind === 'verified')?.count ?? null;
  const reported = counts.find((c) => c.kind === 'reported');

  const usable = batches.filter((b) => (left.get(b.id) ?? 0) > 0);
  const [birds, setBirds] = useState<number | null>(null);
  const [temp, setTemp] = useState(6);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ smsId: string | null; readingOnly: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!round || !farmer) {
    return (
      <Screen>
        <BackLink />
        <AppText>This farm or round is not on this phone.</AppText>
      </Screen>
    );
  }

  const birdCount = birds ?? birdsNow ?? 0;
  const chosenBatch = usable.find((b) => b.id === (batchId ?? usable[0]?.id));
  const safe = isColdChainSafe(temp, settings.values);
  const enoughDoses = chosenBatch ? (left.get(chosenBatch.id) ?? 0) >= birdCount : false;

  function save() {
    const now = new Date().toISOString();
    if (!safe) {
      // Out of range: record the reading only; the vaccine is not used.
      const reading = make({ temp_c: temp, place: 'farm', farmer_id: farmer!.id, round_id: round!.id, read_at: now });
      saveRecords([{ table: 'cold_chain_reading', row: reading }]);
      requestSync();
      setSaved({ smsId: null, readingOnly: true });
      return;
    }
    if (!chosenBatch) return setError('No vaccine in stock on this phone. Add the batch on the Stock screen.');
    if (birdCount < 1) return setError('How many birds were vaccinated?');
    if (!enoughDoses) return setError(`Batch ${chosenBatch.batch_no} has only ${left.get(chosenBatch.id) ?? 0} doses left.`);
    const rows = buildVaccination(make, {
      farmerId: farmer!.id,
      farmerPhone: farmer!.phone ?? null,
      roundId: round!.id,
      roundNumber: round!.number ?? 0,
      isFree: Boolean(round!.is_free),
      vetId: me.id,
      batchId: chosenBatch.id,
      birds: birdCount,
      tempC: temp,
      now,
    });
    const changes: Parameters<typeof saveRecords>[0] = [
      { table: 'cold_chain_reading', row: rows.reading },
      { table: 'vaccination', row: rows.vaccination },
      { table: 'vaccine_stock_entry', row: rows.used },
    ];
    if (rows.sms) changes.push({ table: 'sms_outbox', row: rows.sms });
    try {
      saveRecords(changes);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    setSaved({ smsId: rows.sms?.id ?? null, readingOnly: false });
  }

  if (saved) {
    return (
      <Screen>
        <AppText variant="title">{saved.readingOnly ? 'Reading saved' : 'Saved'}</AppText>
        {saved.readingOnly ? (
          <InfoBox tone="problem">
            <AppText style={{ color: colors.red }}>
              The vaccine was not used. Gloria is told when this syncs. If the doses are spoiled, mark them wasted on the Stock screen.
            </AppText>
          </InfoBox>
        ) : (
          <AppText muted>
            {birdCount} birds vaccinated at {farmer.name}'s farm.
          </AppText>
        )}
        {saved.smsId ? <ReceiptBox smsId={saved.smsId} farmerName={farmer.name ?? 'the farmer'} /> : null}
        <Button label="Next farm" onPress={() => router.back()} />
      </Screen>
    );
  }

  const look = safe ? tones.good : tones.problem;

  return (
    <Screen>
      <BackLink label="Clinic day" />
      <AppText variant="title">
        {farmer.name} · round {round.number}
      </AppText>
      <AppText muted>
        {birdsNow !== null ? `${birdsNow} birds at the last count` : 'No bird count yet'}
        {reported && birdsNow !== null && (reported.count ?? 0) < birdsNow ? ` · farmer reported ${reported.count}` : ''}
      </AppText>

      <AppText variant="label">Birds vaccinated</AppText>
      <Stepper value={birdCount} onChange={setBirds} min={0} max={9999} unit={birdsNow !== null ? `of ${birdsNow} birds` : 'birds'} tone="good" stepLabel="bird" />

      <View style={[styles.temp, { backgroundColor: look.background }]}>
        <AppText variant="label" style={{ color: look.text }}>
          Cold box at the farm
        </AppText>
        <Stepper value={temp} onChange={setTemp} min={-10} max={40} unit="°C" tone={safe ? 'good' : 'problem'} stepLabel="degree" />
        <AppText bold style={{ color: look.text }}>
          {safe
            ? `Safe (${settings.values.cold_chain_min_c} to ${settings.values.cold_chain_max_c}°C)`
            : 'Out of range. Do not use this vaccine.'}
        </AppText>
      </View>

      {usable.length > 1 ? (
        <ChipGroup
          label="Vaccine batch"
          options={usable.map((b) => ({ value: b.id, label: `${b.batch_no} (${left.get(b.id)} left)` }))}
          value={chosenBatch?.id ?? null}
          onChange={setBatchId}
        />
      ) : chosenBatch ? (
        <AppText variant="small" muted>
          Batch {chosenBatch.batch_no} · {left.get(chosenBatch.id)} doses left · expires {chosenBatch.expiry_on}
        </AppText>
      ) : (
        <InfoBox tone="problem">
          <AppText style={{ color: colors.red }}>No vaccine in stock on this phone. Add the batch on the Stock screen.</AppText>
        </InfoBox>
      )}

      <InfoBox tone="money">
        <AppText bold style={{ color: colors.blue }}>
          {round.is_free ? `Free round: ${birdCount} doses` : `Paid round: ${birdCount} doses`}
        </AppText>
        <AppText variant="small" style={{ color: colors.blue }}>
          {round.is_free ? 'Round 1 is free for farmers.' : 'The price per dose is set by Gloria; payment is recorded by the field team.'} The farmer gets an SMS
          receipt.
        </AppText>
      </InfoBox>

      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label={safe ? 'Save and next farm' : 'Save the reading only'} kind={safe ? 'primary' : 'danger'} onPress={save} />
      <AppText variant="small" muted style={styles.center}>
        {OFFLINE_MESSAGE}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  temp: { borderRadius: radii.tile, padding: 14, gap: 10 },
  center: { textAlign: 'center' },
});
