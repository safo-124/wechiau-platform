import { cashWithPerson, cratesInStore, formatGhs, isSince, latestCount, startOfLocalDay, sumPesewas } from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { ChevronRight, Egg } from '@/components/icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { AccountMenu } from '@/components/AccountMenu';
import { SyncChip } from '@/components/SyncChip';
import { SyncProblems } from '@/components/SyncProblems';
import { TabScreen } from '@/components/TabScreen';
import { StatTile, TileRow } from '@/components/Tiles';
import { describeCount } from '@/components/CashCountBox';
import { useCashCounts, useCollections, useFarmers, useHandovers, useLedger, useSales } from '@/data/hooks';
import { firstName, formatSyncTime, greeting } from '@/format';

/** Field app "Today" (design: field-app/Main). */
export default function Today() {
  const { user: me } = useSignedIn();
  const collections = useCollections();
  const sales = useSales();
  const farmers = useFarmers();
  const cash = cashWithPerson(me.id, useLedger(), useHandovers());
  const today = useMemo(() => startOfLocalDay(), []);
  const lastCount = latestCount(useCashCounts(), me.id);
  const countedToday = lastCount !== null && isSince(lastCount.counted_at, today);

  const todays = collections.filter((c) => isSince(c.collected_at, today));
  const mineToday = todays.filter((c) => c.recorded_by === me.id);
  const cratesToday = mineToday.reduce((n, c) => n + (c.crates ?? 0), 0);
  const paidToday = sumPesewas(mineToday.map((c) => c.amount_paid ?? 0));
  const inStore = Math.max(cratesInStore(collections, sales), 0);
  // Anyone's collection counts, so two people don't go to the same farm.
  const collectedFrom = new Set(todays.map((c) => c.farmer_id));
  const stillToCollect = farmers.filter((f) => f.status !== 'inactive' && !collectedFrom.has(f.id));

  return (
    <TabScreen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">
            {greeting()}, {firstName(me.name)}
          </AppText>
          <AppText muted>Wechiau Poultry · field</AppText>
        </View>
        <View style={styles.headerActions}>
          <SyncChip />
          <AccountMenu />
        </View>
      </View>
      <SyncProblems />

      <Pressable onPress={() => router.navigate('/field/cash')} accessibilityRole="button" style={styles.cash}>
        <AppText style={styles.cashText}>{me.role === 'admin' ? 'Cash with you' : 'Cash you should have'}</AppText>
        <AppText bold style={[styles.cashText, styles.cashNumber]}>
          {formatGhs(cash)}
        </AppText>
        <AppText variant="small" style={styles.cashText}>
          {countedToday
            ? `Counted at ${formatSyncTime(lastCount.counted_at ?? '')}: ${describeCount(lastCount).text}`
            : 'Count it tonight · tap for details'}
        </AppText>
      </Pressable>

      <TileRow>
        <StatTile
          tone="comingUp"
          value={`${cratesToday} crate${cratesToday === 1 ? '' : 's'}`}
          label={`Collected today · ${formatGhs(paidToday)} paid`}
        />
        <StatTile tone="money" value={`${inStore} crate${inStore === 1 ? '' : 's'}`} label="In store, ready for Wa" />
      </TileRow>

      <Pressable
        onPress={() => router.navigate('/field/collect')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.egg, pressed && { opacity: 0.85 }]}
      >
        <Egg size={28} color={colors.eggButtonText} strokeWidth={2} />
        <AppText bold style={styles.eggText}>
          Collect eggs
        </AppText>
      </Pressable>

      <View style={styles.pair}>
        <View style={styles.half}>
          <Button label="Record Wa sale" kind="secondary" size="small" onPress={() => router.navigate('/field/sell')} />
        </View>
        <View style={styles.half}>
          <Button label="Add farmer" kind="secondary" size="small" onPress={() => router.push('/field/farmers/new')} />
        </View>
      </View>

      <View>
        <AppText variant="label" muted style={{ marginBottom: 4 }}>
          Still to collect today
        </AppText>
        {stillToCollect.length === 0 ? (
          <AppText muted>{farmers.length ? 'Every farmer has been collected from today.' : 'No farmers yet.'}</AppText>
        ) : (
          stillToCollect.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => router.push({ pathname: '/field/farmers/[id]', params: { id: f.id } })}
              accessibilityRole="button"
              style={styles.row}
            >
              <AppText bold style={{ flex: 1 }}>
                {f.name}
              </AppText>
              <ChevronRight size={22} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </View>

    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cash: { borderRadius: radii.card, backgroundColor: colors.green, padding: 16, gap: 4 },
  cashText: { color: colors.white },
  cashNumber: { fontSize: 38, lineHeight: 44 },
  egg: {
    minHeight: 72,
    borderRadius: radii.card,
    backgroundColor: colors.eggButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  eggText: { fontSize: 21, color: colors.eggButtonText },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
