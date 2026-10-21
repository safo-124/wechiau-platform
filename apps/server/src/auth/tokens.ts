import { createHash, randomBytes } from 'node:crypto';

/** A new session token for a device. Only its hash is stored on the server. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
