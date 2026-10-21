/** PIN rules for the field and vet apps (v0.3: phone and password once, then a PIN). Plain logic, tested in Node. */

export const PIN_LENGTH = 4;
/** After this many wrong PINs the person signs in with their password again. */
export const MAX_PIN_FAILURES = 5;
/** Away from the app for longer than this, and the PIN is asked again. */
export const LOCK_AFTER_MS = 2 * 60 * 1000;

const TOO_EASY = new Set(['1234', '4321', '0123', '1212', '2580']);

/** Why a new PIN can't be used, or null when it's fine. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `Use ${PIN_LENGTH} numbers.`;
  if (/^(\d)\1+$/.test(pin) || TOO_EASY.has(pin)) return 'That PIN is too easy to guess. Choose another.';
  return null;
}

/** Whether to ask for the PIN again when the app comes back. */
export function shouldLock(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt > LOCK_AFTER_MS;
}
