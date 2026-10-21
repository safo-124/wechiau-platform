import { cashWithPerson, cratesInStore, eggFundBalance, eggMargin, formatAmount, formatGhs, isSince, latestCount, lineTotal, saleBalances, startOfLocalMonth, sumPesewas } from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CashCountBox, describeCount } from '@/components/CashCountBox';
import { TabScreen } from '@/components/TabScreen';
import { StatTile, TileRow } from '@/components/Tiles';
import {
  useBuyers,
  useCashCounts,
  useCollections,
  useHandovers,
  useLedger,
  useSalePayments,
  useSales,
  useSettings,
  useUsers,
} from '@/data/hooks';
import { formatSyncTime } from '@/format';
import { useSync } from '@/sync/SyncProvider';

/** Cash and egg fund (design: field-app/Cash). Field agents see their own cash; the admin sees the whole fund too. */
export default function Cash() {
  const { user: me } = useSignedIn();
  const isAdmin = me.role === 'admin';
  const { pending } = useSync();
  const settings = useSettings();
  const ledger = useLedger();
  const handovers = useHandovers();
  const collections = useCollections();
  const sales = useSales();
  const payments = useSalePayments();
  const buyers = useBuyers();
  const users = useUsers();
  const counts = useCashCounts();

  const month = useMemo(() => startOfLocalMonth(), []);
  const mine = cashWithPerson(me.id, ledger, handovers);

  const myCollections = collections.filter((c) => c.recorded_by === me.id && isSince(c.collected_at, month));
  const paidOut = sumPesewas(myCollections.map((c) => c.amount_paid ?? 0));
  const cratesBought = myCollections.reduce((n, c) => n + (c.crates ?? 0), 0);
  // A removed sale's payments were cancelled in the ledger, so they don't count as received.
  const liveSales = new Set(sales.map((s) => s.id));
  const myPayments = payments.filter((p) => p.recorded_by === me.id && isSince(p.received_at, month) && liveSales.has(p.sale_id ?? ''));
  const received = sumPesewas(myPayments.map((p) => p.amount ?? 0));

  const balances = saleBalances(sales, payments);
  const owed = sales
    .filter((s) => (balances.get(s.id)?.owed ?? 0) > 0)
    .map((s) => ({ sale: s, owed: balances.get(s.id)!.owed, buyer: buyers.find((b) => b.id === s.buyer_id) }));

  const recentSales = sales.filter((s) => isSince(s.sold_at, month) && (isAdmin || s.recorded_by === me.id)).slice(0, 15);

  const inStore = cratesInStore(collections, sales);
  const monthMargin = eggMargin(
    collections.filter((c) => isSince(c.collected_at, month)),
    sales.filter((s) => isSince(s.sold_at, month)),
  );

  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'Someone';
  const people = isAdmin
    ? users
        .filter((u) => u.role === 'admin' || u.role === 'field_agent')
        .map((u) => ({ id: u.id, name: u.name ?? '', cash: cashWithPerson(u.id, ledger, handovers), count: latestCount(counts, u.id) }))
    : [];

  return (
    <TabScreen>
      <AppText variant="title">Cash and egg fund</AppText>
      <AppText muted>This month</AppText>

      <View style={styles.hero}>
        <AppText style={styles.heroText}>Cash you should have</AppText>
        <AppText bold style={[styles.heroText, styles.heroNumber]}>
          {formatGhs(mine)}
        </AppText>
        <AppText variant="small" style={styles.heroText}>
          {isAdmin ? `Whole egg fund ${formatGhs(eggFundBalance(ledger))}` : 'Only the cash you hold. Gloria sees the whole fund.'}
        </AppText>
      </View>

      <CashCountBox expected={mine} />

      <View>
        <Line title="Paid to farmers" detail={`${cratesBought} crates by you`} amount={formatAmount(-paidOut, { signed: true })} />
        <Line title="Received from Wa buyers" detail={`${myPayments.length} payments to you`} amount={formatAmount(received, { signed: true })} />
        {handovers
          .filter((h) => isSince(h.handed_at, month) && (h.to_user_id === me.id || h.from_user_id === me.id))
          .map((h) => (
            <Line
              key={h.id}
              title={h.to_user_id === me.id ? `Cash from ${nameOf(h.from_user_id)}` : `Cash to ${nameOf(h.to_user_id)}`}
              detail={formatSyncTime(h.handed_at ?? '')}
              amount={formatAmount(h.to_user_id === me.id ? (h.amount ?? 0) : -(h.amount ?? 0), { signed: true })}
            />
          ))}
      </View>

      {recentSales.length > 0 ? (
        <View>
          <AppText variant="label" muted style={styles.sectionLabel}>
            {isAdmin ? 'Sales this month' : 'Your sales this month'} · tap to see or remove
          </AppText>
          {recentSales.map((sale) => (
            <Pressable
              key={sale.id}
              onPress={() => router.push({ pathname: '/field/sales/[id]', params: { id: sale.id } })}
              accessibilityRole="button"
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <AppText bold>{buyers.find((b) => b.id === sale.buyer_id)?.name ?? 'A buyer'}</AppText>
                <AppText variant="small" muted>
                  {sale.crates} crates · {formatSyncTime(sale.sold_at ?? '')}
                </AppText>
              </View>
              <AppText bold>{formatAmount(balances.get(sale.id)?.total ?? 0)}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {owed.length > 0 ? (
        <View>
          <AppText variant="label" muted style={styles.sectionLabel}>
            Owed by buyers · tap to record a payment
          </AppText>
          {owed.map(({ sale, owed: amount, buyer }) => (
            <Pressable
              key={sale.id}
              onPress={() => router.push({ pathname: '/field/payment/[saleId]', params: { saleId: sale.id } })}
              accessibilityRole="button"
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <AppText bold style={{ color: colors.amber }}>
                  Owed by {buyer?.name ?? 'a buyer'}
                </AppText>
                <AppText variant="small" muted>
                  {sale.crates} crates{sale.due_on ? ` · due ${sale.due_on}` : ''}
                </AppText>
              </View>
              <AppText variant="bodyLarge" bold style={{ color: colors.amber }}>
                {formatAmount(amount)}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TileRow>
        <StatTile
          tone="money"
          value={`${Math.max(inStore, 0)} crates`}
          label={`In store, worth ${formatGhs(lineTotal(Math.max(inStore, 0), settings.values.sell_price_per_crate))}`}
        />
        <StatTile tone="good" value={formatGhs(monthMargin.margin)} label={`Egg margin, ${monthMargin.cratesSold} crates sold`} />
      </TileRow>

      {isAdmin ? (
        <View style={styles.people}>
          <AppText variant="label" muted>
            Cash held by each person
          </AppText>
          {people.map((p) => (
            <View key={p.id} style={styles.personRow}>
              <View style={{ flex: 1 }}>
                <AppText>{p.id === me.id ? `${p.name} (you)` : p.name}</AppText>
                <AppText variant="small" style={{ color: p.count && !describeCount(p.count).matched ? colors.red : colors.textMuted }}>
                  {p.count ? `Counted ${formatSyncTime(p.count.counted_at ?? '')}: ${describeCount(p.count).text}` : 'Not counted yet'}
                </AppText>
              </View>
              <AppText bold>{formatGhs(p.cash)}</AppText>
            </View>
          ))}
          <Button label="Record cash handover" kind="secondary" size="small" onPress={() => router.push('/field/handover')} />
        </View>
      ) : null}

      <AppText variant="small" muted>
        {pending ? `${pending} records waiting to sync. ` : ''}Full ledger in the dashboard.
      </AppText>
    </TabScreen>
  );
}

function Line({ title, detail, amount }: { title: string; detail: string; amount: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <AppText bold>{title}</AppText>
        <AppText variant="small" muted>
          {detail}
        </AppText>
      </View>
      <AppText variant="bodyLarge" bold>
        {amount}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.card, backgroundColor: colors.green, padding: 16, gap: 4 },
  heroText: { color: colors.white },
  heroNumber: { fontSize: 38, lineHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 10 },
  sectionLabel: { marginBottom: 4 },
  people: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 8 },
  personRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 },
});
