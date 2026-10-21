import { flockStatus, formatGhs, localDate, nextRound, paidSince, startOfLocalMonth, unreadCount } from '@wechiau/shared';
import { colors, radii, tones, touch, type Tone } from '@wechiau/ui/theme';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLastSeen } from '@/chat/seen';
import { AppText } from '@/components/AppText';
import { Banknote, Bird, BookOpen, Calendar, ChevronRight, MessageCircle, TriangleAlert, type LucideIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { AccountMenu } from '@/components/AccountMenu';
import { SyncProblems } from '@/components/SyncProblems';
import { useMyFarm } from '@/data/farmer';
import { useCollections, useFarmerCases, useFarmerCounts, useFarmerMessages, useFarmerVaccinations, useRounds } from '@/data/hooks';
import { comingDay, firstName } from '@/format';
import { useSync } from '@/sync/SyncProvider';

/** Farmer home (design: farmer-app/Main): four big tiles, report a problem, my vet, messages. */
export default function FarmerHome() {
  const { me, farmerId, farmer, vet } = useMyFarm();
  const { pending } = useSync();
  const today = localDate();
  const rounds = useRounds();
  const flock = flockStatus({ counts: useFarmerCounts(farmerId), rounds, vaccinations: useFarmerVaccinations(farmerId) }, today);
  const month = paidSince(useCollections(), startOfLocalMonth().toISOString());
  const next = nextRound(rounds, today);
  const unread = unreadCount(useFarmerMessages(farmerId), useLastSeen(farmerId), 'to_farmer');
  const visit = useFarmerCases(farmerId).find((c) => c.status === 'open' && c.follow_up_on)?.follow_up_on ?? null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="title" style={styles.hello}>
            Hello, {firstName(farmer?.name ?? me.name)}
          </AppText>
          <AppText muted>Wechiau Poultry</AppText>
        </View>
        <AccountMenu />
      </View>
      <SyncProblems />

      <View style={styles.grid}>
        <Tile
          title="My birds"
          line={flock.birds === null ? 'Not counted yet' : `${flock.protected} of ${flock.birds} safe`}
          tone="good"
          Icon={Bird}
          href="/farmer/flock"
        />
        <Tile title="My money" line={`${formatGhs(month.paid)} this month`} tone="money" Icon={Banknote} href="/farmer/money" />
        <Tile title="Vaccine" line={next?.date ? comingDay(next.date) : 'No date yet'} tone="comingUp" Icon={Calendar} href="/farmer/story" />
        <Tile title="Farm story" line="What happened" tone="neutral" Icon={BookOpen} href="/farmer/story" />
      </View>

      <Pressable
        onPress={() => router.push('/farmer/report')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.report, pressed && { backgroundColor: '#932B21' }]}
      >
        <TriangleAlert size={30} color={colors.white} />
        <AppText style={styles.reportText}>Report a problem</AppText>
      </Pressable>

      <Pressable onPress={() => router.push('/farmer/vet')} accessibilityRole="button" style={styles.row}>
        <View style={styles.initial}>
          <AppText bold style={{ color: colors.green }}>
            {(vet?.name ?? 'V').slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyLarge" bold>
            {vet ? `My vet: ${firstName(vet.name ?? 'Vet')}` : 'My vet'}
          </AppText>
          <AppText variant="small" style={{ color: visit ? colors.amber : colors.textMuted }}>
            {visit ? `Coming ${lowerNear(comingDay(visit))}` : vet ? 'Wechiau Poultry vet' : 'A vet will be given to you soon'}
          </AppText>
        </View>
        <ChevronRight size={22} color={colors.textMuted} />
      </Pressable>

      <Pressable onPress={() => router.push('/farmer/messages')} accessibilityRole="button" style={styles.row}>
        <MessageCircle size={24} color={colors.green} />
        <AppText variant="bodyLarge" bold style={{ flex: 1 }}>
          Messages
        </AppText>
        {unread ? (
          <View style={styles.badge}>
            <AppText variant="small" bold style={{ color: colors.white }}>
              {unread} new
            </AppText>
          </View>
        ) : null}
        <ChevronRight size={22} color={colors.textMuted} />
      </Pressable>

      <AppText variant="small" muted>
        {pending
          ? `Saved on your phone. ${pending} thing${pending === 1 ? '' : 's'} will send when there is network.`
          : 'Everything is sent.'}
      </AppText>
    </Screen>
  );
}

/** "Coming today", "Coming tomorrow", "Coming Friday". */
const lowerNear = (day: string) => (day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day);

function Tile({ title, line, tone, Icon, href }: { title: string; line: string; tone: Tone; Icon: LucideIcon; href: Href }) {
  const look = tones[tone];
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" style={[styles.tile, { backgroundColor: look.background }]}>
      <View style={styles.tileIcon}>
        <Icon size={22} color={look.text} />
      </View>
      <AppText style={[styles.tileTitle, { color: look.text }]}>{title}</AppText>
      <AppText variant="bodyLarge" style={{ color: look.text }}>
        {line}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hello: { fontSize: 26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.5%', flexGrow: 1, minHeight: 150, borderRadius: radii.card, padding: 16, justifyContent: 'flex-end', gap: 2 },
  tileIcon: { position: 'absolute', top: 14, right: 14 },
  tileTitle: { fontSize: 21, fontWeight: '700' },
  report: {
    minHeight: touch.mainActionLarge,
    borderRadius: radii.largeButton,
    backgroundColor: colors.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  reportText: { color: colors.white, fontSize: 23, fontWeight: '700' },
  row: {
    minHeight: touch.mainAction,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  initial: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
});
