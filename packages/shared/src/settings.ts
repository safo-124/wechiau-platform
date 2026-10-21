import { z } from 'zod';
import { pesewas, positivePesewas } from './schemas/fields.js';

/**
 * Settings the admin changes on the dashboard. Phones receive them at their
 * next sync. Prices are copied onto each record when it is made, so changing
 * a price never changes past records.
 */
export const settingValueSchemas = {
  /** Price paid to farmers per crate (GHS 40). */
  buy_price_per_crate: positivePesewas,
  /** Selling price to Wa buyers per crate (GHS 52). */
  sell_price_per_crate: positivePesewas,
  /** Price per dose in paid rounds. Not decided yet (addendum section 6). */
  price_per_dose: pesewas.nullable(),
  /** Alert when vaccine doses left fall below this. */
  stock_alert_doses: z.int().nonnegative(),
  /** Safe cold-box range in °C. */
  cold_chain_min_c: z.number(),
  cold_chain_max_c: z.number(),
  /** SMS a few days before each vaccine round. Null turns it off. */
  remind_vaccine_sms_days_before: z.int().min(1).max(14).nullable(),
  /** Voice message the day before a round, in Dagaare or Waale. */
  remind_vaccine_voice: z.boolean(),
  /** Monthly SMS summary of each farmer's sales. */
  monthly_sales_summary_sms: z.boolean(),
} as const;

export type SettingKey = keyof typeof settingValueSchemas;
export type SettingValues = { [K in SettingKey]: z.infer<(typeof settingValueSchemas)[K]> };

export const SETTING_KEYS = Object.keys(settingValueSchemas) as SettingKey[];

export const DEFAULT_SETTINGS: SettingValues = {
  buy_price_per_crate: 4000,
  sell_price_per_crate: 5200,
  price_per_dose: null,
  stock_alert_doses: 100,
  cold_chain_min_c: 2,
  cold_chain_max_c: 8,
  remind_vaccine_sms_days_before: 3,
  remind_vaccine_voice: true,
  monthly_sales_summary_sms: false,
};

/** Whole settings set, with the cross-field checks the dashboard shows. */
export const settingsSchema = z
  .object(settingValueSchemas)
  .refine((s) => s.sell_price_per_crate > s.buy_price_per_crate, {
    message: 'Selling price must be higher than the price paid to farmers',
    path: ['sell_price_per_crate'],
  })
  .refine((s) => s.cold_chain_min_c < s.cold_chain_max_c, {
    message: 'The lowest safe temperature must be below the highest',
    path: ['cold_chain_max_c'],
  });

export function isColdChainSafe(tempC: number, settings: Pick<SettingValues, 'cold_chain_min_c' | 'cold_chain_max_c'>): boolean {
  return tempC >= settings.cold_chain_min_c && tempC <= settings.cold_chain_max_c;
}
