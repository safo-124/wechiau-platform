import { IDS, syncFields } from '@wechiau/shared/testing';
import { hashPassword } from '../../src/auth/password.js';
import type { TestApp } from './test-app.js';

export const TEST_PASSWORD = 'test-password-for-e2e';

export const PHONES = {
  gloria: '+233200000001',
  agent: '+233200000002',
  otherAgent: '+233200000005',
  kofi: '+233200000003',
  esi: '+233200000004',
  amaUser: '+233240000001',
} as const;

/** Ama's farm, as a field agent would register it. */
export function farmerRow(recordedBy: string, overrides: Record<string, unknown> = {}) {
  return {
    ...syncFields(recordedBy, { id: IDS.ama }),
    name: 'Ama',
    phone: '+233241234567',
    language: 'dga',
    lat: 10.35,
    lng: -2.47,
    digital_address: 'XX-000-0001',
    landmark: 'near the borehole',
    joined_on: '2026-08-04',
    status: 'active',
    consent_training: false,
    consent_recorded_at: null,
    ...overrides,
  };
}

export const GLORIA_EMAIL = 'gloria@wechiau.test';

const staff = (id: string, name: string, phone: string, role: 'admin' | 'field_agent' | 'vet', passwordHash: string, email: string | null = null) => ({
  id,
  created_at: new Date(),
  updated_at: new Date(),
  device_id: 'test',
  name,
  phone,
  role,
  email,
  status: 'active' as const,
  password_hash: passwordHash,
});

/** Gloria, two field agents and two vets (Kofi and Esi), each signed in. Ama's farmer login is created by `addAma`. */
export async function seedStaff(t: TestApp) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await t.prisma.user.createMany({
    data: [
      staff(IDS.gloria, 'Gloria Gyimaa', PHONES.gloria, 'admin', passwordHash, GLORIA_EMAIL),
      staff(IDS.agent, 'Agent One', PHONES.agent, 'field_agent', passwordHash, 'agent@wechiau.test'),
      staff(IDS.otherAgent, 'Agent Two', PHONES.otherAgent, 'field_agent', passwordHash),
      staff(IDS.kofi, 'Kofi', PHONES.kofi, 'vet', passwordHash),
      staff(IDS.esi, 'Esi', PHONES.esi, 'vet', passwordHash),
    ],
  });
  await logServerChanges(t, 'user', [IDS.gloria, IDS.agent, IDS.otherAgent, IDS.kofi, IDS.esi]);
  return {
    gloria: await t.auth.createSession(IDS.gloria, 'gloria-laptop'),
    agent: await t.auth.createSession(IDS.agent, 'agent-phone'),
    otherAgent: await t.auth.createSession(IDS.otherAgent, 'agent-two-phone'),
    kofi: await t.auth.createSession(IDS.kofi, 'kofi-phone'),
    esi: await t.auth.createSession(IDS.esi, 'esi-phone'),
  };
}

/** Ama's farmer login (farmers sign in by SMS code, so the session is made directly). */
export async function addAmaLogin(t: TestApp): Promise<string> {
  await t.prisma.user.create({
    data: {
      id: IDS.amaUser,
      created_at: new Date(),
      updated_at: new Date(),
      device_id: 'test',
      name: 'Ama',
      phone: PHONES.amaUser,
      role: 'farmer',
      farmer_id: IDS.ama,
      status: 'active',
    },
  });
  await logServerChanges(t, 'user', [IDS.amaUser]);
  return t.auth.createSession(IDS.amaUser, 'ama-phone');
}

/** Rows written straight to the database (as the dashboard will) go into change_log so phones pull them. */
export async function logServerChanges(t: TestApp, table: string, ids: string[]): Promise<void> {
  await t.prisma.changeLog.createMany({ data: ids.map((row_id) => ({ table_name: table, row_id, op: 'upsert', device_id: 'test' })) });
}
