import { buildSaleRemoval, formatGhs, saleBalances } from '@wechiau/shared';
import { colors, tones } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InfoBox } from '@/components/Tiles';
import { useBuyers, useLedger, useRowFactory, useSalePayments, useSales, useUsers } from '@/data/hooks';
import { editedRow, saveRecords } from '@/db/records';
import type { Row } from '@/db/rows';
import { formatSyncTime } from '@/format';
import { useSync } from '@/sync/SyncProvider';

/**
 * One Wa sale: what was sold, what has been paid, and "Remove this sale" for
 * one entered by mistake. Removing keeps the history: the sale is marked
 * removed and its payments' cash comes back out of the egg fund.
 */
export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me, deviceId } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const sale = useSales().find((s) => s.id === id);
  const payments = useSalePayments().filter((p) => p.sale_id === id);
  const ledger = useLedger();
  const buyer = useBuyers().find((b) => b.id === sale?.buyer_id);
  const users = useUsers();
  const [error, setError] = useState<string | null>(null);

  if (!sale) {
    return (
      <Screen>
        <BackLink label="Cash" />
        <AppText>This sale is not on this phone, or it was removed.</AppText>
      </Screen>
    );
  }

  const balance = saleBalances([sale], payments).get(sale.id)!;
  const isAdmin = me.role === 'admin';
  const mine = sale.recorded_by === me.id;
  const nameOf = (userId: string | null) => (userId === me.id ? 'you' : (users.find((u) => u.id === userId)?.name ?? 'someone'));

  function remove() {
    const removal = buildSaleRemoval(make, (row, changes) => editedRow(row, { userId: me.id, deviceId }, changes) as Row & { id: string }, {
      sale: sale as unknown as Row & { id: string },
      payments,
      ledger,
      userId: me.id,
      isAdmin,
      now: new Date().toISOString(),
    });
    if (!removal.ok) {
      setError(removal.reason);
      return;
    }
    try {
      saveRecords([{ table: 'sale', row: removal.sale }, ...removal.ledger.map((row) => ({ table: 'ledger_entry' as const, row }))]);
    } catch (e) {
      setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
      return;
    }
    requestSync();
    router.back();
  }

  function confirmRemove() {
    const cash = balance.received
      ? ` The ${formatGhs(balance.received)} paid comes back out of the egg fund, so give it back to ${buyer?.name ?? 'the buyer'} or enter the sale again correctly.`
      : '';
    Alert.alert('Remove this sale?', `${sale!.crates} crates to ${buyer?.name ?? 'the buyer'} will count as in store again.${cash}`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: remove },
    ]);
  }

  return (
    <Screen>
      <BackLink label="Cash" />
      <View>
        <AppText variant="title">Sale to {buyer?.name ?? 'a buyer'}</AppText>
        <AppText muted>
          {formatSyncTime(sale.sold_at ?? '')} · entered by {nameOf(sale.recorded_by)}
        </AppText>
      </View>

      <InfoBox tone={balance.owed ? 'comingUp' : 'good'}>
        <AppText bold style={{ color: tones[balance.owed ? 'comingUp' : 'good'].text }}>
          {sale.crates} crates at {formatGhs(sale.price_per_crate ?? 0)} · {formatGhs(balance.total)}
        </AppText>
        <AppText variant="small" style={{ color: tones[balance.owed ? 'comingUp' : 'good'].text }}>
          {balance.owed ? `${formatGhs(balance.owed)} still owed${sale.due_on ? `, due ${sale.due_on}` : ''}` : 'Paid in full'}
        </AppText>
      </InfoBox>

      {payments.length ? (
        <View style={{ gap: 6 }}>
          <AppText variant="label">Payments</AppText>
          {payments.map((p) => (
            <View key={p.id} style={styles.row}>
              <AppText style={{ flex: 1 }}>
                {formatSyncTime(p.received_at ?? '')} · to {nameOf(p.recorded_by)}
              </AppText>
              <AppText bold>{formatGhs(p.amount ?? 0)}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {balance.owed ? (
        <Button label="Record a payment" onPress={() => router.push({ pathname: '/field/payment/[saleId]', params: { saleId: sale.id } })} />
      ) : null}

      {mine || isAdmin ? (
        <View style={{ gap: 6 }}>
          <Button label="Remove this sale" kind="secondary" size="small" onPress={confirmRemove} />
          <AppText variant="small" muted>
            For a sale entered by mistake: wrong buyer, wrong crates, or entered twice.
          </AppText>
        </View>
      ) : null}
      {error ? (
        <AppText accessibilityRole="alert" style={{ color: colors.red }}>
          {error}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
