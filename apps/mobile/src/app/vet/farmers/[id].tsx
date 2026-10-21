import { colors } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { CaseTag } from '@/components/CaseTag';
import { ChevronRight } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { StatTile, TileRow } from '@/components/Tiles';
import { UploadImage } from '@/components/UploadImage';
import {
  useCaseSummaries,
  useFarmerCases,
  useFarmerCounts,
  useFarmers,
  useFarmerVaccinations,
  useFarmerVisits,
  useRounds,
  useUsers,
  useVetAssignments,
} from '@/data/hooks';
import { currentVets } from '@wechiau/shared';
import { formatSyncTime } from '@/format';
import { callPhone, openDirections } from '@/linking';

/** A farm's health history for vets (v0.3 Phase 3 step 4): counts, deaths per visit, vaccinations by round, cases. */
export default function VetFarmer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const farmer = useFarmers().find((f) => f.id === id);
  const counts = useFarmerCounts(id);
  const visits = useFarmerVisits(id);
  const vaccinations = useFarmerVaccinations(id);
  const cases = useFarmerCases(id);
  const rounds = useRounds();
  const users = useUsers();
  const summaries = useCaseSummaries();
  const vetId = currentVets(useVetAssignments()).get(id) ?? null;

  if (!farmer) {
    return (
      <Screen>
        <BackLink />
        <AppText>This farmer is not on this phone.</AppText>
      </Screen>
    );
  }

  const verified = counts.find((c) => c.kind === 'verified');
  const reported = counts.find((c) => c.kind === 'reported');
  const deathsTotal = visits.reduce((n, v) => n + (v.deaths ?? 0), 0);

  return (
    <Screen>
      <BackLink label="Farmers" />
      <AppText variant="title">{farmer.name}</AppText>
      <AppText muted>
        Vet: {vetId ? (users.find((u) => u.id === vetId)?.name ?? 'a vet') : 'not assigned yet'}
        {farmer.landmark ? ` · ${farmer.landmark}` : ''}
      </AppText>

      <TileRow>
        <StatTile tone="good" value={verified ? String(verified.count) : '–'} label="Birds (checked)" />
        <StatTile
          tone={reported && verified && (reported.count ?? 0) < (verified.count ?? 0) ? 'problem' : 'neutral'}
          value={reported ? String(reported.count) : '–'}
          label="Birds (farmer says)"
        />
        <StatTile tone={deathsTotal ? 'problem' : 'neutral'} value={String(deathsTotal)} label="Deaths seen on visits" />
      </TileRow>

      <View style={styles.pair}>
        <View style={styles.half}>
          <Button label="Open a case" size="small" onPress={() => router.push({ pathname: '/vet/cases/new', params: { farmerId: farmer.id } })} />
        </View>
        <View style={styles.half}>
          <Button label="Call" kind="secondary" size="small" disabled={!farmer.phone} onPress={() => callPhone(farmer.phone!)} />
        </View>
        <View style={styles.half}>
          <Button
            label="Directions"
            kind="secondary"
            size="small"
            disabled={farmer.lat == null || farmer.lng == null}
            onPress={() => openDirections(farmer.lat!, farmer.lng!, farmer.name ?? 'Farm')}
          />
        </View>
        <View style={styles.half}>
          <Button
            label="Messages"
            kind="secondary"
            size="small"
            onPress={() => router.push({ pathname: '/vet/messages/[farmerId]', params: { farmerId: farmer.id } })}
          />
        </View>
      </View>

      <Section title="Cases">
        {cases.length === 0 ? <AppText muted>No cases.</AppText> : null}
        {cases.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: '/vet/cases/[id]', params: { id: c.id } })}
            accessibilityRole="button"
            style={styles.row}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <AppText bold>{summaries.get(c.id) ?? 'Problem reported'}</AppText>
              <AppText variant="small" muted>
                {formatSyncTime(c.created_at)}
              </AppText>
            </View>
            <CaseTag status={c.status} triage={c.triage} suggested={c.triage_suggested} />
            <ChevronRight size={22} color={colors.textMuted} />
          </Pressable>
        ))}
      </Section>

      <Section title="Vaccinations">
        {vaccinations.length === 0 ? <AppText muted>None yet.</AppText> : null}
        {vaccinations.map((v) => (
          <View key={v.id} style={styles.row}>
            <AppText style={{ flex: 1 }}>
              Round {rounds.find((r) => r.id === v.round_id)?.number ?? '?'}: {v.birds_vaccinated} birds
            </AppText>
            <AppText variant="small" muted>
              {formatSyncTime(v.vaccinated_at ?? '')} · {users.find((u) => u.id === v.vet_id)?.name ?? 'vet'}
            </AppText>
          </View>
        ))}
      </Section>

      <Section title="Visits">
        {visits.length === 0 ? <AppText muted>No visits yet.</AppText> : null}
        {visits.map((v) => (
          <View key={v.id} style={styles.visit}>
            <AppText bold>
              {formatSyncTime(v.visited_at ?? '')} · {v.deaths ?? 0} died
            </AppText>
            {v.suspected_cause ? <AppText variant="small">Suspected: {v.suspected_cause}</AppText> : null}
            {v.notes ? (
              <AppText variant="small" muted>
                {v.notes}
              </AppText>
            ) : null}
            <UploadImage value={v.photo_uri} label={`Photo from the visit on ${formatSyncTime(v.visited_at ?? '')}`} />
          </View>
        ))}
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" muted>
        {title}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  section: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.divider },
  visit: { gap: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
