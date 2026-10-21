/**
 * Money is stored and calculated as whole pesewas (GHS 1 = 100 pesewas).
 * GHS 40.00 is 4000. Never store or add cedis as floating-point numbers.
 */
export type Pesewas = number;

const MINUS = '−'; // the dashboard designs use a true minus sign

export function isPesewas(value: unknown): value is Pesewas {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertPesewas(value: number, what = 'amount'): asserts value is Pesewas {
  if (!isPesewas(value)) {
    throw new RangeError(`${what} must be a whole number of pesewas, got ${value}`);
  }
}

/** Converts a cedi amount typed by a person (for example 40 or 40.5) to pesewas. */
export function ghsToPesewas(ghs: number): Pesewas {
  if (!Number.isFinite(ghs)) {
    throw new RangeError(`Not a number of cedis: ${ghs}`);
  }
  const pesewas = Math.round(ghs * 100);
  if (Math.abs(ghs * 100 - pesewas) > 1e-6) {
    throw new RangeError(`More than two decimal places: ${ghs}`);
  }
  assertPesewas(pesewas);
  return pesewas;
}

export function pesewasToGhs(pesewas: Pesewas): number {
  assertPesewas(pesewas);
  return pesewas / 100;
}

/** quantity × unit price, for example crates × price per crate. */
export function lineTotal(quantity: number, unitPrice: Pesewas): Pesewas {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a whole number of 0 or more, got ${quantity}`);
  }
  assertPesewas(unitPrice, 'unit price');
  const total = quantity * unitPrice;
  assertPesewas(total, 'total');
  return total;
}

export function sumPesewas(amounts: readonly Pesewas[]): Pesewas {
  let total = 0;
  for (const amount of amounts) {
    assertPesewas(amount);
    total += amount;
  }
  assertPesewas(total, 'total');
  return total;
}

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats pesewas as a cedi number without the currency: 134000 → "1,340",
 * 4050 → "40.50". With `signed`, positives get "+" and negatives "−",
 * as in the dashboard ledger.
 */
export function formatAmount(pesewas: Pesewas, options: { signed?: boolean } = {}): string {
  assertPesewas(pesewas);
  const abs = Math.abs(pesewas);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const digits = fraction === 0 ? groupThousands(whole) : `${groupThousands(whole)}.${String(fraction).padStart(2, '0')}`;
  if (pesewas < 0) return `${MINUS}${digits}`;
  if (pesewas > 0 && options.signed) return `+${digits}`;
  return digits;
}

/** Formats pesewas for people: 134000 → "GHS 1,340", −24000 → "−GHS 240". */
export function formatGhs(pesewas: Pesewas): string {
  const digits = formatAmount(Math.abs(pesewas));
  return pesewas < 0 ? `${MINUS}GHS ${digits}` : `GHS ${digits}`;
}
