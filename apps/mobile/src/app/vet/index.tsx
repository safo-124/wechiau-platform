import {
  caseUrgency,
  currentVets,
  dosesLeft,
  farmsInRound,
  isColdChainSafe,
  latestReading,
  localDate,
  localDateInDays,
  sortCases,
  unreadCount,
} from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { useSeenTimes } from '@/chat/seen';
import { AppText } from '@/components/AppText';
import { ChevronRight, MessageCircle } from '@/components/icons';
import { AccountMenu } from '@/components/AccountMenu';
import { SyncChip } from '@/components/SyncChip';
import { SyncProblems } from '@/components/SyncProblems';
import { TabScreen } from '@/components/TabScreen';
import { StatTile, Tag, TileRow } from '@/components/Tiles';
import {
  useCaseSummaries,
  useFarmers,
  useHealthCases,
  useMessages,
  useReadings,
  useRounds,
  useSettings,
  useStockEntries,
  useVaccinations,
  useVetAssignments,
} from '@/data/hooks';
import { CHANNEL_LABELS, firstName, formatAgo, greeting } from '@/format';

/** Vet app "Today" (design: vet-app/Main). Shows this vet's work first; everything else is a tap away. */
export default function VetToday() {
  const { user: me } = useSignedIn();
  const farmers = useFarmers();
  const cases = useHealthCases();
  const summaries = useCaseSummaries();
  const rounds = useRounds();
  const vaccinations = useVaccinations();
  const vets = currentVets(useVetAssignments());
  const stock = dosesLeft(useStockEntries());
  const settings = useSettings();
  const myReading = latestReading(useReadings(), me.id);
  const today = useMemo(() => localDate(), []);
  const tomorrow = useMemo(() => localDateInDays(1), []);

  const nameOf = (farmerId: string | null) => farmers.find((f) => f.id === farmerId)?.name ?? 'A farmer';
  const open = sortCases(cases.filter((c) => c.status === 'open'));
  const mine = open.filter((c) => c.assigned_vet_id === me.id);
  const urgent = [...mine, ...open].find((c) => caseUrgency(c) === 'urgent');
  const followUps = mine.filter((c) => c.follow_up_on && c.follow_up_on <= tomorrow);

  // Today's round, or else the latest round that has started.
  const round = rounds.find((r) => r.date === today) ?? [...rounds].reverse().find((r) => (r.date ?? '') <= today);
  const farms = round ? farmsInRound(farmers, vaccinations, vets, round.id) : [];
  const myFarms = farms.filter((f) => f.vetId === me.id);
  const nextFarm = myFarms.find((f) => !f.done) ?? farms.find((f) => !f.done);
  const done = farms.filter((f) => f.done).length;

  const readingSafe = myReading?.temp_c != null ? isColdChainSafe(myReading.temp_c, settings.values) : null;

  // Messages from farmers this phone has not shown yet.
  const messages = useMessages();
  const talking = [...new Set(messages.map((m) => m.farmer_id ?? ''))].filter(Boolean);
  const seen = useSeenTimes(talking);
  const newMessages = talking.reduce((n, farmerId) => n + unreadCount(messages.filter((m) => m.farmer_id === farmerId), seen(farmerId), 'from_farmer'), 0);

  return (
    <TabScreen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">
            {greeting()}, {firstName(me.name)}
          </AppText>
          <AppText muted>Vet team · Wechiau Poultry</AppText>
        </View>
        <View style={styles.headerActions}>
          <SyncChip />
          <AccountMenu />
        </View>
      </View>
      <SyncProblems />

      {urgent ? (
        <Pressable
          onPress={() => router.push({ pathname: '/vet/cases/[id]', params: { id: urgent.id } })}
          accessibilityRole="button"
          style={styles.urgent}
        >
          <AppText bold style={styles.white}>
            {open.filter((c) => caseUrgency(c) === 'urgent').length} urgent case
            {open.filter((c) => caseUrgency(c) === 'urgent').length === 1 ? '' : 's'}
          </AppText>
          <AppText bold style={[styles.white, styles.urgentTitle]}>
            {nameOf(urgent.farmer_id)}: {summaries.get(urgent.id) ?? 'needs a vet'}
          </AppText>
          <AppText variant="small" style={styles.white}>
            {CHANNEL_LABELS[urgent.channel ?? ''] ?? 'Report'}, {formatAgo(urgent.created_at)} ·{' '}
            {urgent.triage ? 'urgency confirmed' : 'AI suggests urgent, please check'}
          </AppText>
        </Pressable>
      ) : null}

      {round ? (
        <Pressable onPress={() => router.navigate('/vet/clinic')} accessibilityRole="button" style={styles.round}>
          <View style={styles.roundTop}>
            <AppText variant="bodyLarge" bold>
              {round.date === today ? 'Today: ' : ''}vaccine round {round.number}
            </AppText>
            <ChevronRight size={22} color={colors.textMuted} />
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${farms.length ? Math.round((done / farms.length) * 100) : 0}%` }]} />
          </View>
          <AppText variant="small" muted>
            {done} of {farms.length} farms done
            {myFarms.length ? ` · ${myFarms.filter((f) => f.done).length} of your ${myFarms.length}` : ''}
            {nextFarm ? ` · next: ${nameOf(nextFarm.farmerId)}` : ''}
          </AppText>
        </Pressable>
      ) : null}

      <TileRow>
        <StatTile tone="comingUp" value={String(mine.length)} label="Your open cases" onPress={() => router.navigate('/vet/cases')} />
        <StatTile tone="money" value={String(stock.total)} label="Doses left" onPress={() => router.navigate('/vet/stock')} />
        <StatTile
          tone={readingSafe === false ? 'problem' : 'good'}
          value={myReading?.temp_c != null ? `${myReading.temp_c}°C` : '–'}
          label={readingSafe === false ? 'Cold box too warm' : myReading ? 'Cold box OK' : 'Log cold box'}
          onPress={() => router.navigate('/vet/clinic')}
        />
      </TileRow>

      <Pressable onPress={() => router.push('/vet/messages')} accessibilityRole="button" style={styles.messages}>
        <MessageCircle size={24} color={colors.green} />
        <AppText variant="bodyLarge" bold style={{ flex: 1 }}>
          Messages from farmers
        </AppText>
        {newMessages ? <Tag tone="good" label={`${newMessages} new`} /> : null}
        <ChevronRight size={22} color={colors.textMuted} />
      </Pressable>

      {followUps.length ? (
        <View>
          <AppText variant="label" muted style={{ marginBottom: 4 }}>
            Follow-ups
          </AppText>
          {followUps.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/vet/cases/[id]', params: { id: c.id } })}
              accessibilityRole="button"
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <AppText bold>
                  {nameOf(c.farmer_id)}: {summaries.get(c.id) ?? 'follow-up'}
                </AppText>
                <AppText variant="small" muted>
                  {c.follow_up_on === today ? 'Check today' : c.follow_up_on && c.follow_up_on < today ? `Was due ${c.follow_up_on}` : 'Check tomorrow'}
                </AppText>
              </View>
              <ChevronRight size={22} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}

    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urgent: { borderRadius: radii.card, backgroundColor: colors.red, padding: 16, gap: 6 },
  urgentTitle: { fontSize: 20 },
  white: { color: colors.white },
  round: { borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.border, padding: 16, gap: 10 },
  roundTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.greenTint, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.greenStrong },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
  messages: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16 },
});
