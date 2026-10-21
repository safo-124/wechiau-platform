/**
 * Creates the first admin on a new server, or resets an admin's password if
 * they're locked out. Run on the VPS through infra/deploy/admin-account.sh:
 *
 *   sudo bash admin-account.sh --name "Gloria Gyimaa" --phone 024XXXXXXX --email gloria@example.com
 *
 * Asks for the password twice and never shows it. Resetting a password signs
 * that admin out everywhere. Also adds the default settings when a new
 * database has none, so phones and the server start from the same prices.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_SETTINGS, normalizeGhanaPhone, SETTING_KEYS } from '@wechiau/shared';
import { hashPassword } from '../auth/password.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** The dashboard has no second sign-in step yet, so admin passwords are longer than staff ones. */
const ADMIN_PASSWORD_MIN = 12;
const DEVICE = 'server-cli';

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

let pipedLines: AsyncIterator<string> | null = null;

/** Reads a line without echoing it. When input is piped, reads the next piped line. */
async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(`${question}\n`);
    pipedLines ??= createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    const next = await pipedLines.next();
    return next.done ? '' : next.value;
  }
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new Error('Cancelled.'));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const { values } = parseArgs({
    options: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Give the admin\'s email with --email (they sign in to the dashboard with it).');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) fail('DATABASE_URL is not set. Run this through infra/deploy/admin-account.sh on the server.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deleted_at: null } });
    if (existing && existing.role !== 'admin') fail(`${existing.name} is a ${existing.role}. This tool only creates or resets admins.`);
    if (existing?.status === 'disabled') fail(`${existing.name}'s account is turned off. Another admin can turn it on from the dashboard.`);

    let phone: string | null = null;
    if (!existing) {
      if (!values.name?.trim()) fail('This is a new admin: give their name with --name.');
      phone = values.phone ? normalizeGhanaPhone(values.phone) : null;
      if (!phone) fail('This is a new admin: give a Ghana phone number with --phone, like 024 123 4567 (they sign in to the field app with it).');
      const samePhone = await prisma.user.findUnique({ where: { phone } });
      if (samePhone) fail(`${samePhone.name} already has the phone number ${phone}.`);
    }

    console.log(existing ? `Resetting the password for ${existing.name} (${email}).` : `Creating the admin ${values.name!.trim()} (${email}, ${phone}).`);
    const password = await askHidden(`Password (at least ${ADMIN_PASSWORD_MIN} characters, not shown): `);
    if (password.length < ADMIN_PASSWORD_MIN) fail(`Use at least ${ADMIN_PASSWORD_MIN} characters. Nothing was changed.`);
    if ((await askHidden('Type it again: ')) !== password) fail('The two passwords are different. Nothing was changed.');
    const passwordHash = await hashPassword(password);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Same lock as a sync push, so these changes get their place in change_log in order.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${7_301_001})`;
      const sync = { updated_at: now, device_id: DEVICE, recorded_by: null, deleted_at: null };

      const userId = existing?.id ?? randomUUID();
      if (existing) {
        await tx.user.update({ where: { id: userId }, data: { password_hash: passwordHash, status: 'active', updated_at: now, device_id: DEVICE } });
        await tx.session.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } });
      } else {
        await tx.user.create({
          data: { id: userId, created_at: now, ...sync, name: values.name!.trim(), phone: phone!, email, role: 'admin', farmer_id: null, status: 'active', password_hash: passwordHash },
        });
      }
      await tx.changeLog.create({ data: { table_name: 'user', row_id: userId, op: 'upsert', device_id: DEVICE } });

      for (const key of SETTING_KEYS) {
        if (await tx.setting.findUnique({ where: { key } })) continue; // keep whatever the admin has set
        const id = randomUUID();
        const value = DEFAULT_SETTINGS[key] ?? null;
        await tx.setting.create({ data: { id, created_at: now, ...sync, key, value: value === null ? Prisma.JsonNull : value } });
        await tx.changeLog.create({ data: { table_name: 'setting', row_id: id, op: 'upsert', device_id: DEVICE } });
      }
    });

    console.log(existing ? 'Done. The new password works now, and old sign-ins have ended.' : 'Done. Sign in to the dashboard with this email and password.');
  } finally {
    await prisma.$disconnect();
  }
}

await main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
