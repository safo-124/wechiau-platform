/**
 * Sample people and rows taken from the approved designs (Ama, Naa, Kofi, Gloria…),
 * for tests across the monorepo. Import from '@wechiau/shared/testing', never in app code.
 */
import type { Actor } from './permissions.js';

export const IDS = {
  gloria: '0b6a1c1e-0000-4000-8000-000000000001',
  agent: '0b6a1c1e-0000-4000-8000-000000000002',
  otherAgent: '0b6a1c1e-0000-4000-8000-000000000003',
  kofi: '0b6a1c1e-0000-4000-8000-000000000004',
  esi: '0b6a1c1e-0000-4000-8000-000000000005',
  amaUser: '0b6a1c1e-0000-4000-8000-000000000006',
  ama: '0b6a1c1e-0000-4000-8000-000000000101',
  naa: '0b6a1c1e-0000-4000-8000-000000000102',
  round2: '0b6a1c1e-0000-4000-8000-000000000201',
  batch: '0b6a1c1e-0000-4000-8000-000000000301',
} as const;

export const ACTORS = {
  gloria: { userId: IDS.gloria, role: 'admin', farmerId: null },
  agent: { userId: IDS.agent, role: 'field_agent', farmerId: null },
  otherAgent: { userId: IDS.otherAgent, role: 'field_agent', farmerId: null },
  kofi: { userId: IDS.kofi, role: 'vet', farmerId: null },
  ama: { userId: IDS.amaUser, role: 'farmer', farmerId: IDS.ama },
} as const satisfies Record<string, Actor>;

let counter = 0;
/** A fresh valid UUID (v4 layout) for test rows. */
export function testId(): string {
  counter += 1;
  return `0b6a1c1e-0000-4000-8000-${String(counter).padStart(12, '9')}`;
}

/** Sync columns for a row entered by `recordedBy`. */
export function syncFields(recordedBy: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: testId(),
    created_at: '2026-10-20T08:00:00.000Z',
    updated_at: '2026-10-20T08:00:00.000Z',
    deleted_at: null,
    device_id: 'test-device',
    recorded_by: recordedBy,
    ...overrides,
  };
}
