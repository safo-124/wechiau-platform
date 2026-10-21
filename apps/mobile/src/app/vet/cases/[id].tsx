import { buildCaseDecision, type CaseDecision, localDateInDays, TRIAGE_LABELS, type TriageLevel } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { markSeen } from '@/chat/seen';
import { sendMessage } from '@/chat/send';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { CaseTag } from '@/components/CaseTag';
import { ChipGroup } from '@/components/ChipGroup';
import { Conversation } from '@/components/Conversation';
import { Navigation, Phone } from '@/components/icons';
import { MessageComposer } from '@/components/MessageComposer';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { StatTile, TileRow } from '@/components/Tiles';
import {
  useCaseNotes,
  useFarmerCounts,
  useFarmerMessages,
  useFarmers,
  useFarmerVaccinations,
  useFarmerVisits,
  useHealthCases,
  useRowFactory,
  useUsers,
  useVets,
} from '@/data/hooks';
import { editedRow, saveRecords } from '@/db/records';
import type { Row } from '@/db/rows';
import { CHANNEL_LABELS, formatAgo, formatSyncTime } from '@/format';
import { callPhone, openDirections } from '@/linking';
import { useSync } from '@/sync/SyncProvider';

const LEVELS: TriageLevel[] = ['urgent', 'medium', 'low'];
const DIAGNOSES = ['Suspected Newcastle', 'Other respiratory', 'Injury', 'Feed or water', 'Other'] as const;
const FOLLOW_UPS = [
  { value: '1', label: 'Tomorrow' },
  { value: '3', label: 'In 3 days' },
  { value: '7', label: 'In a week' },
  { value: 'none', label: 'No follow-up' },
] as const;

