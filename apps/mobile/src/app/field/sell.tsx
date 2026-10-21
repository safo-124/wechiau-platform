import { buildSale, cratesInStore, formatGhs, lineTotal, localDateInDays } from '@wechiau/shared';
import { colors, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { InfoBox } from '@/components/Tiles';
import { useBuyers, useCollections, useRowFactory, useSales, useSettings } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

const DUE_OPTIONS = [
  { value: '3', label: 'In 3 days' },
  { value: '7', label: 'In a week' },
  { value: '14', label: 'In 2 weeks' },
] as const;

/** Record a Wa sale (design: field-app/Sale). Paid in full goes into the egg fund now; otherwise it is owed. */
export default function Sell() {
  const make = useRowFactory();
  const { requestSync } = useSync();
  const settings = useSettings();
  const buyers = useBuyers();
  const inStore = cratesInStore(useCollections(), useSales());

  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [cratesWanted, setCrates] = useState(1);
  const [paidInFull, setPaidInFull] = useState(true);
  const [dueIn, setDueIn] = useState<(typeof DUE_OPTIONS)[number]['value']>('7');
  const [error, setError] = useState<string | null>(null);

  // Worked out while rendering: the count stays within the crates in store,
  // and the first buyer is chosen until another is picked.
  const crates = inStore > 0 ? Math.min(Math.max(cratesWanted, 1), inStore) : 1;
  const chosenBuyerId = buyerId ?? buyers[0]?.id ?? null;
  const price = settings.values.sell_price_per_crate;
  const total = lineTotal(crates, price);
  const buyer = buyers.find((b) => b.id === chosenBuyerId) ?? null;

  function save() {
    if (!buyer) {
      setError('Choose the buyer.');
      return;
    }
    const rows = buildSale(make, {
      buyerId: buyer.id,
      crates,
      pricePerCrate: price,
      soldAt: new Date().toISOString(),
      paidInFull,
      dueOn: paidInFull ? null : localDateInDays(Number(dueIn)),
    });
    const changes: Parameters<typeof saveRecords>[0] = [{ table: 'sale', row: rows.sale }];
    if (rows.payment) changes.push({ table: 'sale_payment', row: rows.payment });
    if (rows.ledger) changes.push({ table: 'ledger_entry', row: rows.ledger });
    try {
      saveRecords(changes);
    } catch (e) {
      setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
      return;
    }
    requestSync();
    router.replace('/field/cash');
  }

  const buyerOptions = buyers.map((b) => ({ value: b.id, label: b.name ?? 'Buyer' }));

  return (
    <Screen>
      <BackLink label="Today" />
      <AppText variant="title">Record a Wa sale</AppText>

      {buyers.length === 0 ? (
        <InfoBox>
          <AppText>No buyers yet. Add the first one.</AppText>
        </InfoBox>
      ) : (
        <ChipGroup label="Buyer" options={buyerOptions} value={chosenBuyerId} onChange={setBuyerId} />
      )}
      <Button label="Add a buyer" kind="secondary" size="small" onPress={() => router.push('/field/buyers/new')} />

      {inStore <= 0 ? (
        <InfoBox tone="comingUp">
          <AppText style={{ color: tones.comingUp.text }}>No crates in store on this phone's records. Collect eggs first.</AppText>
        </InfoBox>
      ) : null}
      <Stepper
        value={crates}
        onChange={setCrates}
        min={1}
        max={Math.max(inStore, 1)}
        unit={`crates sold · ${Math.max(inStore, 0)} in store`}
        tone="money"
        stepLabel="crate"
      />
      <View style={styles.line}>
        <AppText variant="bodyLarge">Price per crate</AppText>
        <AppText variant="bodyLarge" bold>
          {formatGhs(price)}
        </AppText>
      </View>
      <View style={[styles.line, styles.total]}>
        <AppText variant="bodyLarge">Sale total</AppText>
        <AppText bold style={styles.amount}>
          {formatGhs(total)}
        </AppText>
      </View>

      <ChipGroup
        options={[
          { value: 'full', label: 'Paid in full' },
          { value: 'later', label: 'Pays later' },
        ]}
        value={paidInFull ? 'full' : 'later'}
        onChange={(v) => setPaidInFull(v === 'full')}
      />
      {paidInFull ? (
        <InfoBox tone="good">
          <AppText style={{ color: tones.good.text }}>{formatGhs(total)} goes into the egg fund now.</AppText>
        </InfoBox>
      ) : (
        <InfoBox tone="comingUp">
          <AppText style={{ color: tones.comingUp.text }}>
            {formatGhs(total)} owed by {buyer?.name ?? 'the buyer'}. When will they pay?
          </AppText>
          <ChipGroup options={DUE_OPTIONS} value={dueIn} onChange={setDueIn} />
        </InfoBox>
      )}

      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Save sale" onPress={save} disabled={!buyer || inStore <= 0} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  total: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  amount: { fontSize: 32 },
});
