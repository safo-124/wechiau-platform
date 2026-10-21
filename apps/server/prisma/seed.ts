/**
 * Sample staff logins and default settings for local development:
 * `npm run db:seed` from the repo root. Safe to run again.
 *
 * All seeded logins share one password, SEED_PASSWORD in apps/server/.env.
 * If it isn't there yet, one is generated and added to .env.
 * Refuses to run against any database whose name doesn't end in _dev or _test.
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_SETTINGS, SETTING_KEYS } from '@wechiau/shared';
import { hashPassword } from '../src/auth/password.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set. Run npm run db:setup first.');
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!/_(dev|test)$/.test(databaseName) && !process.argv.includes('--force')) {
  throw new Error(`Not seeding "${databaseName}": sample logins only go into *_dev or *_test databases.`);
}

let seedPassword = process.env['SEED_PASSWORD'];
if (!seedPassword) {
  seedPassword = randomBytes(9).toString('base64url');
  appendFileSync('.env', `\n# Password for the sample logins made by npm run db:seed (development only)\nSEED_PASSWORD="${seedPassword}"\n`);
  console.log('Added SEED_PASSWORD to apps/server/.env');
}

/** Sample people. The ids are fixed so re-running updates instead of duplicating. */
const USERS = [
  { id: '5eed0000-0000-4000-8000-000000000001', name: 'Gloria Gyimaa', phone: '+233200000001', role: 'admin', active: true, email: 'gloria@wechiau.test' },
  { id: '5eed0000-0000-4000-8000-000000000002', name: 'Sample Field Agent', phone: '+233200000002', role: 'field_agent', active: true },
  { id: '5eed0000-0000-4000-8000-000000000003', name: 'Kofi', phone: '+233200000003', role: 'vet', active: true },
  { id: '5eed0000-0000-4000-8000-000000000004', name: 'Esi', phone: '+233200000004', role: 'vet', active: true },
] as const;

/** Vaccination rounds Gloria would schedule in the dashboard: round 1 (free) done, round 2 (paid) today. */
const ROUNDS = [
  { id: '5eed0000-0000-4000-8000-300000000001', number: 1, date: '2026-09-10', is_free: true },
  { id: '5eed0000-0000-4000-8000-300000000002', number: 2, date: new Date().toISOString().slice(0, 10), is_free: false },
] as const;

/** One batch of vaccine in stock, as bought with the grant. */
const BATCH = { id: '5eed0000-0000-4000-8000-400000000001', batch_no: 'SAMPLE-I2-001', vaccine_name: 'I-2 Newcastle vaccine' };
const BATCH_STOCK_ID = '5eed0000-0000-4000-8000-400000000002';

/** Sample Wa buyers from the designs. */
const BUYERS = [
  { id: '5eed0000-0000-4000-8000-200000000001', name: 'Wa Wholesaler', type: 'wholesaler', location: 'Wa central market' },
  { id: '5eed0000-0000-4000-8000-200000000002', name: 'Wa Hotel', type: 'hotel', location: 'Wa' },
  { id: '5eed0000-0000-4000-8000-200000000003', name: 'School kitchen', type: 'school', location: 'Wa' },
] as const;

const SETTING_IDS: Record<string, string> = Object.fromEntries(
  SETTING_KEYS.map((key, index) => [key, `5eed0000-0000-4000-8000-1000000000${String(index).padStart(2, '0')}`]),
);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const passwordHash = await hashPassword(seedPassword!);
  const now = new Date();
  const sync = { updated_at: now, device_id: 'server-seed', recorded_by: null, deleted_at: null };

  await prisma.$transaction(async (tx) => {
    // Same lock as a sync push, so these changes get their place in change_log in order.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${7_301_001})`;

    for (const user of USERS) {
      const fields = {
        ...sync,
        name: user.name,
        phone: user.phone,
        email: 'email' in user ? user.email : null,
        role: user.role,
        farmer_id: null,
        status: user.active ? ('active' as const) : ('invited' as const),
        password_hash: user.active ? passwordHash : null,
      };
      await tx.user.upsert({ where: { id: user.id }, create: { id: user.id, created_at: now, ...fields }, update: fields });
      await tx.changeLog.create({ data: { table_name: 'user', row_id: user.id, op: 'upsert', device_id: 'server-seed' } });
    }

    for (const round of ROUNDS) {
      if (await tx.vaccinationRound.findUnique({ where: { id: round.id } })) continue;
      await tx.vaccinationRound.create({
        data: { ...round, date: new Date(`${round.date}T00:00:00.000Z`), price_per_dose: round.is_free ? 0 : null, created_at: now, ...sync },
      });
      await tx.changeLog.create({ data: { table_name: 'vaccination_round', row_id: round.id, op: 'upsert', device_id: 'server-seed' } });
    }

    if (!(await tx.vaccineBatch.findUnique({ where: { id: BATCH.id } }))) {
      const expiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
      await tx.vaccineBatch.create({ data: { ...BATCH, expiry_on: new Date(`${expiry.toISOString().slice(0, 10)}T00:00:00.000Z`), received_at: now, created_at: now, ...sync } });
      await tx.vaccineStockEntry.create({
        data: { id: BATCH_STOCK_ID, batch_id: BATCH.id, doses: 800, reason: 'received', source_type: null, source_id: null, created_at: now, ...sync },
      });
      await tx.changeLog.createMany({
        data: [
          { table_name: 'vaccine_batch', row_id: BATCH.id, op: 'upsert', device_id: 'server-seed' },
          { table_name: 'vaccine_stock_entry', row_id: BATCH_STOCK_ID, op: 'upsert', device_id: 'server-seed' },
        ],
      });
    }

    for (const buyer of BUYERS) {
      if (await tx.buyer.findUnique({ where: { id: buyer.id } })) continue;
      await tx.buyer.create({ data: { ...buyer, created_at: now, ...sync, phone: null } });
      await tx.changeLog.create({ data: { table_name: 'buyer', row_id: buyer.id, op: 'upsert', device_id: 'server-seed' } });
    }

    for (const key of SETTING_KEYS) {
      const id = SETTING_IDS[key]!;
      const value = DEFAULT_SETTINGS[key] ?? null;
      const existing = await tx.setting.findUnique({ where: { key } });
      if (existing) continue; // keep whatever the admin has set
      await tx.setting.create({ data: { id, created_at: now, ...sync, key, value: value === null ? Prisma.JsonNull : value } });
      await tx.changeLog.create({ data: { table_name: 'setting', row_id: id, op: 'upsert', device_id: 'server-seed' } });
    }
  });

  console.log(`Seeded ${databaseName}:`);
  for (const user of USERS) {
    console.log(`  ${user.role.padEnd(12)} ${user.name.padEnd(20)} ${user.phone}${'email' in user ? `  ${user.email} (dashboard)` : ''}${user.active ? '' : '  (invited, no login yet)'}`);
  }
  console.log(`  ${BUYERS.length} sample Wa buyers, vaccination rounds 1 and 2, and 800 doses of ${BATCH.vaccine_name}`);
  console.log('Password for these logins: SEED_PASSWORD in apps/server/.env');
}

await main().finally(() => prisma.$disconnect());
