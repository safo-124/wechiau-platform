import { formatGhs, parseGhsInput } from '@wechiau/shared';
import { colors } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { InfoBox } from '@/components/Tiles';
import { useRowFactory, useUsers } from '@/data/hooks';
import { saveRecords } from '@/db/records';
import { useSync } from '@/sync/SyncProvider';

/**
 * Cash moving between Gloria and a field agent (addendum section 4.2,
 * CashHandover). Only the admin records these. The egg fund total doesn't change.
 */
export default function Handover() {
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const agents = useUsers().filter((u) => u.role === 'field_agent' && u.status === 'active');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [direction, setDirection] = useState<'to_agent' | 'from_agent'>('to_agent');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (me.role !== 'admin') {
    return (
      <Screen>
        <BackLink />
        <AppText>Only the admin records cash handovers.</AppText>
      </Screen>
    );
  }

  const agent = agents.find((a) => a.id === agentId);

  function save() {
    const pesewas = parseGhsInput(amount);
    if (!agent) return setError('Choose the field agent.');
    if (pesewas === null || pesewas <= 0) return setError('Enter the amount, for example 500.');
    const toAgent = direction === 'to_agent';
    const row = make({
      from_user_id: toAgent ? me.id : agent.id,
      to_user_id: toAgent ? agent.id : me.id,
      amount: pesewas,
      handed_at: new Date().toISOString(),
    });
    try {
      saveRecords([{ table: 'cash_handover', row }]);
    } catch (e) {
      return setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
    }
    requestSync();
    router.back();
  }

  const pesewas = parseGhsInput(amount);
  const summary =
    agent && pesewas
      ? direction === 'to_agent'
        ? `You give ${formatGhs(pesewas)} to ${agent.name} to pay farmers.`
        : `${agent.name} hands ${formatGhs(pesewas)} back to you.`
      : null;

  return (
    <Screen>
      <BackLink label="Cash" />
      <AppText variant="title">Cash handover</AppText>
      {agents.length === 0 ? (
        <InfoBox>
          <AppText>No field agents yet. Add them in the dashboard under People and access.</AppText>
        </InfoBox>
      ) : (
        <ChipGroup
          label="Field agent"
          options={agents.map((a) => ({ value: a.id, label: a.name ?? 'Agent' }))}
          value={agentId}
          onChange={setAgentId}
        />
      )}
      <ChipGroup
        label="Which way"
        options={[
          { value: 'to_agent', label: 'I gave cash' },
          { value: 'from_agent', label: 'I received cash' },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <TextField label="Amount (GHS)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      {summary ? (
        <InfoBox tone="money">
          <AppText style={{ color: colors.blue }}>{summary}</AppText>
        </InfoBox>
      ) : null}
      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      <Button label="Save handover" onPress={save} disabled={agents.length === 0} />
    </Screen>
  );
}
