import { DASHBOARD_HEADER } from '@wechiau/shared';

/** An error from the server, with a message meant for people. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Calls /api on the same address. The browser sends the dashboard's session
 * cookie by itself; changes also carry the dashboard header (see the server's
 * AuthGuard), which other websites can't add.
 */
export async function api<T>(path: string, options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && { [DASHBOARD_HEADER]: '1' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check the internet connection.");
  }
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (json as { message?: unknown } | null)?.message;
    throw new ApiError(response.status, typeof message === 'string' ? message : `The server answered ${response.status}.`);
  }
  return json as T;
}
