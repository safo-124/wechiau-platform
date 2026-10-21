import { currentVets, farmsInRound, isColdChainSafe, latestReading, localDate } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { Check, ChevronRight } from '@/components/icons';
import { TabScreen } from '@/components/TabScreen';
import { InfoBox, StatTile, TileRow } from '@/components/Tiles';
import {
  useBatches,
  useFarmerCounts,
  useFarmers,
  useHealthCases,
  useReadings,
  useRounds,
  useSettings,
  useUsers,
  useVaccinations,
  useVetAssignments,
} from '@/data/hooks';
import { formatAgo } from '@/format';

/** Clinic day (design: vet-app/Clinic): the round's farms, yours first, and your cold box. */
export default function Clinic() {
  const { user: me } = useSignedIn();
  const rounds = useRounds();
  const farmers = useFarmers();
  const vaccinations = useVaccinations();
  const vets = currentVets(useVetAssignments());
  const users = useUsers();
  const cases = useHealthCases();
  const batches = useBatches();
  const settings = useSettings();
  const myReading = latestReading(useReadings(), me.id);
  const today = useMemo(() => localDate(), []);
  const defaultRound = rounds.find((r) => r.date === today) ?? [...rounds].reverse().find((r) => (r.date ?? '') <= today) ?? rounds[0];
  const [roundId, setRoundId] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const round = rounds.find((r) => r.id === (roundId ?? defaultRound?.id));

  if (!round) {
    return (
      <TabScreen>
        <AppText variant="title">Clinic day</AppText>
        <InfoBox>
          <AppText>No vaccination rounds yet. Gloria schedules rounds in the dashboard; they appear here after the next sync.</AppText>
        </InfoBox>
      </TabScreen>
    );
  }

  const farms = farmsInRound(farmers, vaccinations, vets, round.id);
  const mine = farms.filter((f) => f.vetId === me.id);
  const shown = (scope === 'mine' ? mine : farms).sort((a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)));
  const done = farms.filter((f) => f.done).length;
  const dosesUsed = farms.reduce((n, f) => n + (f.done?.birds ?? 0), 0);
  const nextId = shown.find((f) => !f.done)?.farmerId;
  const readingSafe = myReading?.temp_c != null ? isColdChainSafe(myReading.temp_c, settings.values) : null;
  const vaccineName = batches[0]?.vaccine_name ?? 'vaccine';

  return (
    <TabScreen>
      {rounds.length > 1 ? (
        <ChipGroup options={rounds.map((r) => ({ value: r.id, label: `Round ${r.number}` }))} value={round.id} onChange={setRoundId} />
      ) : null}
      <AppText variant="title">Vaccine round {round.number}</AppText>
      <AppText muted>
        {round.date === today ? 'Today' : round.date} · {round.is_free ? 'free round' : 'paid round'} · {vaccineName}
      </AppText>

      <TileRow>
        <StatTile tone="good" value={`${done} of ${farms.length}`} label="Farms done" />
        <StatTile tone="money" value={String(dosesUsed)} label="Doses used" onPress={() => router.navigate('/vet/stock')} />
      </TileRow>

      <View style={[styles.cold, readingSafe === false && { backgroundColor: tones.problem.background, borderColor: colors.redBorder }]}>
        <View style={{ flex: 1 }}>
          <AppText bold style={readingSafe === false ? { color: colors.red } : undefined}>
            {myReading?.temp_c != null ? `Your cold box ${myReading.temp_c}°C` : 'Your cold box: not checked yet'}
          </AppText>
          <AppText variant="small" muted>
            Safe range {settings.values.cold_chain_min_c} to {settings.values.cold_chain_max_c}°C
            {myReading?.read_at ? ` · checked ${formatAgo(myReading.read_at)}` : ''}
          </AppText>
        </View>
        <Button label="Log" kind="secondary" size="small" onPress={() => router.push('/vet/clinic/reading')} />
      </View>

      <ChipGroup
        options={[
          { value: 'mine', label: `Your farms (${mine.length})` },
          { value: 'all', label: `All farms (${farms.length})` },
        ]}
        value={scope}
        onChange={setScope}
      />
      {shown.length === 0 ? (
        <InfoBox>
          <AppText>{scope === 'mine' ? 'No farms are assigned to you yet. Gloria assigns farmers to vets.' : 'No farms yet.'}</AppText>
        </InfoBox>
      ) : null}
      {shown.map((farm) => (
        <FarmRow
          key={farm.farmerId}
          farmerId={farm.farmerId}
          name={farmers.find((f) => f.id === farm.farmerId)?.name ?? 'Farmer'}
          next={farm.farmerId === nextId}
          openCase={cases.some((c) => c.farmer_id === farm.farmerId && c.status === 'open')}
          vetName={farm.vetId && farm.vetId !== me.id ? (users.find((u) => u.id === farm.vetId)?.name ?? null) : null}
          done={farm.done ? { birds: farm.done.birds, by: farm.done.byVet === me.id ? 'you' : (users.find((u) => u.id === farm.done!.byVet)?.name ?? 'a vet') } : null}
          onPress={() => router.push({ pathname: '/vet/clinic/vaccinate', params: { roundId: round.id, farmerId: farm.farmerId } })}
        />
      ))}
    </TabScreen>
  );
}

function FarmRow(props: {
  farmerId: string;
  name: string;
  next: boolean;
  openCase: boolean;
  vetName: string | null;
  done: { birds: number; by: string } | null;
  onPress(): void;
}) {
  const counts = useFarmerCounts(props.farmerId);
  const birds = counts.find((c) => c.kind === 'verified')?.count ?? null;
  if (props.done) {
    return (
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.greenTint }]}>
          <Check size={18} color={colors.green} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText bold>{props.name}</AppText>
          <AppText variant="small" muted>
            {props.done.birds} vaccinated by {props.done.by}
          </AppText>
        </View>
      </View>
    );
  }
  const details = [birds !== null ? `${birds} birds` : null, props.openCase ? 'open case' : null, props.vetName ? `${props.vetName}'s farm` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" style={[styles.row, props.next && styles.nextRow]}>
      <View style={[styles.badge, { backgroundColor: props.next ? colors.white : colors.neutralTint }]}>
        <AppText bold>{props.name[0]}</AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText bold style={props.next ? { color: colors.amber } : undefined}>
          {props.name}
          {props.next ? ' · next' : ''}
        </AppText>
        <AppText variant="small" style={{ color: props.openCase ? colors.red : colors.textMuted }}>
          {details || 'not started'}
        </AppText>
      </View>
      <ChevronRight size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cold: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingHorizontal: 8 },
  nextRow: { backgroundColor: colors.amberTint, borderRadius: radii.tile, borderBottomWidth: 0 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
