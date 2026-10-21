import {
  apiErrorSchema,
  loginResponseSchema,
  pullResponseSchema,
  pushResponseSchema,
  uploadResponseSchema,
  farmerAccessResponseSchema,
  type FarmerAccessResponse,
  type LoginRequest,
  type LoginResponse,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type UploadResponse,
} from '@wechiau/shared';
import type { z } from 'zod';
import { apiUrl } from '@/config';
import { OFFLINE_MESSAGE, SyncError } from '@/sync/errors';
import type { UploadEntry } from '@/uploads/engine';

interface RequestOptions<T extends z.ZodType> {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** A multipart form (file uploads); the phone sets its own Content-Type with the boundary. */
  form?: FormData;
  token?: string;
  schema: T;
  timeoutMs?: number;
}

/** Calls the server and checks the answer against the shared schema. Network trouble becomes SyncError('offline'). */
async function request<T extends z.ZodType>(path: string, options: RequestOptions<T>): Promise<z.infer<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: controller.signal,
    });
  } catch {
    throw new SyncError('offline', OFFLINE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }

  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = apiErrorSchema.safeParse(json).data?.message ?? `The server answered ${response.status}.`;
    throw new SyncError(response.status === 401 ? 'signed_out' : 'server', message, response.status);
  }
  return options.schema.parse(json);
}

export const api = {
  login: (body: LoginRequest): Promise<LoginResponse> =>
    request('/auth/login', { method: 'POST', body, schema: loginResponseSchema }),
  push: (token: string, body: PushRequest): Promise<PushResponse> =>
    request('/sync/push', { method: 'POST', body, token, schema: pushResponseSchema, timeoutMs: 60_000 }),
  /** A new 6-digit PIN for the farmer app (field agents and the admin; needs network). */
  farmerAccess: (token: string, farmerId: string): Promise<FarmerAccessResponse> =>
    request(`/farmers/${farmerId}/app-access`, { method: 'POST', token, schema: farmerAccessResponseSchema }),
  pull: (token: string, since: number): Promise<PullResponse> =>
    request(`/sync/pull?since=${since}`, { token, schema: pullResponseSchema }),
  upload: (token: string, entry: UploadEntry): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('table', entry.table);
    form.append('row_id', entry.rowId);
    // React Native sends a local file when given its uri, name and type.
    const extension = entry.contentType === 'audio/mp4' ? 'm4a' : entry.contentType === 'image/png' ? 'png' : 'jpg';
    form.append('file', { uri: entry.fileUri, name: `${entry.id}.${extension}`, type: entry.contentType } as unknown as Blob);
    return request(`/uploads/${entry.id}`, { method: 'POST', form, token, schema: uploadResponseSchema, timeoutMs: 120_000 });
  },
};

/** Where a stored file can be fetched (needs the Authorization header). */
export function uploadUrl(id: string): string {
  return `${apiUrl}/uploads/${id}`;
}

export async function logout(token: string): Promise<void> {
  // Best effort: the phone forgets the token whether or not the server hears about it.
  await fetch(`${apiUrl}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}
