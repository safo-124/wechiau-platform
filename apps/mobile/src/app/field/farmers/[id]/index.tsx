import { currentVets, formatGhs, isSince, type Language, startOfLocalMonth, sumPesewas } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StatTile, TileRow } from '@/components/Tiles';
import { FarmerAppAccess } from '@/components/FarmerAppAccess';
import { UploadImage } from '@/components/UploadImage';
import { ChevronRight } from '@/components/icons';
import { useSignedIn } from '@/auth/session';
import { ChipGroup } from '@/components/ChipGroup';
import {
  useCollections,
  useFarmerCases,
  useFarmerCounts,
  useFarmers,
  useFarmerVaccinations,
  useFarmerVisits,
  useRowFactory,
  useVetAssignments,
  useVets,
} from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';
import { displayPhone } from '@/forms/farmer-form';
import { formatSyncTime, LANGUAGE_LABELS } from '@/format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TRIAGE_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', urgent: 'Urgent' };

/** Farmer profile (design: field-app/Farmer). Health details belong to the vets and are shown read-only. */
export default function FarmerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const farmer = useFarmers().find((f) => f.id === id);
  const counts = useFarmerCounts(id);
  const cases = useFarmerCases(id);
  const vaccinations = useFarmerVaccinations(id);
  const collections = useCollections();
  const visits = useFarmerVisits(id);
  const month = useMemo(() => startOfLocalMonth(), []);
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const vets = useVets();
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
  const openCase = cases.find((c) => c.status === 'open');
  const thisMonth = collections.filter((c) => c.farmer_id === id && isSince(c.collected_at, month));
  const crates = thisMonth.reduce((n, c) => n + (c.crates ?? 0), 0);
  const paid = sumPesewas(thisMonth.map((c) => c.amount_paid ?? 0));
  const lastVaccination = [...vaccinations].sort((a, b) => (b.vaccinated_at ?? '').localeCompare(a.vaccinated_at ?? ''))[0];
  const joined = farmer.joined_on ? `${MONTHS[Number(farmer.joined_on.slice(5, 7)) - 1]} ${farmer.joined_on.slice(0, 4)}` : '';
  const hasLocation = farmer.lat !== null && farmer.lng !== null;
  const recentCollections = collections.filter((c) => c.farmer_id === id).slice(0, 5);
  const recentVisits = visits.slice(0, 3);

  function directions() {
    const label = encodeURIComponent(farmer!.name ?? 'Farm');
    void Linking.openURL(`geo:${farmer!.lat},${farmer!.lng}?q=${farmer!.lat},${farmer!.lng}(${label})`);
  }

  return (
    <Screen>
      <BackLink label="Farmers" />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <AppText bold style={styles.initial}>
            {farmer.name?.[0] ?? '?'}
          </AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{farmer.name}</AppText>
          <AppText variant="small" muted>
            Member since {joined}
            {farmer.language ? ` · ${LANGUAGE_LABELS[farmer.language as Language]}` : ''}
          </AppText>
        </View>
      </View>

      {openCase ? (
        <View style={[styles.alert, { backgroundColor: tones.problem.background }]} accessibilityRole="alert">
          <AppText bold style={{ color: colors.red }}>
            Open health case{openCase.triage ? ` · ${TRIAGE_LABELS[openCase.triage]}` : ''}
          </AppText>
          <AppText variant="small" style={{ color: colors.red }}>
            Opened {formatSyncTime(openCase.created_at)}. The vets are handling it. Check eggs carefully.
          </AppText>
        </View>
      ) : null}

      <View style={styles.vet}>
        <AppText bold style={vetId ? undefined : { color: colors.amber }}>
          Vet: {vetId ? (vets.find((v) => v.id === vetId)?.name ?? 'a vet') : 'not assigned yet'}
        </AppText>
        {me.role === 'admin' && vets.length ? (
          <ChipGroup
            label={vetId ? 'Change the vet' : 'Assign a vet (every farmer needs one)'}
            options={vets.map((v) => ({ value: v.id, label: v.name ?? 'Vet' }))}
            value={vetId}
            onChange={(chosen) => {
              if (chosen === vetId) return;
              // Only the admin assigns vets (addendum section 3). The latest assignment counts.
              saveRecords([{ table: 'vet_assignment', row: make({ farmer_id: farmer.id, vet_id: chosen, assigned_at: new Date().toISOString() }) }]);
              requestSync();
            }}
          />
        ) : null}
      </View>

      <TileRow>
        <StatTile tone="good" value={verified ? String(verified.count) : '–'} label="Birds now" />
        <StatTile tone="comingUp" value={String(crates)} label="Crates this month" />
        <StatTile tone="money" value={formatGhs(paid)} label="Paid this month" />
      </TileRow>
      {reported && verified && (reported.count ?? 0) < (verified.count ?? 0) ? (
        <AppText variant="small" style={{ color: colors.red }}>
          The farmer reported {reported.count} birds on {formatSyncTime(reported.counted_at ?? '')}.
        </AppText>
      ) : null}

      <View>
        <Detail label="Phone" value={displayPhone(farmer.phone) || 'Not saved'} />
        <Detail label="Farm location" value={hasLocation ? 'GPS saved' : 'Not saved yet'} warn={!hasLocation} />
        <Detail label="Digital address" value={farmer.digital_address ?? 'Not saved'} warn={!farmer.digital_address} />
        {farmer.landmark ? <Detail label="Landmark" value={farmer.landmark} /> : null}
        <Detail
          label="Last vaccination"
          value={lastVaccination ? `${lastVaccination.birds_vaccinated} birds, ${formatSyncTime(lastVaccination.vaccinated_at ?? '')}` : 'None yet'}
        />
      </View>
      <AppText variant="small" muted>
        Health details are managed by the vets and shown here read-only.
      </AppText>

      {recentCollections.length > 0 ? (
        <View>
          <AppText variant="label" muted style={styles.sectionLabel}>
            Recent collections · tap to correct
          </AppText>
          {recentCollections.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/field/collections/[id]', params: { id: c.id } })}
              accessibilityRole="button"
              style={styles.listRow}
            >
              <View style={{ flex: 1 }}>
                <AppText bold>
                  {c.crates} crates · {formatGhs(c.amount_paid ?? 0)}
                </AppText>
                <AppText variant="small" muted>
                  {formatSyncTime(c.collected_at ?? '')}
                </AppText>
              </View>
              <ChevronRight size={22} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {recentVisits.length > 0 ? (
        <View style={styles.visits}>
          <AppText variant="label" muted>
            Recent visits
          </AppText>
          {recentVisits.map((v) => (
            <View key={v.id} style={styles.visit}>
              <AppText bold>
                {formatSyncTime(v.visited_at ?? '')}
                {v.deaths ? ` · ${v.deaths} died` : ''}
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
        </View>
      ) : null}

      <Button
        label={`Collect eggs from ${farmer.name}`}
        kind="egg"
        onPress={() => router.push({ pathname: '/field/collect', params: { farmerId: farmer.id } })}
      />
      <View style={styles.pair}>
        <View style={styles.half}>
          <Button
            label="Log a visit"
            kind="secondary"
            size="small"
            onPress={() => router.push({ pathname: '/field/farmers/[id]/visit', params: { id: farmer.id } })}
          />
        </View>
        <View style={styles.half}>
          <Button
            label={`Call ${farmer.name}`}
            kind="secondary"
            size="small"
            disabled={!farmer.phone}
            onPress={() => void Linking.openURL(`tel:${farmer.phone}`)}
          />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={styles.half}>
          <Button label="Directions" kind="secondary" size="small" disabled={!hasLocation} onPress={directions} />
        </View>
        <View style={styles.half}>
          <Button
            label="Edit details"
            kind="secondary"
            size="small"
            onPress={() => router.push({ pathname: '/field/farmers/[id]/edit', params: { id: farmer.id } })}
          />
        </View>
      </View>
      <FarmerAppAccess farmerId={farmer.id} name={farmer.name ?? 'the farmer'} phone={farmer.phone} />
    </Screen>
  );
}

function Detail({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.detail}>
      <AppText muted>{label}</AppText>
      <AppText bold style={warn ? { color: colors.amber } : undefined}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 22, color: colors.green },
  alert: { borderRadius: radii.tile, padding: 14, gap: 4 },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 12,
  },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  sectionLabel: { marginBottom: 4 },
  vet: { gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
  visits: { gap: 10 },
  visit: { gap: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
