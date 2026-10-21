export type SyncErrorKind = 'offline' | 'signed_out' | 'server';

/** Why a sync or API call stopped, so screens can say the right thing. */
export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
    /** The HTTP status, when the server answered. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export const OFFLINE_MESSAGE = 'Saved on this phone. Syncs when there is network.';
