import { z } from 'zod';
import { uploadRefColumn } from '../uploads.js';
import { count, syncColumns, timestamp, uuid } from './fields.js';

/** Append only. A visit that counts birds also writes a verified BirdCount. */
export const visitSchema = z.object({
  ...syncColumns,
  farmer_id: uuid,
  visited_at: timestamp,
  deaths: count,
  suspected_cause: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  /** "upload:<id>": the photo goes up separately once the visit has synced. */
  photo_uri: uploadRefColumn('A photo'),
});
export type Visit = z.infer<typeof visitSchema>;

export const BIRD_COUNT_KINDS = ['reported', 'verified'] as const;
export const BIRD_COUNT_SOURCES = ['registration', 'visit', 'vaccination', 'farmer_app', 'voice_line'] as const;

/**
 * Append only. Reported counts come from farmers; verified counts from staff.
 * A report never overwrites a verified count: they are separate rows.
 */
export const birdCountSchema = z
  .object({
    ...syncColumns,
    farmer_id: uuid,
    count,
    kind: z.enum(BIRD_COUNT_KINDS),
    source_type: z.enum(BIRD_COUNT_SOURCES),
    source_id: uuid.nullable(),
    counted_at: timestamp,
  })
  .refine(
    (b) =>
      b.kind === 'reported'
        ? b.source_type === 'farmer_app' || b.source_type === 'voice_line'
        : b.source_type !== 'farmer_app' && b.source_type !== 'voice_line',
    { message: 'Reported counts come from farmers, verified counts from staff', path: ['source_type'] },
  );
export type BirdCount = z.infer<typeof birdCountSchema>;
