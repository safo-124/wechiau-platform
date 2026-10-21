import { buildCollectionCorrection, canUpdateRow, type CollectionChange, formatGhs, lineTotal } from '@wechiau/shared';
import { colors, tones } from '@wechiau/ui/theme';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ReceiptBox } from '@/components/ReceiptBox';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { InfoBox } from '@/components/Tiles';
import { useRowFactory, useUsers } from '@/data/hooks';
import { db } from '@/db/client';
import { editedRow, saveRecords } from '@/db/records';
import { findRow, localTable, type Row } from '@/db/rows';
import { formatSyncTime } from '@/format';
import { useSync } from '@/sync/SyncProvider';

type Done = { kind: 'corrected' | 'removed'; smsId: string };

/**
 * Correct or remove a saved collection (addendum section 5, rule 5). The
 * collector or the admin may do it; the difference goes into the egg fund as a
 * correction, and the farmer gets a corrected receipt.
 */
export default function CorrectCollection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me, deviceId } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const users = useUsers();
  // Read once: the screen works on the collection as it was when opened.
  const collection = useMemo(() => findRow(db, localTable('collection')!, id) as (Row & { id: string }) | null, [id]);
  const farmer = useMemo(
    () => (collection ? findRow(db, localTable('farmer')!, collection['farmer_id'] as string) : null),
    [collection],
  );
  const [crates, setCrates] = useState(() => (collection?.['crates'] as number | undefined) ?? 1);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!collection) {
    return (
      <Screen>
        <BackLink />
        <AppText>This collection is not on this phone.</AppText>
      </Screen>
    );
  }

  const current: Row & { id: string } = collection;
  const farmerName = (farmer?.['name'] as string | undefined) ?? 'the farmer';
  const oldCrates = collection['crates'] as number;
  const price = collection['price_per_crate'] as number;
  const recordedBy = collection['recorded_by'] as string | null;
  const actor = { userId: me.id, role: me.role, farmerId: me.farmer_id };
  const mayCorrect = canUpdateRow(actor, 'collection', collection);
  const removed = Boolean(collection['deleted_at']);

  function apply(change: CollectionChange) {
    const phone = farmer?.['phone'] as string | undefined;
    if (!phone) return setError('This farmer has no phone number saved, so no corrected receipt can be sent. Add it on their profile first.');
    const rows = buildCollectionCorrection(make, (row, changes) => editedRow(row, { userId: me.id, deviceId }, changes) as Row & { id: string }, {
      collection: current,
      farmerPhone: phone,
      change,
      now: new Date().toISOString(),
    });
    if (!rows) return;
    try {
      saveRecords([
        { table: 'collection', row: rows.collection },
        { table: 'ledger_entry', row: rows.ledger },
        { table: 'sms_outbox', row: rows.sms },
      ]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    setDone({ kind: 'remove' in change ? 'removed' : 'corrected', smsId: rows.sms.id });
  }

  function confirmRemove() {
    Alert.alert(
      'Remove this collection?',
      `${oldCrates} crates from ${farmerName} (${formatGhs(lineTotal(oldCrates, price))}) will be taken off the records, and ${farmerName} gets an SMS to ignore the receipt. Use this when it was entered for the wrong farmer or by mistake.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => apply({ remove: true }) },
      ],
    );
  }

  const recorder = recordedBy === me.id ? 'you' : (users.find((u) => u.id === recordedBy)?.name ?? 'someone else');

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">Collection from {farmerName}</AppText>
      <AppText muted>
        {formatSyncTime(collection['collected_at'] as string)} · {oldCrates} crates · {formatGhs(collection['amount_paid'] as number)} · by {recorder}
      </AppText>

      {done ? (
        <>
          <InfoBox tone="good">
            <AppText bold style={{ color: tones.good.text }}>
              {done.kind === 'removed' ? 'Collection removed' : 'Correction saved'}
            </AppText>
            <AppText variant="small" style={{ color: tones.good.text }}>
              The egg fund has been corrected. Send {farmerName} the corrected receipt.
            </AppText>
          </InfoBox>
          <ReceiptBox smsId={done.smsId} farmerName={farmerName} title={`Corrected receipt to ${farmerName}`} />
        </>
      ) : removed ? (
        <InfoBox>
          <AppText>This collection was removed.</AppText>
        </InfoBox>
      ) : !mayCorrect ? (
        <InfoBox>
          <AppText>Only the person who collected it, or the admin, can correct this collection.</AppText>
        </InfoBox>
      ) : (
        <>
          <AppText variant="label" muted>
            The right number of crates
          </AppText>
          <Stepper value={crates} onChange={setCrates} min={1} max={99} unit="crates of 30 eggs" stepLabel="crate" />
          <View style={styles.line}>
            <AppText variant="bodyLarge">Paid to the farmer</AppText>
            <AppText variant="bodyLarge" bold>
              {formatGhs(lineTotal(crates, price))}
            </AppText>
          </View>
          {crates !== oldCrates ? (
            <AppText variant="small" muted>
              {crates < oldCrates
                ? `${formatGhs(lineTotal(oldCrates - crates, price))} goes back into the egg fund.`
                : `${formatGhs(lineTotal(crates - oldCrates, price))} more comes out of the egg fund.`}
            </AppText>
          ) : null}
          {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
          <Button label="Save correction" onPress={() => apply({ crates })} disabled={crates === oldCrates} />
          <Button label="Remove this collection" kind="danger" size="small" onPress={confirmRemove} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
});