/** Case detail (design: vet-app/Case). AI urgency is only a suggestion until a vet sets it. */
export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me, deviceId } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const healthCase = useHealthCases().find((c) => c.id === id);
  const farmer = useFarmers().find((f) => f.id === healthCase?.farmer_id);
  const notes = useCaseNotes(id);
  const users = useUsers();
  const vets = useVets();
  const counts = useFarmerCounts(healthCase?.farmer_id ?? '');
  const visits = useFarmerVisits(healthCase?.farmer_id ?? '');
  const vaccinations = useFarmerVaccinations(healthCase?.farmer_id ?? '');
  // The farmer's report and the replies about this case.
  const caseMessages = useFarmerMessages(healthCase?.farmer_id ?? '').filter((m) => m.health_case_id === id);
  const newestFromFarmer = caseMessages.filter((m) => m.direction === 'from_farmer').at(-1)?.created_at ?? null;
  useEffect(() => {
    if (healthCase?.farmer_id) markSeen(healthCase.farmer_id, newestFromFarmer);
  }, [healthCase?.farmer_id, newestFromFarmer]);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [treatment, setTreatment] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!healthCase) {
    return (
      <Screen>
        <BackLink />
        <AppText>This case is not on this phone.</AppText>
      </Screen>
    );
  }

  const current = healthCase as unknown as Row & { id: string };
  const nameOf = (userId: string | null) => (userId === me.id ? 'you' : (users.find((u) => u.id === userId)?.name ?? 'a vet'));
  const birds = counts.find((c) => c.kind === 'verified')?.count ?? counts[0]?.count ?? null;
  const lastVisit = visits[0];
  const lastVaccination = [...vaccinations].sort((a, b) => (b.vaccinated_at ?? '').localeCompare(a.vaccinated_at ?? ''))[0];
  const open = healthCase.status === 'open';

  function decide(decision: CaseDecision): boolean {
    const result = buildCaseDecision(make, (row, changes) => editedRow(row, { userId: me.id, deviceId }, changes) as Row & { id: string }, {
      healthCase: current,
      vetId: me.id,
      decision,
      now: new Date().toISOString(),
    });
    if (!result) return false;
    const changes: Parameters<typeof saveRecords>[0] = result.notes.map((n) => ({ table: 'case_note' as const, row: n }));
    if (result.healthCase !== current) changes.unshift({ table: 'health_case', row: result.healthCase });
    try {
      saveRecords(changes);
    } catch (e) {
      setError(`Not saved: ${e instanceof ZodError ? e.issues[0]?.message : String(e)}`);
      return false;
    }
    setError(null);
    requestSync();
    return true;
  }

  function handOver(to: { id: string; name: string }) {
    Alert.alert(`Hand this case to ${to.name}?`, `${to.name} becomes the vet for this case. You can still see and help with it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hand over', onPress: () => decide({ assignTo: to }) },
    ]);
  }

  const shownDiagnosis = diagnosis ?? healthCase.diagnosis ?? '';
  const shownTreatment = treatment ?? healthCase.treatment ?? '';
  const otherVets = vets.filter((v) => v.id !== healthCase.assigned_vet_id);

  return (
    <Screen>
      <BackLink label="Cases" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">
            {farmer?.name ?? 'Farmer'}
            {birds !== null ? ` · ${birds} birds` : ''}
          </AppText>
          <AppText variant="small" muted>
            {CHANNEL_LABELS[healthCase.channel ?? ''] ?? 'Report'}, {formatAgo(healthCase.created_at)} · vet: {nameOf(healthCase.assigned_vet_id)}
          </AppText>
        </View>
        <CaseTag status={healthCase.status} triage={healthCase.triage} suggested={healthCase.triage_suggested} />
      </View>
      <View style={styles.actions}>
        {farmer?.lat != null && farmer.lng != null ? (
          <Pressable
            onPress={() => openDirections(farmer.lat!, farmer.lng!, farmer.name ?? 'Farm')}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${farmer.name}'s farm`}
            style={[styles.round, { backgroundColor: colors.blue }]}
          >
            <Navigation size={22} color={colors.white} />
          </Pressable>
        ) : null}
        {farmer?.phone ? (
          <Pressable
            onPress={() => callPhone(farmer.phone!)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${farmer.name}`}
            style={[styles.round, styles.roundOutline]}
          >
            <Phone size={22} color={colors.green} />
          </Pressable>
        ) : null}
        {farmer?.landmark || farmer?.digital_address ? (
          <AppText variant="small" style={{ color: colors.blue, flex: 1 }}>
            {[farmer.digital_address, farmer.landmark].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
      </View>

      {caseMessages.length ? (
        <Conversation messages={caseMessages} farmerName={farmer?.name ?? 'Farmer'} meId={me.id} empty="" />
      ) : null}

      {/* Urgency: the AI only suggests; a vet decides. */}
      {open ? (
        <View
          style={[
            styles.triage,
            { backgroundColor: healthCase.triage === 'urgent' || (!healthCase.triage && healthCase.triage_suggested === 'urgent') ? tones.problem.background : tones.comingUp.background },
          ]}
        >
          <AppText bold>
            {healthCase.triage
              ? `${TRIAGE_LABELS[healthCase.triage as TriageLevel]}, confirmed by ${nameOf(healthCase.triage_confirmed_by)}`
              : healthCase.triage_suggested
                ? `AI suggests: ${TRIAGE_LABELS[healthCase.triage_suggested as TriageLevel].toLowerCase()}. Please check.`
                : 'How urgent is it?'}
          </AppText>
          <View style={styles.levels}>
            {LEVELS.map((level) => (
              <View key={level} style={{ flex: 1 }}>
                <Button
                  label={healthCase.triage === level ? `${TRIAGE_LABELS[level]} ✓` : TRIAGE_LABELS[level]}
                  kind={level === 'urgent' ? 'danger' : 'secondary'}
                  size="small"
                  disabled={healthCase.triage === level}
                  onPress={() => decide({ triage: level })}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <TileRow>
        <StatTile tone="good" value={lastVaccination ? String(lastVaccination.birds_vaccinated) : '–'} label="Last vaccinated" />
        <StatTile tone={lastVisit?.deaths ? 'problem' : 'neutral'} value={lastVisit ? String(lastVisit.deaths ?? 0) : '–'} label="Deaths last visit" />
        <StatTile tone="neutral" value={lastVisit ? formatSyncTime(lastVisit.visited_at ?? '') : '–'} label="Last visit" />
      </TileRow>

      {open ? (
        <>
          <AppText variant="label">Your assessment</AppText>
          <ChipGroup
            options={DIAGNOSES.map((d) => ({ value: d, label: d }))}
            value={(DIAGNOSES as readonly string[]).includes(shownDiagnosis) ? (shownDiagnosis as (typeof DIAGNOSES)[number]) : null}
            onChange={(d) => setDiagnosis(d)}
          />
          <TextField label="Diagnosis" value={shownDiagnosis} onChangeText={setDiagnosis} />
          <TextField label="Treatment and advice" value={shownTreatment} onChangeText={setTreatment} multiline />
          <Button
            label="Save assessment"
            disabled={diagnosis === null && treatment === null}
            onPress={() => {
              if (decide({ diagnosis: diagnosis ?? undefined, treatment: treatment ?? undefined })) {
                setDiagnosis(null);
                setTreatment(null);
              }
            }}
          />

          <ChipGroup
            label="Follow up"
            options={FOLLOW_UPS}
            value={null}
            onChange={(v) => decide({ followUpOn: v === 'none' ? null : localDateInDays(Number(v)) })}
          />
          {healthCase.follow_up_on ? (
            <AppText variant="small" muted>
              Follow-up set for {healthCase.follow_up_on}
            </AppText>
          ) : null}

          {otherVets.length ? (
            <ChipGroup
              label="Hand over to another vet"
              options={otherVets.map((v) => ({ value: v.id, label: v.name ?? 'Vet' }))}
              value={null}
              onChange={(vetId) => handOver({ id: vetId, name: otherVets.find((v) => v.id === vetId)?.name ?? 'the vet' })}
            />
          ) : null}
        </>
      ) : null}

      <View style={styles.history}>
        <AppText variant="label">History</AppText>
        {notes.length === 0 ? (
          <AppText variant="small" muted>
            Nothing written yet.
          </AppText>
        ) : (
          notes.map((n) => (
            <View key={n.id} style={styles.note}>
              <AppText>{n.body}</AppText>
              <AppText variant="small" muted>
                {nameOf(n.recorded_by)} · {formatSyncTime(n.created_at)}
              </AppText>
            </View>
          ))
        )}
        <TextField label="Add a note" value={note} onChangeText={setNote} multiline placeholder="for example: called the farmer" />
        <Button
          label="Add note"
          kind="secondary"
          size="small"
          disabled={!note.trim()}
          onPress={() => {
            if (decide({ note })) setNote('');
          }}
        />
      </View>

      {error ? <AppText style={{ color: colors.red }}>{error}</AppText> : null}
      {open ? (
        <Button
          label="Close the case"
          kind="secondary"
          disabled={!healthCase.triage}
          onPress={() => decide({ close: true })}
        />
      ) : (
        <Button label="Open the case again" kind="secondary" onPress={() => decide({ reopen: true })} />
      )}
      {open && !healthCase.triage ? (
        <AppText variant="small" muted>
          Set the urgency before closing.
        </AppText>
      ) : null}
      {healthCase.farmer_id ? (
        <>
          <AppText variant="label">Reply to {farmer?.name ?? 'the farmer'}</AppText>
          <MessageComposer
            placeholder="Isolate sick birds. A vet will visit today."
            sendLabel="Send reply"
            send={(outgoing) => {
              sendMessage(make, { farmerId: healthCase.farmer_id!, senderId: me.id, from: 'staff', healthCaseId: healthCase.id }, outgoing);
              requestSync();
            }}
          />
          <Button
            label="All messages with this farmer"
            kind="secondary"
            size="small"
            onPress={() => router.push({ pathname: '/vet/messages/[farmerId]', params: { farmerId: healthCase.farmer_id! } })}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  roundOutline: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  triage: { borderRadius: radii.tile, padding: 14, gap: 10 },
  levels: { flexDirection: 'row', gap: 8 },
  history: { borderRadius: radii.tile, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 10 },
  note: { gap: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
