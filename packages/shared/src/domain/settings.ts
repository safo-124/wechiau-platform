import { DEFAULT_SETTINGS, SETTING_KEYS, settingValueSchemas, type SettingKey, type SettingValues } from '../settings.js';

export interface PhoneSettings {
  values: SettingValues;
  /** Keys this phone hasn't received from the server yet; their defaults are used. */
  missing: SettingKey[];
}

/** The admin's settings as synced to this phone, with the defaults for anything not received yet. */
export function readSettings(
  rows: readonly { key: string | null; value: unknown; deleted_at?: string | null }[],
): PhoneSettings {
  const values: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.key || row.deleted_at || !(SETTING_KEYS as string[]).includes(row.key)) continue;
    const parsed = settingValueSchemas[row.key as SettingKey].safeParse(row.value);
    if (parsed.success) {
      values[row.key] = parsed.data;
      seen.add(row.key);
    }
  }
  return { values: values as SettingValues, missing: SETTING_KEYS.filter((key) => !seen.has(key)) };
}
