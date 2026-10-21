import { colors } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { ZodError } from 'zod';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useRowFactory } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

/** Vaccine received: a new batch and its doses into stock. */
export default function AddStock() {
  const make = useRowFactory();
  const { requestSync } = useSync();
  const [batchNo, setBatchNo] = useState('');
  const [vaccine, setVaccine] = useState('I-2 Newcastle vaccine');
  const [expiry, setExpiry] = useState('');
  const [doses, setDoses] = useState('');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const count = Number(doses);
    if (!batchNo.trim()) return setError('Enter the batch number from the vial or box.');
    if (!vaccine.trim()) return setError('Enter the vaccine name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry.trim())) return setError('Enter the expiry date as year-month-day, for example 2027-04-30.');
    if (!Number.isInteger(count) || count < 1) return setError('Enter how many doses, as a number.');
    const now = new Date().toISOString();
    const batch = make({ batch_no: batchNo.trim(), vaccine_name: vaccine.trim(), expiry_on: expiry.trim(), received_at: now });
    const stock = make({ batch_id: batch.id, doses: count, reason: 'received', source_type: null, source_id: null });
    try {
      saveRecords([
        { table: 'vaccine_batch', row: batch },
        { table: 'vaccine_stock_entry', row: stock },
      ]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    router.back();
  }

  return (
    <Screen>
      <BackLink label="Stock" />
      <AppText variant="title">Vaccine received</AppText>
      <TextField label="Batch number" value={batchNo} onChangeText={setBatchNo} autoCapitalize="characters" />
      <TextField label="Vaccine" value={vaccine} onChangeText={setVaccine} />
      <TextField label="Expiry date" value={expiry} onChangeText={setExpiry} placeholder="2027-04-30" keyboardType="numbers-and-punctuation" />
      <TextField label="Doses" value={doses} onChangeText={setDoses} keyboardType="number-pad" />
      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Add to stock" onPress={save} />
    </Screen>
  );
}
