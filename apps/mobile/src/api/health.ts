import { healthResponseSchema, type HealthResponse } from '@wechiau/shared';
import { apiUrl } from '@/config';

export type ServerCheck =
  | { state: 'ok'; health: HealthResponse }
  | { state: 'degraded'; health: HealthResponse }
  | { state: 'unreachable'; error: string };

/** Asks GET /api/health whether the server and its database are up. */
export async function checkServer(timeoutMs = 8000): Promise<ServerCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiUrl}/health`, { signal: controller.signal });
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { state: 'unreachable', error: 'The server sent an answer this app does not understand.' };
    return { state: parsed.data.status === 'ok' ? 'ok' : 'degraded', health: parsed.data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { state: 'unreachable', error: aborted ? 'No answer within 8 seconds.' : 'No network or wrong server address.' };
  } finally {
    clearTimeout(timer);
  }
}
