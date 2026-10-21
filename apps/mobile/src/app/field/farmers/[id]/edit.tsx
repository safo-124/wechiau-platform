import type { Language } from '@wechiau/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ZodError } from 'zod';
import { useSignedIn } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { FarmerForm } from '@/components/FarmerForm';
import { Screen } from '@/components/Screen';
import { db } from '@/db/client';
import { editedRow, newRow, saveRecords } from '@/db/records';
import type { Row } from '@/db/rows';
import { bird_count, farmer } from '@/db/schema';
import { displayPhone, type FarmerFormData, type FarmerFormValues } from '@/forms/farmer-form';
import { useSync } from '@/sync/SyncProvider';

const PROFILE_FIELDS = ['name', 'phone', 'language', 'landmark', 'digital_address', 'lat', 'lng', 'consent_training'] as const;

/** Edit a farmer's details. Field agents and the admin may edit any farmer (addendum section 3). */
export default function EditFarmer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSignedIn();
  const { requestSync } = useSync();

  // Read once when the screen opens, so a sync in the background doesn't reset what is being typed.
  const existing = useMemo(() => db.select().from(farmer).where(eq(farmer.id, id)).get(), [id]);
  const latestCount = useMemo(
    () =>
      db
        .select({ count: bird_count.count })
        .from(bird_count)
        .where(and(eq(bird_count.farmer_id, id), eq(bird_count.kind, 'verified'), isNull(bird_count.deleted_at)))
        .orderBy(desc(bird_count.counted_at))
        .get()?.count ?? null,
    [id],
  );

  if (!existing || existing.deleted_at) {
    return (
      <Screen>
        <BackLink />
        <AppText>This farmer is not on this phone.</AppText>
      </Screen>
    );
  }

  const initial: FarmerFormValues = {
    name: existing.name ?? '',
    phone: displayPhone(existing.phone),
    language: (existing.language as Language | null) ?? null,
    birds: latestCount === null ? '' : String(latestCount),
    landmark: existing.landmark ?? '',
    address: existing.digital_address ?? '',
    location: existing.lat !== null && existing.lng !== null ? { lat: existing.lat, lng: existing.lng } : null,
    consent: existing.consent_training ?? false,
  };

  function save(data: FarmerFormData): string | null {
    const current = existing as Row;
    const { birds, ...profile } = data;
    const profileChanged = PROFILE_FIELDS.some((field) => (current[field] ?? null) !== (profile[field] ?? null));
    const birdsChanged = birds !== latestCount;
    if (!profileChanged && !birdsChanged) {
      router.back();
      return null;
    }

    const context = { userId: session.user.id, deviceId: session.deviceId };
    const now = new Date().toISOString();
    const changes: Parameters<typeof saveRecords>[0] = [];
    if (profileChanged) {
      const consentAt = profile.consent_training ? ((current['consent_recorded_at'] as string | null) ?? now) : null;
      changes.push({ table: 'farmer', row: editedRow(current, context, { ...profile, consent_recorded_at: consentAt }) });
    }
    if (birdsChanged) {
      // Counts are never overwritten: a correction is a new verified count, and the latest one counts.
      changes.push({
        table: 'bird_count',
        row: newRow(context, {
          farmer_id: id,
          count: birds,
          kind: 'verified',
          source_type: 'registration',
          source_id: id,
          counted_at: now,
        }),
      });
    }

    try {
      saveRecords(changes);
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
      <AppText variant="title">{existing.name}</AppText>
      <AppText variant="small" muted>
        Member since {existing.joined_on}
      </AppText>
      <FarmerForm initial={initial} submitLabel="Save changes" onSubmit={save} />
    </Screen>
  );
}
