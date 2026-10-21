import { randomInt, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FARMER_PIN_LENGTH, normalizeGhanaPhone, type Actor, type FarmerAccessResponse } from '@wechiau/shared';
import { hashPassword } from '../auth/password.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** PINs that are too easy to guess: one digit repeated, or counting up or down. */
function isWeak(pin: string): boolean {
  return /^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin);
}

function newPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** FARMER_PIN_LENGTH)).padStart(FARMER_PIN_LENGTH, '0');
    if (!isWeak(pin)) return pin;
  }
}

/**
 * Sets up the farmer app for a farmer (v0.3 phase 7, with SMS codes paused):
 * the field agent or the admin, with the farmer, gets a 6-digit PIN for the
 * farmer to sign in with their phone number. The server writes the login
 * itself, because only the admin may add user rows through sync.
 */
@Injectable()
export class FarmerAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(actor: Actor, farmerId: string): Promise<FarmerAccessResponse> {
    if (actor.role !== 'admin' && actor.role !== 'field_agent') throw new ForbiddenException('Field agents and the admin set up the farmer app.');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer || farmer.deleted_at) throw new NotFoundException('Farmer not found. If you just registered them, sync first.');
    if (farmer.status !== 'active') throw new BadRequestException(`${farmer.name} is marked as no longer with Wechiau.`);
    const phone = farmer.phone ? normalizeGhanaPhone(farmer.phone) : null;
    if (!phone) throw new BadRequestException(`Add ${farmer.name}'s phone number first, then sync. They sign in with it.`);

    const pin = newPin();
    const passwordHash = await hashPassword(pin);
    const now = new Date();
    const userId = await this.prisma.$transaction(async (tx) => {
      // Same lock as a sync push, so the change gets its place in change_log in order.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${7_301_001})`;
      const samePhone = await tx.user.findUnique({ where: { phone } });
      const existing = await tx.user.findFirst({ where: { farmer_id: farmerId, role: 'farmer', deleted_at: null } });
      // A login the admin turned off stays off until the admin turns it on.
      if (existing?.status === 'disabled') {
        throw new BadRequestException(`${farmer.name}'s farmer app login is turned off. The admin can turn it on in the dashboard, under Settings.`);
      }
      if (samePhone && samePhone.id !== existing?.id) {
        throw new ConflictException(`The phone number ${phone} is already used by ${samePhone.name}'s login. Each farmer needs their own number.`);
      }
      const fields = { name: farmer.name, phone, status: 'active' as const, password_hash: passwordHash, updated_at: now, device_id: 'server', deleted_at: null };
      let id: string;
      if (existing) {
        id = existing.id;
        await tx.user.update({ where: { id }, data: fields });
        // A new PIN ends every sign-in with the old one.
        await tx.session.updateMany({ where: { user_id: id, revoked_at: null }, data: { revoked_at: now } });
      } else {
        id = randomUUID();
        await tx.user.create({ data: { id, created_at: now, recorded_by: actor.userId, role: 'farmer', farmer_id: farmerId, email: null, ...fields } });
      }
      await tx.changeLog.create({ data: { table_name: 'user', row_id: id, op: 'upsert', device_id: 'server' } });
      return id;
    });
    return { pin, phone, user_id: userId };
  }
}
