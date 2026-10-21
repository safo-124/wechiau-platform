import { buildCollection, formatGhs, isSince, lineTotal, startOfLocalDay } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronRight } from '@/components/icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { ReceiptBox } from '@/components/ReceiptBox';
import { InfoBox } from '@/components/Tiles';
import { useCollections, useFarmers, useRowFactory, useSettings } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

type Step =
  | { at: 1 }
  | { at: 2; farmerId: string }
  | { at: 3; farmerId: string; crates: number; amount: number; smsId: string; collectionId: string };

/** Collect eggs in three steps (design: field-app/Collect; v0.3 figure 4). Works with no signal. */
export default function Collect() {
  const params = useLocalSearchParams<{ farmerId?: string }>();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const settings = useSettings();
  const farmers = useFarmers();
  const collections = useCollections();
  const [step, setStep] = useState<Step>(params.farmerId ? { at: 2, farmerId: params.farmerId } : { at: 1 });
  const [crates, setCrates] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const price = settings.values.buy_price_per_crate;
  const priceNotSynced = settings.missing.includes('buy_price_per_crate');
  const today = useMemo(() => startOfLocalDay(), []);

  const notes = useMemo(() => {
    const byFarmer = new Map<string, { today: number; recent: number[] }>();
    for (const c of collections) {
      if (!c.farmer_id) continue;
      const entry = byFarmer.get(c.farmer_id) ?? { today: 0, recent: [] };
      if (isSince(c.collected_at, today)) entry.today += c.crates ?? 0;
      else if (entry.recent.length < 4) entry.recent.push(c.crates ?? 0);
      byFarmer.set(c.farmer_id, entry);
    }
    return byFarmer;
  }, [collections, today]);

  const farmer = step.at === 1 ? null : farmers.find((f) => f.id === step.farmerId) ?? null;
  const usual = (farmerId: string) => {
    const recent = notes.get(farmerId)?.recent ?? [];
    return recent.length ? Math.max(1, Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)) : null;
  };

  function pick(farmerId: string) {
    setCrates(usual(farmerId) ?? 2);
    setError(null);
    setStep({ at: 2, farmerId });
  }

  function pay() {
    if (!farmer?.phone) {
      setError('This farmer has no phone number saved. Add it on their profile first.');
      return;
    }
    const rows = buildCollection(make, {
      farmerId: farmer.id,
      farmerPhone: farmer.phone,
      crates,
      pricePerCrate: price,
      collectedAt: new Date().toISOString(),
    });
    try {
      saveRecords([
        { table: 'sms_outbox', row: rows.sms },
        { table: 'collection', row: rows.collection },
        { table: 'ledger_entry', row: rows.ledger },
      ]);
    } catch (e) {
      setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
      return;
    }
    requestSync();
    setStep({
      at: 3,
      farmerId: farmer.id,
      crates,
      amount: rows.collection['amount_paid'] as number,
      smsId: rows.sms.id,
      collectionId: rows.collection.id,
    });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <BackLink label="Today" />
        <AppText variant="label" muted>
          Step {step.at} of 3
        </AppText>
      </View>
      <AppText variant="title">Collect eggs</AppText>
      <View style={styles.bars} accessibilityElementsHidden>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.bar, { backgroundColor: step.at >= n ? colors.green : colors.divider }]} />
        ))}
      </View>

      {step.at === 1 ? (
        <>
          <AppText variant="bodyLarge" bold>
            Which farmer?
          </AppText>
          {farmers.length === 0 ? (
            <InfoBox>
              <AppText>No farmers on this phone yet. Register one from Farmers.</AppText>
            </InfoBox>
          ) : null}
          {farmers.map((f) => {
            const note = notes.get(f.id);
            const typical = usual(f.id);
            const detail = note?.today
              ? `Collected ${note.today} today`
              : typical
                ? `Usually ${typical} crate${typical === 1 ? '' : 's'}`
                : 'No collections yet';
            return (
              <Pressable key={f.id} onPress={() => pick(f.id)} accessibilityRole="button" style={styles.choice}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyLarge" bold>
                    {f.name}
                  </AppText>
                  <AppText variant="small" muted>
                    {detail}
                  </AppText>
                </View>
                <ChevronRight size={22} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </>
      ) : null}

      {step.at === 2 && farmer ? (
        <>
          <AppText variant="bodyLarge" bold>
            Crates from {farmer.name}
          </AppText>
          <Stepper value={crates} onChange={setCrates} min={1} max={99} unit="crates of 30 eggs" stepLabel="crate" />
          <View style={styles.line}>
            <AppText variant="bodyLarge">Price per crate</AppText>
            <AppText variant="bodyLarge" bold>
              {formatGhs(price)}
            </AppText>
          </View>
          {priceNotSynced ? (
            <InfoBox tone="comingUp">
              <AppText variant="small" style={{ color: tones.comingUp.text }}>
                This phone hasn't received the price from the dashboard yet, so the usual {formatGhs(price)} is used. Sync when you can.
              </AppText>
            </InfoBox>
          ) : null}
          <View style={[styles.line, styles.total]}>
            <AppText variant="bodyLarge">Pay the farmer</AppText>
            <AppText bold style={styles.amount}>
              {formatGhs(lineTotal(crates, price))}
            </AppText>
          </View>
          {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
          <Button label={`I paid ${formatGhs(lineTotal(crates, price))} in cash`} onPress={pay} />
          <Button label="Choose another farmer" kind="secondary" size="small" onPress={() => setStep({ at: 1 })} />
        </>
      ) : null}

      {step.at === 3 && farmer ? (
        <Saved
          farmerName={farmer.name ?? ''}
          crates={step.crates}
          amount={step.amount}
          smsId={step.smsId}
          collectionId={step.collectionId}
          onNext={() => setStep({ at: 1 })}
        />
      ) : null}
    </Screen>
  );
}

function Saved(props: { farmerName: string; crates: number; amount: number; smsId: string; collectionId: string; onNext(): void }) {
  return (
    <>
      <View style={styles.done}>
        <View style={styles.tick}>
          <Check size={40} color={colors.green} strokeWidth={2.4} />
        </View>
        <AppText variant="title">Saved</AppText>
        <AppText muted>
          {props.crates} crates from {props.farmerName} · {formatGhs(props.amount)}
        </AppText>
      </View>
      <ReceiptBox smsId={props.smsId} farmerName={props.farmerName} />
      <Button label="Collect from next farm" kind="egg" onPress={props.onNext} />
      <Button label="Done for now" kind="secondary" onPress={() => router.navigate('/field')} />
      <Button
        label="Made a mistake? Correct it"
        kind="secondary"
        size="small"
        onPress={() => router.push({ pathname: '/field/collections/[id]', params: { id: props.collectionId } })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  choice: {
    minHeight: 64,
    borderRadius: radii.tile,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  total: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 },
  amount: { fontSize: 34, color: colors.green },
  done: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  tick: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
});
