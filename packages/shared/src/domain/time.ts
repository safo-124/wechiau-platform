/** Dates as people on the phone see them (local time), for "today" and "this month". */

export function startOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function startOfLocalMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Whether an ISO timestamp falls on or after `start`. */
export function isSince(iso: string | null | undefined, start: Date): boolean {
  return iso != null && new Date(iso).getTime() >= start.getTime();
}

/** YYYY-MM-DD in local time. */
export function localDate(when = new Date()): string {
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "20 Oct" in local time, for receipts and lists. */
export function shortDate(iso: string): string {
  const when = new Date(iso);
  return `${when.getDate()} ${MONTHS[when.getMonth()]}`;
}

/** A local date some days from now, as YYYY-MM-DD. */
export function localDateInDays(days: number, now = new Date()): string {
  return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}
