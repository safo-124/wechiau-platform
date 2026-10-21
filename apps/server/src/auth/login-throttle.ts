import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
/** Wrong passwords allowed per phone or email in the window. */
const MAX_PER_ACCOUNT = 5;
/** Wrong passwords allowed from one address (many accounts) in the window. */
const MAX_PER_ADDRESS = 20;

interface Tally {
  failures: number;
  since: number;
}

/**
 * Slows down password guessing: after too many wrong passwords, sign-in is
 * refused for a while. Kept in memory, which is enough for one server; it
 * resets when the server restarts.
 */
@Injectable()
export class LoginThrottle {
  private readonly tallies = new Map<string, Tally>();

  private current(key: string, now: number): Tally {
    const tally = this.tallies.get(key);
    if (!tally || now - tally.since > WINDOW_MS) return { failures: 0, since: now };
    return tally;
  }

  /** Throws 429 when this account or address has had too many wrong tries. */
  check(account: string, address: string, now = Date.now()): void {
    const byAccount = this.current(`account:${account}`, now);
    const byAddress = this.current(`address:${address}`, now);
    if (byAccount.failures >= MAX_PER_ACCOUNT || byAddress.failures >= MAX_PER_ADDRESS) {
      throw new HttpException('Too many wrong tries. Wait 15 minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  failed(account: string, address: string, now = Date.now()): void {
    for (const key of [`account:${account}`, `address:${address}`]) {
      const tally = this.current(key, now);
      this.tallies.set(key, { failures: tally.failures + 1, since: tally.since });
    }
  }

  succeeded(account: string): void {
    this.tallies.delete(`account:${account}`);
  }

  /** For tests, which run many sign-ins against one server. */
  reset(): void {
    this.tallies.clear();
  }
}
