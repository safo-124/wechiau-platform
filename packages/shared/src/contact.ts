/** Ghana phone numbers are stored in international form: +233 followed by 9 digits. */
export const GHANA_PHONE_PATTERN = /^\+233[235]\d{8}$/;

/**
 * Turns what people type ("024 123 4567", "0241234567", "233241234567")
 * into "+233241234567". Returns null when it is not a Ghana number.
 */
export function normalizeGhanaPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  let candidate: string;
  if (digits.startsWith('+233')) candidate = digits;
  else if (digits.startsWith('00233')) candidate = `+${digits.slice(2)}`;
  else if (digits.startsWith('233')) candidate = `+${digits}`;
  else if (digits.startsWith('0')) candidate = `+233${digits.slice(1)}`;
  else return null;
  return GHANA_PHONE_PATTERN.test(candidate) ? candidate : null;
}

/** GhanaPostGPS digital address: two letters, 3 or 4 digits, 4 digits (for example XX-000-0001). */
export const DIGITAL_ADDRESS_PATTERN = /^[A-Z]{2}-\d{3,4}-\d{4}$/;

/** Trims and upper-cases a typed digital address. Returns null when the format is wrong. */
export function normalizeDigitalAddress(input: string): string | null {
  const candidate = input.trim().toUpperCase().replace(/\s+/g, '');
  return DIGITAL_ADDRESS_PATTERN.test(candidate) ? candidate : null;
}
