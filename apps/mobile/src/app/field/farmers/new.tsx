import { router } from 'expo-router';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { FarmerForm } from '@/components/FarmerForm';
import { Screen } from '@/components/Screen';
import { newRow, saveRecords } from '@/db/records';
import { EMPTY_FARMER_FORM, type FarmerFormData } from '@/forms/farmer-form';
import { useSync } from '@/sync/SyncProvider';

/** Today's date on the phone, as YYYY-MM-DD. */
function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Register a farmer (v0.3 Phase 1 step 3). */
export default function NewFarmer() {
  const session = useSignedIn();
  const { requestSync } = useSync();

  function save(data: FarmerFormData): string | null {
    const context = { userId: session.user.id, deviceId: session.deviceId };
    const now = new Date().toISOString();
    const { birds, ...profile } = data;
    const farmerRow = newRow(context, {
      ...profile,
      joined_on: localDate(),
      status: 'active',
      consent_recorded_at: profile.consent_training ? now : null,
    });
    // The count at registration is the first verified count (addendum section 4.2).
    const birdCountRow = newRow(context, {
      farmer_id: farmerRow['id'],
      count: birds,
      kind: 'verified',
      source_type: 'registration',
      source_id: farmerRow['id'],
      counted_at: now,
    });
    try {
      saveRecords([
        { table: 'farmer', row: farmerRow },
        { table: 'bird_count', row: birdCountRow },
      ]);
    } catch (error) {
      return `Not saved: ${error instanceof ZodError ? error.issues[0]?.message : String(error)}`;
    }
    requestSync();
    router.back();
    return null;
  }

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">Register a farmer</AppText>
      <FarmerForm initial={EMPTY_FARMER_FORM} submitLabel="Save farmer" onSubmit={save} />
    </Screen>
  );
}
