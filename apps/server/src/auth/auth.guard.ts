import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DASHBOARD_COOKIE, DASHBOARD_HEADER } from '@wechiau/shared';
import { IS_PUBLIC, type AuthedRequest } from './auth.decorators.js';
import { AuthService } from './auth.service.js';

type Request = AuthedRequest & { method: string; headers: Record<string, string | undefined> };

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Applied to every route unless it is @Public(). Phones send
 * `Authorization: Bearer <token>`; the dashboard sends its session cookie,
 * and with it the dashboard header on every change.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const bearer = /^Bearer (\S+)$/.exec(request.headers['authorization'] ?? '')?.[1] ?? null;
    const cookie = bearer ? null : readCookie(request.headers['cookie'], DASHBOARD_COOKIE);
    const auth = bearer || cookie ? await this.auth.authenticate((bearer ?? cookie)!) : null;
    if (!auth) throw new UnauthorizedException('Please sign in again.');

    if (cookie) {
      // The cookie is only for dashboard sessions, and changes must come from the dashboard itself.
      if (auth.kind !== 'dashboard') throw new UnauthorizedException('Please sign in again.');
      if (!['GET', 'HEAD'].includes(request.method) && request.headers[DASHBOARD_HEADER] !== '1') {
        throw new ForbiddenException('This change did not come from the dashboard.');
      }
    }
    request.auth = auth;
    return true;
  }
}
