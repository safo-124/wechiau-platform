const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "20 Oct" from a date or timestamp. */
export function day(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "20 Oct, 14:05". */
export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${day(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "October" from "2026-10". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const LANGUAGES: Record<string, string> = { dga: 'Dagaare', wlx: 'Waale', eng: 'English' };
export const ROLE_NAMES: Record<string, string> = { admin: 'Admin', field_agent: 'Field agent', vet: 'Vet', farmer: 'Farmer' };
export const CHANNELS: Record<string, string> = { app: 'Farmer app', voice: 'Voice line', visit: 'Vet visit' };
export const TRIAGE: Record<string, string> = { urgent: 'Urgent', medium: 'Medium', low: 'Low' };
export const TRIAGE_TONE: Record<string, 'problem' | 'comingUp' | 'money'> = { urgent: 'problem', medium: 'comingUp', low: 'money' };
