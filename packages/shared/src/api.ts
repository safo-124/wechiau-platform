import { z } from 'zod';
import { timestamp } from './schemas/fields.js';

/**
 * GET /api/health. Used by the apps to show whether the server can be
 * reached, and by the uptime check on the VPS. Returns 503 when the
 * database can't be reached.
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('wechiau-server'),
  version: z.string(),
  time: timestamp,
  database: z.enum(['ok', 'unreachable']),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * POST /api/farmers/<id>/app-access (admin or field agent, online). Sets up
 * the farmer app for a farmer: makes their login if they have none, and gives
 * a new 6-digit PIN. Doing it again gives a new PIN and signs the old one out.
 * The PIN is shown once, to hand to the farmer; only its hash is kept.
 */
export const FARMER_PIN_LENGTH = 6;
export const farmerAccessResponseSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  phone: z.string(),
  user_id: z.string(),
});
export type FarmerAccessResponse = z.infer<typeof farmerAccessResponseSchema>;
