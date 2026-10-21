import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Actor } from '@wechiau/shared';
import type { Authenticated } from './auth.service.js';

export const IS_PUBLIC = 'wechiau:isPublic';

/** Lets a route be called without signing in. Everything else needs a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthedRequest {
  auth?: Authenticated;
}

/** The signed-in person making the request. */
export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext): Authenticated => {
  const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error('CurrentAuth used on a public route');
  return auth;
});

export const CurrentActor = createParamDecorator(
  (_: unknown, context: ExecutionContext): Actor => {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) throw new Error('CurrentActor used on a public route');
    return auth.actor;
  },
);
