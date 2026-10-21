import { BUYER_TYPES, normalizeGhanaPhone } from '@wechiau/shared';
import { colors } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { ZodError } from 'zod';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useRowFactory } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { BUYER_TYPE_LABELS } from '@/format';
import { useSync } from '@/sync/SyncProvider';

type BuyerType = (typeof BUYER_TYPES)[number];
const TYPE_OPTIONS = BUYER_TYPES.map((value) => ({ value, label: BUYER_TYPE_LABELS[value] }));

/** A buyer in Wa. Field agents may add buyers; changing them is for the admin (addendum section 3). */
export default function NewBuyer() {
  const make = useRowFactory();
  const { requestSync } = useSync();
  const [name, setName] = useState('');
  const [type, setType] = useState<BuyerType | null>(null);
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const normalizedPhone = phone.trim() ? normalizeGhanaPhone(phone) : null;
    if (!name.trim()) return setError("Enter the buyer's name.");
    if (!type) return setError('Choose the kind of buyer.');
    if (phone.trim() && !normalizedPhone) return setError('Enter a Ghana phone number, like 024 123 4567, or leave it empty.');
    try {
      saveRecords([
        {
          table: 'buyer',
          row: make({ name: name.trim(), type, phone: normalizedPhone, location: location.trim() || null }),
        },
      ]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    router.back();
  }

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">Add a buyer</AppText>
      <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Wa Central Hotel" />
      <ChipGroup<BuyerType> label="Kind of buyer" options={TYPE_OPTIONS} value={type} onChange={setType} />
      <TextField
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        hint="Payment reminders go to this number."
      />
      <TextField label="Where in Wa (optional)" value={location} onChangeText={setLocation} />
      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Save buyer" onPress={save} />
    </Screen>
  );
}
