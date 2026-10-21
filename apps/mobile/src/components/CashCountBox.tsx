import { countDifference, formatGhs, isSince, latestCount, parseGhsInput, type Pesewas, startOfLocalDay } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { useCashCounts, useRowFactory } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { formatSyncTime } from '@/format';
import { useSync } from '@/sync/SyncProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { TextField } from './TextField';

/** "Counted: matched", "GHS 10 short", "GHS 5 over". */
export function describeCount(count: { expected: number | null; counted: number | null }): { text: string; matched: boolean } {
  const difference = countDifference(count);
  if (difference === 0) return { text: `it matched ${formatGhs(count.counted ?? 0)}`, matched: true };
  return { text: `${formatGhs(Math.abs(difference))} ${difference < 0 ? 'short' : 'over'}`, matched: false };
}

/** Counting the cash in hand (design: field-app/Cash, "I counted the cash and it matches"). */
export function CashCountBox({ expected }: { expected: Pesewas }) {
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const counts = useCashCounts();
  const today = useMemo(() => startOfLocalDay(), []);
  const [mode, setMode] = useState<'idle' | 'mismatch'>('idle');
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const latest = latestCount(counts, me.id);
  const countedToday = latest !== null && isSince(latest.counted_at, today);

  function save(amount: Pesewas, reason: string | null) {
    try {
      saveRecords([
        { table: 'cash_count', row: make({ expected, counted: amount, note: reason, counted_at: new Date().toISOString() }) },
      ]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    setMode('idle');
    setCounting(false);
    setCounted('');
    setNote('');
    setError(null);
  }

  function saveMismatch() {
    const amount = parseGhsInput(counted);
    if (amount === null) return setError('Enter the cash you counted, for example 1330.');
    save(amount, note.trim() || null);
  }

  if (countedToday && !counting) {
    const { text, matched } = describeCount(latest);
    const look = matched ? tones.good : tones.problem;
    return (
      <View style={[styles.box, { backgroundColor: look.background }]}>
        <AppText bold style={{ color: look.text }}>
          Counted at {formatSyncTime(latest.counted_at ?? '')}: {text}
        </AppText>
        {latest.note ? (
          <AppText variant="small" style={{ color: look.text }}>
            {latest.note}
          </AppText>
        ) : null}
        <Button label="Count again" kind="secondary" size="small" onPress={() => setCounting(true)} />
      </View>
    );
  }

  return (
    <View style={[styles.box, styles.outlined]}>
      <AppText variant="label">Count the cash you hold</AppText>
      {mode === 'idle' ? (
        <>
          <Button label={`I counted it: ${formatGhs(expected)}, it matches`} kind="secondary" onPress={() => save(expected, null)} />
          <Button label="It doesn't match" kind="secondary" size="small" onPress={() => setMode('mismatch')} />
        </>
      ) : (
        <>
          <TextField label="Cash you counted (GHS)" value={counted} onChangeText={setCounted} keyboardType="decimal-pad" />
          <TextField
            label="What happened? (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="for example: paid Naa before recording it"
          />
          {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
          <Button label="Save count" onPress={saveMismatch} />
          <Button label="Back" kind="secondary" size="small" onPress={() => setMode('idle')} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.tile, padding: 14, gap: 8 },
  outlined: { borderWidth: 1.5, borderColor: colors.green },
});
