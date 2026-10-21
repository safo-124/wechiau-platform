import { buildSalePayment, formatAmount, formatGhs, parseGhsInput, saleBalances } from '@wechiau/shared';
import { colors, tones } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ZodError } from 'zod';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { InfoBox } from '@/components/Tiles';
import { useBuyers, useRowFactory, useSalePayments, useSales } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { formatSyncTime } from '@/format';
import { useSync } from '@/sync/SyncProvider';

/** A buyer paying some or all of what they owe (addendum section 4.2, SalePayment). */
export default function RecordPayment() {
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const sales = useSales();
  const payments = useSalePayments();
  const buyers = useBuyers();
  const sale = sales.find((s) => s.id === saleId);
  const balance = sale ? saleBalances([sale], payments).get(sale.id) : undefined;
  const buyer = buyers.find((b) => b.id === sale?.buyer_id);
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!sale || !balance) {
    return (
      <Screen>
        <BackLink />
        <AppText>This sale is not on this phone.</AppText>
      </Screen>
    );
  }

  const typed = amount ?? formatAmount(balance.owed).replace(/,/g, '');

  function save() {
    const pesewas = parseGhsInput(typed);
    if (pesewas === null || pesewas <= 0) return setError('Enter the amount received, for example 104.');
    if (pesewas > balance!.owed) return setError(`That is more than the ${formatGhs(balance!.owed)} still owed.`);
    const rows = buildSalePayment(make, { saleId: sale!.id, amount: pesewas, receivedAt: new Date().toISOString() });
    try {
      saveRecords([
        { table: 'sale_payment', row: rows.payment },
        { table: 'ledger_entry', row: rows.ledger },
      ]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    router.back();
  }

  return (
    <Screen>
      <BackLink label="Cash" />
      <AppText variant="title">Payment from {buyer?.name ?? 'buyer'}</AppText>
      <InfoBox tone="comingUp">
        <AppText bold style={{ color: tones.comingUp.text }}>
          {formatGhs(balance.owed)} still owed
        </AppText>
        <AppText variant="small" style={{ color: tones.comingUp.text }}>
          {sale.crates} crates on {formatSyncTime(sale.sold_at ?? '')} · total {formatGhs(balance.total)}
          {balance.received ? ` · ${formatGhs(balance.received)} paid so far` : ''}
          {sale.due_on ? ` · due ${sale.due_on}` : ''}
        </AppText>
      </InfoBox>
      <TextField
        label="Amount received (GHS)"
        value={typed}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        hint="Part payments are fine; the rest stays owed."
      />
      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Save payment" onPress={save} />
      <AppText variant="small" muted>
        The cash goes into the egg fund, with you.
      </AppText>
    </Screen>
  );
}
