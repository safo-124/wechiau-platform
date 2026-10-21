import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  normalizeGhanaPhone,
  type Actor,
  type DashboardLoginRequest,
  type LoginRequest,
  type LoginResponse,
  type SessionUser,
} from '@wechiau/shared';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginThrottle } from './login-throttle.js';
import { hashPassword, verifyPassword } from './password.js';
import { hashSessionToken, newSessionToken } from './tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WRONG_LOGIN = 'Phone number or password is wrong.';
const WRONG_DASHBOARD_LOGIN = 'Email or password is wrong.';

export type SessionKind = 'device' | 'dashboard';

/**
 * Phones stay signed in for 180 days from last use, so a phone offline for weeks
 * still works. The dashboard can see everything, so it signs out after 12 hours
 * without use.
 */
const LIFETIME: Record<SessionKind, { ms: number; slideEveryMs: number }> = {
  device: { ms: 180 * DAY_MS, slideEveryMs: DAY_MS },
  dashboard: { ms: 12 * HOUR_MS, slideEveryMs: 5 * 60 * 1000 },
};

export interface Authenticated {
  actor: Actor;
  user: SessionUser;
  sessionId: string;
  kind: SessionKind;
}

const sessionUser = (user: User): SessionUser => ({ id: user.id, name: user.name, role: user.role, farmer_id: user.farmer_id });

@Injectable()
export class AuthService {
  /** Compared against when the account is unknown, so both cases take the same time. */
  private readonly dummyHash = hashPassword('not-a-real-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: LoginThrottle,
  ) {}

  private async checkPassword(user: User | null, password: string, account: string, address: string, wrong: string): Promise<User> {
    this.throttle.check(account, address);
    const passwordOk = await verifyPassword(password, user?.password_hash ?? (await this.dummyHash));
    if (!user || user.deleted_at || !user.password_hash || !passwordOk) {
      this.throttle.failed(account, address);
      throw new UnauthorizedException(wrong);
    }
    this.throttle.succeeded(account);
    if (user.status !== 'active') throw new ForbiddenException('This account is not active. Ask the admin.');
    return user;
  }

  /**
   * The phone apps: phone number and password, or for farmers the 6-digit PIN
   * their field agent gave them (SMS codes are paused). Each app then checks
   * the role is one it serves.
   */
  async login(request: LoginRequest, address = 'unknown'): Promise<LoginResponse> {
    const phone = normalizeGhanaPhone(request.phone);
    const user = phone ? await this.prisma.user.findUnique({ where: { phone } }) : null;
    const checked = await this.checkPassword(user, request.password, phone ?? request.phone, address, WRONG_LOGIN);
    const token = await this.createSession(checked.id, request.deviceId);
    return { token, user: sessionUser(checked) };
  }

  /** The dashboard: email and password, admins only. */
  async loginDashboard(request: DashboardLoginRequest, address = 'unknown'): Promise<{ token: string; user: SessionUser }> {
    const email = request.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    const checked = await this.checkPassword(user, request.password, email, address, WRONG_DASHBOARD_LOGIN);
    if (checked.role !== 'admin') throw new ForbiddenException('The dashboard is for the admin. Vets and field agents use their phone apps.');
    const token = await this.createSession(checked.id, 'dashboard', 'dashboard');
    return { token, user: sessionUser(checked) };
  }

  /** Also used by tests and, later, the SMS-code login. */
  async createSession(userId: string, deviceId: string, kind: SessionKind = 'device'): Promise<string> {
    const token = newSessionToken();
    await this.prisma.session.create({
      data: {
        token_hash: hashSessionToken(token),
        user_id: userId,
        device_id: deviceId,
        kind,
        expires_at: new Date(Date.now() + LIFETIME[kind].ms),
      },
    });
    return token;
  }

  /** Checks a token. Returns null when it is unknown, expired, revoked or the user is no longer active. */
  async authenticate(token: string): Promise<Authenticated | null> {
    const session = await this.prisma.session.findUnique({ where: { token_hash: hashSessionToken(token) } });
    const now = Date.now();
    if (!session || session.revoked_at || session.expires_at.getTime() <= now) return null;

    const user = await this.prisma.user.findUnique({ where: { id: session.user_id } });
    if (!user || user.deleted_at || user.status !== 'active') return null;

    const kind: SessionKind = session.kind === 'dashboard' ? 'dashboard' : 'device';
    // Move the expiry forward while the session is in use (not on every request).
    if (now - session.last_used_at.getTime() > LIFETIME[kind].slideEveryMs) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { last_used_at: new Date(now), expires_at: new Date(now + LIFETIME[kind].ms) },
      });
    }

    return { actor: { userId: user.id, role: user.role, farmerId: user.farmer_id }, user: sessionUser(user), sessionId: session.id, kind };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { revoked_at: new Date() } });
  }
}
