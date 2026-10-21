/**
 * Saving what farmers and vets send. The message (and for a report, its case)
 * is saved on the phone with its files queued in the same transaction; the
 * files go up after the records sync. Works with no network.
 */
import { buildFarmerReport, buildMessage, type RowFactory } from '@wechiau/shared';
import { saveRecords } from '@/db/records';
import type { Row } from '@/db/rows';
import type { NewUpload } from '@/uploads/store';
import type { TakenPhoto } from '@/uploads/photos';
import { VOICE_CONTENT_TYPE, type RecordedVoice } from '@/uploads/voice';

export interface Outgoing {
  voice: RecordedVoice | null;
  text: string;
  photo?: TakenPhoto | null;
}

function filesFor(messageId: string, outgoing: Outgoing): NewUpload[] {
  const files: NewUpload[] = [];
  if (outgoing.voice) files.push({ id: outgoing.voice.id, table: 'message', rowId: messageId, fileUri: outgoing.voice.uri, contentType: VOICE_CONTENT_TYPE });
  if (outgoing.photo) files.push({ id: outgoing.photo.id, table: 'message', rowId: messageId, fileUri: outgoing.photo.uri, contentType: 'image/jpeg' });
  return files;
}

const content = (outgoing: Outgoing) => ({
  voice: outgoing.voice ? { uploadId: outgoing.voice.id, seconds: outgoing.voice.seconds } : null,
  text: outgoing.text,
  photoUploadId: outgoing.photo?.id ?? null,
});

/** A message in a farmer's conversation. Throws if there is nothing to send or a row is invalid. */
export function sendMessage(
  make: RowFactory,
  input: { farmerId: string; senderId: string; from: 'farmer' | 'staff'; healthCaseId?: string | null },
  outgoing: Outgoing,
): void {
  const message = buildMessage(make, { ...input, ...content(outgoing) });
  saveRecords([{ table: 'message', row: message as Row }], { uploads: filesFor(message.id, outgoing) });
}

/** "Report a problem": a health case and its first message, together. */
export function sendFarmerReport(make: RowFactory, input: { farmerId: string; farmerUserId: string }, outgoing: Outgoing): void {
  const { healthCase, message } = buildFarmerReport(make, { ...input, ...content(outgoing) });
  saveRecords(
    [
      { table: 'health_case', row: healthCase as Row },
      { table: 'message', row: message as Row },
    ],
    { uploads: filesFor(message.id, outgoing) },
  );
}
