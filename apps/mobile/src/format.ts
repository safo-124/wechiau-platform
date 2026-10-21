import type { BUYER_TYPES, Language } from '@wechiau/shared';

export const LANGUAGE_LABELS: Record<Language, string> = { dga: 'Dagaare', wlx: 'Waale', eng: 'English' };

export const BUYER_TYPE_LABELS: Record<(typeof BUYER_TYPES)[number], string> = {
  wholesaler: 'Wholesaler',
  hotel: 'Hotel',
  school: 'School kitchen',
};

/** "10:32" today, otherwise "20 Oct, 10:32". */
export function formatSyncTime(iso: string, now = new Date()): string {
  const when = new Date(iso);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  if (when.toDateString() === now.toDateString()) return time;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][when.getMonth()];
  return `${when.getDate()} ${month}, ${time}`;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "just now", "20 minutes ago", "3 hours ago", "yesterday", "4 days ago", then the date. */
export function formatAgo(iso: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatSyncTime(iso, now);
}

export const CHANNEL_LABELS: Record<string, string> = { app: 'Farmer app', voice: 'Voice line', visit: 'Vet visit' };

/** "0:08", "1:25". */
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The farmer app's plain day words (design: farmer-app/Timeline): "Today",
 * "Yesterday", the weekday within a week, "Last week", then the month.
 */
export function storyDay(iso: string, now = new Date()): string {
  const when = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(when)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return DAYS[when.getDay()]!;
  if (days < 14) return 'Last week';
  return when.getFullYear() === now.getFullYear() ? MONTHS[when.getMonth()]! : `${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
}

/** Whole days from today to a YYYY-MM-DD date (0 is today, negative is past). */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

/** A coming date in plain words: "Today", "Tomorrow", "Friday" within a week, else "24 October". */
export function comingDay(date: string, now = new Date()): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const when = new Date(y, m - 1, d);
  const days = daysUntil(date, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return DAYS[when.getDay()]!;
  return `${when.getDate()} ${MONTHS[when.getMonth()]}`;
}

/** "0241234567" becomes "024 123 4567" as it is typed. A number starting with + keeps its digits unspaced. */
export function formatPhoneInput(text: string): string {
  if (text.trim().startsWith('+')) return `+${text.replace(/\D/g, '').slice(0, 15)}`;
  const digits = text.replace(/\D/g, '').slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ');
}
