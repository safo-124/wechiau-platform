import { ghsToPesewas, type Pesewas } from '../money.js';

/**
 * Reads a cedi amount as typed ("104", "104.50", "1,340", "GHS 40") into
 * pesewas. Returns null when it isn't a plain amount of 0 or more.
 */
export function parseGhsInput(text: string): Pesewas | null {
  const cleaned = text.replace(/ghs|₵|,|\s/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return ghsToPesewas(Number(cleaned));
}
