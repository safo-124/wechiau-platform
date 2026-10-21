import { buildCaseFromVisit, currentVets, TRIAGE_LABELS, type TriageLevel } from '@wechiau/shared';
import { colors } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useFarmers, useRowFactory, useVetAssignments } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

const LEVELS = (['urgent', 'medium', 'low'] as TriageLevel[]).map((value) => ({ value, label: TRIAGE_LABELS[value] }));

/** A vet opening a case, for example on a farm visit. It goes to the farmer's own vet. */
export default function NewCase() {
  const params = useLocalSearchParams<{ farmerId?: string }>();
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const farmers = useFarmers();
  const vets = currentVets(useVetAssignments());
  const [farmerId, setFarmerId] = useState<string | null>(params.farmerId ?? null);
  const [problem, setProblem] = useState('');
  const [triage, setTriage] = useState<TriageLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!farmerId) return setError('Choose the farmer.');
    if (!problem.trim()) return setError('Say what the problem is.');
    if (!triage) return setError('Choose how urgent it is.');
    const { healthCase, notes } = buildCaseFromVisit(make, {
      farmerId,
      vetId: me.id,
      farmersVet: vets.get(farmerId) ?? null,
      triage,
      problem,
    });
    try {
      saveRecords([{ table: 'health_case', row: healthCase }, ...notes.map((n) => ({ table: 'case_note' as const, row: n }))]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    router.replace({ pathname: '/vet/cases/[id]', params: { id: healthCase.id } });
  }

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">Open a case</AppText>
      {params.farmerId ? (
        <AppText bold>{farmers.find((f) => f.id === farmerId)?.name}</AppText>
      ) : (
        <ChipGroup label="Farmer" options={farmers.map((f) => ({ value: f.id, label: f.name ?? 'Farmer' }))} value={farmerId} onChange={setFarmerId} />
      )}
      <TextField label="What is the problem?" value={problem} onChangeText={setProblem} multiline placeholder="for example: birds coughing, 3 died since yesterday" />
      <ChipGroup<TriageLevel> label="How urgent?" options={LEVELS} value={triage} onChange={setTriage} />
      {farmerId && vets.get(farmerId) && vets.get(farmerId) !== me.id ? (
        <AppText variant="small" muted>
          This farm has another vet; the case goes to them, and you can still work on it.
        </AppText>
      ) : null}
      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Open case" onPress={save} />
    </Screen>
  );
}
