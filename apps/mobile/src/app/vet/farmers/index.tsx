import { colors, radii } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { ChipGroup } from '@/components/ChipGroup';
import { Navigation, Phone } from '@/components/icons';
import { TabScreen } from '@/components/TabScreen';
import { InfoBox, Tag } from '@/components/Tiles';
import { useFarmers, useHealthCases, useRounds, useUsers, useVaccinations, useVetAssignments } from '@/data/hooks';
import { caseUrgency, currentVets, localDate } from '@wechiau/shared';
import { callPhone, openDirections } from '@/linking';
import type { Tone } from '@wechiau/ui/theme';

type Filter = 'mine' | 'attention' | 'all';

/** My farmers (design: vet-app/MyFarmers): the farmers Gloria assigned to this vet, with call and directions. */
export default function VetFarmers() {
  const { user: me } = useSignedIn();
  const farmers = useFarmers();
  const vets = currentVets(useVetAssignments());
  const cases = useHealthCases();
  const vaccinations = useVaccinations();
  const rounds = useRounds();
  const users = useUsers();
  const today = useMemo(() => localDate(), []);
  const [filter, setFilter] = useState<Filter>('mine');

  // The latest round that has started: a farm not vaccinated in it is "vaccine due".
  const round = [...rounds].reverse().find((r) => (r.date ?? '') <= today);

  const rows = farmers
    .filter((f) => f.status !== 'inactive')
    .map((f) => {
      const open = cases.filter((c) => c.farmer_id === f.id && c.status === 'open');
      const urgent = open.some((c) => caseUrgency(c) === 'urgent');
      const followUp = open.some((c) => c.follow_up_on && c.follow_up_on <= today);
      const vaccinated = round ? vaccinations.some((v) => v.farmer_id === f.id && v.round_id === round.id) : true;
      const tag: { label: string; tone: Tone } = urgent
        ? { label: 'Urgent case', tone: 'problem' }
        : followUp
          ? { label: 'Follow-up due', tone: 'comingUp' }
          : open.length
            ? { label: 'Open case', tone: 'comingUp' }
            : !vaccinated
              ? { label: 'Vaccine due', tone: 'comingUp' }
              : { label: 'Healthy', tone: 'good' };
      return { farmer: f, vetId: vets.get(f.id) ?? null, tag, attention: tag.tone !== 'good' };
    });
  const mine = rows.filter((r) => r.vetId === me.id);
  const shown = filter === 'mine' ? mine : filter === 'attention' ? mine.filter((r) => r.attention) : rows;

  return (
    <TabScreen>
      <AppText variant="title">My farmers</AppText>
      <AppText muted>{mine.length} assigned to you by Gloria</AppText>
      <ChipGroup
        options={[
          { value: 'mine', label: `Mine (${mine.length})` },
          { value: 'attention', label: 'Need attention' },
          { value: 'all', label: 'All farmers' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {shown.length === 0 ? (
        <InfoBox>
          <AppText>
            {filter === 'all' ? 'No farmers yet.' : filter === 'attention' ? 'None of your farmers need attention.' : 'No farmers are assigned to you yet.'}
          </AppText>
        </InfoBox>
      ) : null}
      {shown.map(({ farmer: f, vetId, tag }) => (
        <View key={f.id} style={styles.card}>
          <View style={styles.avatar}>
            <AppText bold style={{ color: colors.green }}>
              {f.name?.[0] ?? '?'}
            </AppText>
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/vet/farmers/[id]', params: { id: f.id } })}
            accessibilityRole="button"
            style={styles.text}
          >
            <AppText bold>{f.name}</AppText>
            {f.digital_address || f.landmark ? (
              <AppText variant="small" style={{ color: colors.blue }}>
                {[f.digital_address, f.landmark].filter(Boolean).join(' · ')}
              </AppText>
            ) : null}
            {filter === 'all' && vetId !== me.id ? (
              <AppText variant="small" muted>
                Vet: {vetId ? (users.find((u) => u.id === vetId)?.name ?? 'another vet') : 'not assigned'}
              </AppText>
            ) : null}
            <Tag label={tag.label} tone={tag.tone} />
          </Pressable>
          {f.lat != null && f.lng != null ? (
            <Pressable
              onPress={() => openDirections(f.lat!, f.lng!, f.name ?? 'Farm')}
              accessibilityRole="button"
              accessibilityLabel={`Directions to ${f.name}`}
              style={[styles.round, { backgroundColor: colors.blue }]}
            >
              <Navigation size={22} color={colors.white} />
            </Pressable>
          ) : null}
          {f.phone ? (
            <Pressable
              onPress={() => callPhone(f.phone!)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${f.name}`}
              style={[styles.round, styles.outline]}
            >
              <Phone size={22} color={colors.green} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
});
