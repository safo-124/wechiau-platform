/**
 * Receipts go out through the phone's own SMS app for now (v0.3 Phase 2 step 5:
 * Expo's SMS module opens the messaging app with the text filled in, and the
 * person taps send). This works with phone signal and no internet.
 *
 * Every receipt is also kept in sms_outbox, so once an SMS provider is chosen
 * the server can send any that were never handed to the phone's SMS app.
 */
import * as SMS from 'expo-sms';
import { editedRow, saveRecords, type WriteContext } from '@/db/records';
import type { Row } from '@/db/rows';

export type ReceiptResult = 'opened' | 'unavailable';

export async function sendReceipt(sms: Row, context: WriteContext): Promise<ReceiptResult> {
  if (!(await SMS.isAvailableAsync())) return 'unavailable';
  // Android never says whether the message was sent; "sent" here means handed to the SMS app.
  await SMS.sendSMSAsync([sms['to_phone'] as string], sms['body'] as string);
  saveRecords([
    { table: 'sms_outbox', row: editedRow(sms, context, { status: 'sent', attempts: ((sms['attempts'] as number) ?? 0) + 1 }) },
  ]);
  return 'opened';
}
