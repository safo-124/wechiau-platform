/**
 * Files: visit photos, and the voice notes and photos in farmer messages.
 *
 * Sync carries records, not files. A record points at its file with
 * "upload:<id>", where the phone makes the id when the photo is taken or the
 * voice note recorded, so the record never has to change. The file goes up
 * separately, after its record has synced: POST /api/uploads/<id>. Anyone who
 * may read the record may fetch the file: GET /api/uploads/<id>.
 */
import { z } from 'zod';
import { uuid } from './schemas/fields.js';

export const UPLOAD_PREFIX = 'upload:';
/** Photos are resized and voice notes recorded small on the phone first, so they are far smaller than this. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;
/** Voice notes: AAC in an MP4 container (.m4a), what Android records. */
export const AUDIO_CONTENT_TYPES = ['audio/mp4'] as const;
export const UPLOAD_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, ...AUDIO_CONTENT_TYPES] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/** Which record columns may point at an upload, and what kind of file each holds. */
export const UPLOAD_COLUMNS = {
  visit: { photo_uri: 'image' },
  message: { audio_uri: 'audio', photo_uri: 'image' },
} as const;
export type UploadTable = keyof typeof UPLOAD_COLUMNS;
export type UploadKind = 'image' | 'audio';

export function isUploadTable(table: string): table is UploadTable {
  return table in UPLOAD_COLUMNS;
}

/** The upload columns of a table and their kinds. */
export function uploadColumns(table: UploadTable): [column: string, kind: UploadKind][] {
  return Object.entries(UPLOAD_COLUMNS[table]);
}

export function uploadKindOf(contentType: string): UploadKind | null {
  if ((IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType)) return 'image';
  if ((AUDIO_CONTENT_TYPES as readonly string[]).includes(contentType)) return 'audio';
  return null;
}

export function uploadRef(id: string): string {
  return `${UPLOAD_PREFIX}${id}`;
}

/** The upload id in "upload:<id>", or null for anything else. */
export function parseUploadRef(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(UPLOAD_PREFIX)) return null;
  const id = value.slice(UPLOAD_PREFIX.length);
  return uuid.safeParse(id).success ? id : null;
}

/** A nullable column that may only hold an upload reference. */
export const uploadRefColumn = (what: string) =>
  z
    .string()
    .max(500)
    .nullable()
    .refine((v) => v === null || parseUploadRef(v) !== null, `${what} must be an upload reference`);

/** The form fields sent with the file. */
export const uploadFieldsSchema = z.object({
  table: z.enum(Object.keys(UPLOAD_COLUMNS) as [UploadTable, ...UploadTable[]]),
  row_id: uuid,
});
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

export const uploadResponseSchema = z.object({
  id: uuid,
  size: z.int().positive(),
  content_type: z.enum(UPLOAD_CONTENT_TYPES),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
