import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema, type HealthResponse } from '@wechiau/shared';

/** GET /api/health. A 503 still carries a health body (database down), so it is parsed too. */
async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return healthResponseSchema.parse(await response.json());
}

export function useServerHealth() {
  return useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false, refetchInterval: 60_000 });
}
