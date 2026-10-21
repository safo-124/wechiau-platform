import { z } from 'zod';
import { SETTING_KEYS, settingValueSchemas, type SettingKey } from '../settings.js';
import { count, ghanaPhone, syncColumns, timestamp, uuid } from './fields.js';

export const SMS_STATUSES = ['queued', 'sent', 'failed'] as const;

/** SMS waiting to go out (receipts, reminders, alerts). */
export const smsOutboxSchema = z.object({
  ...syncColumns,
  to_phone: ghanaPhone,
  body: z.string().min(1).max(480),
  status: z.enum(SMS_STATUSES),
  attempts: count,
});
export type SmsOutbox = z.infer<typeof smsOutboxSchema>;

/** One row per setting key. The value is checked against that key's schema. */
export const settingSchema = z
  .object({
    ...syncColumns,
    key: z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]),
    value: z.unknown(),
  })
  .superRefine((row, ctx) => {
    const result = settingValueSchemas[row.key].safeParse(row.value);
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: `Not a valid value for ${row.key}`, path: ['value'] });
    }
  });
export type Setting = z.infer<typeof settingSchema>;

export const REPORT_STATUSES = ['draft', 'approved', 'sent'] as const;

/** The monthly funder summary. AI writes the draft; only the admin approves. Dashboard only. */
export const monthlyReportSchema = z
  .object({
    ...syncColumns,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must look like 2026-10'),
    draft_text: z.string().max(20000),
    final_text: z.string().max(20000).nullable(),
    status: z.enum(REPORT_STATUSES),
    approved_by: uuid.nullable(),
    approved_at: timestamp.nullable(),
  })
  .refine((r) => r.status === 'draft' || (r.approved_by !== null && r.approved_at !== null && r.final_text !== null), {
    message: 'An approved report records who approved it and the final text',
    path: ['approved_by'],
  });
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
