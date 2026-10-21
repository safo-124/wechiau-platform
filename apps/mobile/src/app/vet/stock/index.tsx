import { dosesLeft, isColdChainSafe, isSince, startOfLocalDay } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { TabScreen } from '@/components/TabScreen';
import { TextField } from '@/components/TextField';
import { InfoBox } from '@/components/Tiles';
import { useBatches, useFarmers, useReadings, useRowFactory, useSettings, useStockEntries, useUsers } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

/** Vaccine stock and cold chain (design: vet-app/Stock). Stock is shared by all the vets. */
export default function Stock() {
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const settings = useSettings();
  const batches = useBatches();
  const entries = useStockEntries();
  const readings = useReadings();
  const farmers = useFarmers();
  const users = useUsers();
  const today = useMemo(() => startOfLocalDay(), []);
  const [wasting, setWasting] = useState(false);
  const [wasteBatch, setWasteBatch] = useState<string | null>(null);
  const [wasteDoses, setWasteDoses] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { total, byBatch } = dosesLeft(entries);
  const received = entries.filter((e) => e.reason === 'received').reduce((n, e) => n + (e.doses ?? 0), 0);
  const used = -entries.filter((e) => e.reason === 'used').reduce((n, e) => n + (e.doses ?? 0), 0);
  const wasted = -entries.filter((e) => e.reason === 'wasted').reduce((n, e) => n + (e.doses ?? 0), 0);
  const low = total < settings.values.stock_alert_doses;
  const todays = readings.filter((r) => isSince(r.read_at, today));
  const vaccineName = batches[0]?.vaccine_name ?? 'Vaccine';

  function saveWaste() {
    const batch = wasteBatch ?? batches.find((b) => (byBatch.get(b.id) ?? 0) > 0)?.id;
    const doses = Number(wasteDoses);
    if (!batch) return setError('Choose the batch.');
    if (!Number.isInteger(doses) || doses < 1) return setError('Enter how many doses, as a number.');
    if (doses > (byBatch.get(batch) ?? 0)) return setError('That is more than the doses left in this batch.');
    try {
      saveRecords([{ table: 'vaccine_stock_entry', row: make({ batch_id: batch, doses: -doses, reason: 'wasted', source_type: null, source_id: null }) }]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    setWasting(false);
    setWasteDoses('');
    setError(null);
  }

  return (
    <TabScreen>
      <AppText variant="title">Vaccine and cold chain</AppText>
      <AppText muted>{vaccineName}</AppText>

      <View style={[styles.hero, low && { backgroundColor: tones.problem.background }]}>
        <AppText style={{ color: low ? colors.red : colors.blue }}>Doses left</AppText>
        <AppText bold style={[styles.big, { color: low ? colors.red : colors.blue }]}>
          {total} <AppText style={{ color: low ? colors.red : colors.blue }}>of {received}</AppText>
        </AppText>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${received ? Math.round((total / received) * 100) : 0}%`, backgroundColor: low ? colors.red : colors.blue }]} />
        </View>
        <AppText variant="small" style={{ color: low ? colors.red : colors.blue }}>
          {low ? `Below ${settings.values.stock_alert_doses} doses: order more.` : `Alert when below ${settings.values.stock_alert_doses} doses`}
          {batches[0]?.expiry_on ? ` · first expiry ${batches[0].expiry_on}` : ''}
        </AppText>
      </View>

      <View>
        <Line title="Received" detail={`${batches.length} batch${batches.length === 1 ? '' : 'es'}`} value={`+${received}`} />
        <Line title="Given to birds" detail="All vets, all rounds" value={`−${used}`} />
        {wasted ? <Line title="Wasted" detail="Spoiled or out of range" value={`−${wasted}`} /> : null}
      </View>

      {batches.map((b) => (
        <View key={b.id} style={styles.batch}>
          <View style={{ flex: 1 }}>
            <AppText bold>Batch {b.batch_no}</AppText>
            <AppText variant="small" muted>
              Expires {b.expiry_on}
            </AppText>
          </View>
          <AppText bold>{byBatch.get(b.id) ?? 0} left</AppText>
        </View>
      ))}

      <View style={styles.pair}>
        <View style={styles.half}>
          <Button label="Add vaccine received" kind="secondary" size="small" onPress={() => router.push('/vet/stock/new')} />
        </View>
        <View style={styles.half}>
          <Button label="Mark doses wasted" kind="secondary" size="small" onPress={() => setWasting((w) => !w)} disabled={total === 0} />
        </View>
      </View>
      {wasting ? (
        <InfoBox>
          {batches.length > 1 ? (
            <ChipGroup
              label="Batch"
              options={batches.filter((b) => (byBatch.get(b.id) ?? 0) > 0).map((b) => ({ value: b.id, label: b.batch_no ?? 'Batch' }))}
              value={wasteBatch}
              onChange={setWasteBatch}
            />
          ) : null}
          <TextField label="Doses wasted" value={wasteDoses} onChangeText={setWasteDoses} keyboardType="number-pad" />
          {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
          <Button label="Save" size="small" onPress={saveWaste} />
        </InfoBox>
      ) : null}

      <AppText variant="label" muted>
        Cold box readings today
      </AppText>
      {todays.length === 0 ? (
        <AppText muted>None yet today.</AppText>
      ) : (
        <View style={styles.grid}>
          {todays.map((r) => {
            const safe = r.temp_c != null && isColdChainSafe(r.temp_c, settings.values);
            const look = safe ? tones.good : tones.problem;
            const where = r.place === 'farm' ? `${farmers.find((f) => f.id === r.farmer_id)?.name ?? 'A'}'s farm` : r.place === 'pickup' ? 'Pickup' : 'Storage';
            const who = r.recorded_by === me.id ? 'you' : (users.find((u) => u.id === r.recorded_by)?.name ?? 'a vet');
            return (
              <View key={r.id} style={[styles.reading, { backgroundColor: look.background }]}>
                <AppText bold style={[styles.readingTemp, { color: look.text }]}>
                  {r.temp_c}°C
                </AppText>
                <AppText variant="small" style={{ color: look.text }}>
                  {where} · {who}
                </AppText>
              </View>
            );
          })}
        </View>
      )}
      <AppText variant="small" muted>
        Any reading above {settings.values.cold_chain_max_c}°C turns red and tells Gloria when it syncs.
      </AppText>
    </TabScreen>
  );
}

function Line({ title, detail, value }: { title: string; detail: string; value: string }) {
  return (
    <View style={styles.line}>
      <View style={{ flex: 1 }}>
        <AppText bold>{title}</AppText>
        <AppText variant="small" muted>
          {detail}
        </AppText>
      </View>
      <AppText variant="bodyLarge" bold>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.card, backgroundColor: colors.blueTint, padding: 16, gap: 8 },
  big: { fontSize: 40, lineHeight: 46 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.white, overflow: 'hidden' },
  fill: { height: 10 },
  line: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.divider },
  batch: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 12 },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reading: { width: '48%', borderRadius: radii.tile, padding: 12 },
  readingTemp: { fontSize: 20 },
});
