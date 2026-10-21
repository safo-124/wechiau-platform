import { colors, radii } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CaseTag } from '@/components/CaseTag';
import { ChipGroup } from '@/components/ChipGroup';
import { TabScreen } from '@/components/TabScreen';
import { InfoBox } from '@/components/Tiles';
import { useCaseSummaries, useFarmers, useHealthCases, useUsers } from '@/data/hooks';
import { caseUrgency, sortCases } from '@wechiau/shared';
import { CHANNEL_LABELS, formatAgo } from '@/format';

type Filter = 'mine' | 'urgent' | 'open' | 'closed';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'open', label: 'All open' },
  { value: 'closed', label: 'Closed' },
];

/** The case inbox (design: vet-app/Cases), most urgent first. Every vet sees every case; "Mine" is the default. */
export default function Cases() {
  const { user: me } = useSignedIn();
  const [filter, setFilter] = useState<Filter>('mine');
  const cases = sortCases(useHealthCases());
  const farmers = useFarmers();
  const users = useUsers();
  const summaries = useCaseSummaries();

  const shown = cases.filter((c) => {
    if (filter === 'closed') return c.status === 'closed';
    if (c.status !== 'open') return false;
    if (filter === 'mine') return c.assigned_vet_id === me.id;
    if (filter === 'urgent') return caseUrgency(c) === 'urgent';
    return true;
  });
  const nameOf = (farmerId: string | null) => farmers.find((f) => f.id === farmerId)?.name ?? 'A farmer';
  const vetName = (id: string | null) => (id === me.id ? 'you' : (users.find((u) => u.id === id)?.name ?? 'no vet yet'));

  return (
    <TabScreen>
      <AppText variant="title">Cases</AppText>
      <AppText muted>Sorted by how urgent they are</AppText>
      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
      {shown.length === 0 ? (
        <InfoBox>
          <AppText>{filter === 'mine' ? 'No open cases for you. Check "All open" to help another vet.' : 'No cases here.'}</AppText>
        </InfoBox>
      ) : (
        shown.map((c) => {
          const urgent = c.status === 'open' && caseUrgency(c) === 'urgent';
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/vet/cases/[id]', params: { id: c.id } })}
              accessibilityRole="button"
              style={[styles.card, urgent && styles.cardUrgent]}
            >
              <View style={styles.top}>
                <CaseTag status={c.status} triage={c.triage} suggested={c.triage_suggested} />
                <AppText variant="small" muted>
                  {formatAgo(c.created_at)}
                </AppText>
              </View>
              <AppText variant="bodyLarge" bold>
                {nameOf(c.farmer_id)}: {summaries.get(c.id) ?? 'problem reported'}
              </AppText>
              <AppText variant="small" muted>
                {CHANNEL_LABELS[c.channel ?? ''] ?? 'Report'} · {vetName(c.assigned_vet_id)}
                {c.follow_up_on ? ` · follow up ${c.follow_up_on}` : ''}
              </AppText>
            </Pressable>
          );
        })
      )}
      <Button label="Open a case" kind="secondary" size="small" onPress={() => router.push('/vet/cases/new')} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 6 },
  cardUrgent: { borderColor: colors.redBorder },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
