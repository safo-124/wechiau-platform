/**
 * The sync API (v0.3 section 7). Phones write to SQLite first and queue each
 * change in an outbox; the sync engine pushes the outbox, then pulls what
 * changed on the server since its cursor.
 */
import { z } from 'zod';
import { ROLES } from './roles.js';
import { timestamp, uuid } from './schemas/fields.js';

export const SYNC_OPS = ['upsert', 'delete'] as const;
export type SyncOp = (typeof SYNC_OPS)[number];

/** Pushes are batched; the phone sends at most this many changes at once. */
export const PUSH_BATCH_MAX = 500;
export const PULL_LIMIT_DEFAULT = 500;

/**
 * One queued change. `data` is the whole row as the phone has it. A delete is
 * a soft delete: the row with `deleted_at` set.
 */
export const pushChangeSchema = z.object({
  table: z.string().min(1).max(60),
  id: uuid,
  op: z.enum(SYNC_OPS),
  data: z.record(z.string(), z.unknown()),
  updatedAt: timestamp,
});
export type PushChange = z.infer<typeof pushChangeSchema>;

export const pushRequestSchema = z.object({
  deviceId: z.string().min(1).max(100),
  changes: z.array(pushChangeSchema).min(1).max(PUSH_BATCH_MAX),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const pushRejectionSchema = z.object({
  id: uuid,
  table: z.string(),
  /** Plain words for the person who made the change. */
  reason: z.string(),
});
export type PushRejection = z.infer<typeof pushRejectionSchema>;

/**
 * `accepted` includes changes the server already had, and older changes that
 * lost to a newer one: either way the phone can drop them from its outbox.
 */
export const pushResponseSchema = z.object({
  accepted: z.array(uuid),
  rejected: z.array(pushRejectionSchema),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

export const pullChangeSchema = z.object({
  table: z.string(),
  id: uuid,
  op: z.enum(SYNC_OPS),
  data: z.record(z.string(), z.unknown()),
  seq: z.int().nonnegative(),
});
export type PullChange = z.infer<typeof pullChangeSchema>;

export const pullResponseSchema = z.object({
  changes: z.array(pullChangeSchema),
  nextCursor: z.int().nonnegative(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

// ── Login ──────────────────────────────────────────────────────────────

/** Field and vet apps: phone and password once, then a PIN on the device. */
export const loginRequestSchema = z.object({
  phone: z.string().min(1).max(30),
  password: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(100),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionUserSchema = z.object({
  id: uuid,
  name: z.string(),
  role: z.enum(ROLES),
  farmer_id: uuid.nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const loginResponseSchema = z.object({
  token: z.string().min(32),
  user: sessionUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Dashboard: email and password (admins only). The session is kept in a secure cookie. */
export const dashboardLoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
export type DashboardLoginRequest = z.infer<typeof dashboardLoginRequestSchema>;

export const dashboardLoginResponseSchema = z.object({ user: sessionUserSchema });
export type DashboardLoginResponse = z.infer<typeof dashboardLoginResponseSchema>;

export const DASHBOARD_COOKIE = 'wechiau_session';
/**
 * The dashboard sends this header with every change. Other websites can't add
 * it to a request from Gloria's browser, so they can't use her cookie to make changes.
 */
export const DASHBOARD_HEADER = 'x-wechiau-dashboard';

/** Error bodies the API returns, so apps can show `message` to people. */
export const apiErrorSchema = z.object({
  statusCode: z.int(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** For the health of a phone's queue, shown on screens. */
export const syncStatusSchema = z.object({
  pending: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
  lastSyncedAt: timestamp.nullable(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;
