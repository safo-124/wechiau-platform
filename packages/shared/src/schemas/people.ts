import { z } from 'zod';
import { ROLES } from '../roles.js';
import { date, digitalAddress, ghanaPhone, language, syncColumns, timestamp, uuid } from './fields.js';

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;

/** A login. Password hashes and tokens live only on the server, never here. */
export const userSchema = z
  .object({
    ...syncColumns,
    name: z.string().trim().min(1).max(100),
    phone: ghanaPhone,
    email: z.email().nullable(),
    role: z.enum(ROLES),
    /** Set only for farmers: the Farmer record this login belongs to. */
    farmer_id: uuid.nullable(),
    status: z.enum(USER_STATUSES),
  })
  .refine((u) => (u.role === 'farmer') === (u.farmer_id !== null), {
    message: 'Farmer logins must be linked to a farmer, and only farmer logins',
    path: ['farmer_id'],
  });
export type User = z.infer<typeof userSchema>;

export const FARMER_STATUSES = ['active', 'inactive'] as const;

export const farmerSchema = z
  .object({
    ...syncColumns,
    name: z.string().trim().min(1).max(100),
    phone: ghanaPhone,
    language,
    /** GPS from the phone. Directions always use these. */
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    /** GhanaPostGPS address, shown as a label. Missing addresses are flagged on the dashboard. */
    digital_address: digitalAddress.nullable(),
    landmark: z.string().trim().max(200).nullable(),
    joined_on: date,
    status: z.enum(FARMER_STATUSES),
    /** Consent to use this farmer's recordings to train the Dagaare speech model. */
    consent_training: z.boolean(),
    consent_recorded_at: timestamp.nullable(),
  })
  .refine((f) => (f.lat === null) === (f.lng === null), {
    message: 'Latitude and longitude are saved together',
    path: ['lng'],
  })
  .refine((f) => !f.consent_training || f.consent_recorded_at !== null, {
    message: 'Record when consent was given',
    path: ['consent_recorded_at'],
  });
export type Farmer = z.infer<typeof farmerSchema>;

/** Append only. A farmer's current vet is their latest row. Only the admin adds rows. */
export const vetAssignmentSchema = z.object({
  ...syncColumns,
  farmer_id: uuid,
  vet_id: uuid,
  assigned_at: timestamp,
});
export type VetAssignment = z.infer<typeof vetAssignmentSchema>;
