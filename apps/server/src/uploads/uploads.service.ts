import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  canRead,
  isUploadTable,
  uploadColumns,
  uploadKindOf,
  uploadRef,
  type Actor,
  type UploadContentType,
  type UploadFields,
  type UploadResponse,
} from '@wechiau/shared';
import { AppConfig } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromDbRow } from '../sync/row-codec.js';
import { tableDelegate } from '../sync/tables.js';

/** Recognises the file from its first bytes rather than trusting the name or the phone's label. */
function detectType(bytes: Buffer): UploadContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  // MP4 container (what Android records voice notes in, as .m4a): an "ftyp" box comes first.
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4';
  return null;
}

export interface StoredFile {
  path: string;
  contentType: string;
  size: number;
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private pathFor(id: string): string {
    return join(this.config.uploadsDir, id);
  }

  /**
   * Stores a file for a record that has already synced. Sending the same file
   * again (a retry) is fine; a different file under the same id is not.
   */
  async store(actor: Actor, id: string, fields: UploadFields, bytes: Buffer | undefined): Promise<UploadResponse> {
    if (!bytes || bytes.length === 0) throw new BadRequestException('No file was sent.');
    const contentType = detectType(bytes);
    if (!contentType) throw new UnsupportedMediaTypeException('Only JPEG or PNG photos and M4A voice notes can be uploaded.');

    const record = await tableDelegate(this.prisma, fields.table).findUnique({ where: { id: fields.row_id } });
    if (!record) throw new ConflictException('The record for this file has not synced yet. It will be sent again later.');
    if (record['recorded_by'] !== actor.userId) throw new ForbiddenException('You can only add files to records you entered.');
    const column = uploadColumns(fields.table).find(([name]) => record[name] === uploadRef(id));
    if (!column) throw new BadRequestException('This record does not point at this file.');
    // A photo column holds a photo, a voice column a voice note.
    if (uploadKindOf(contentType) !== column[1]) {
      throw new UnsupportedMediaTypeException(column[1] === 'audio' ? 'This should be a voice note (M4A).' : 'This should be a photo (JPEG or PNG).');
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = await this.prisma.upload.findUnique({ where: { id } });
    if (existing) {
      if (existing.sha256 !== sha256) throw new ConflictException('A different file was already sent with this id.');
      return { id, size: existing.size_bytes, content_type: existing.content_type as UploadContentType };
    }

    // Write to a temporary name first, so a half-written file is never served.
    await mkdir(this.config.uploadsDir, { recursive: true });
    const finalPath = this.pathFor(id);
    const tempPath = `${finalPath}.part`;
    await writeFile(tempPath, bytes);
    await rename(tempPath, finalPath);
    await this.prisma.upload.create({
      data: {
        id,
        table_name: fields.table,
        row_id: fields.row_id,
        content_type: contentType,
        size_bytes: bytes.length,
        sha256,
        uploaded_by: actor.userId,
      },
    });
    return { id, size: bytes.length, content_type: contentType };
  }

  /** A file, for anyone who may read the record it belongs to. Unknown and forbidden look the same. */
  async open(actor: Actor, id: string): Promise<StoredFile> {
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    const notFound = new NotFoundException('File not found.');
    if (!upload || !isUploadTable(upload.table_name)) throw notFound;
    const table = upload.table_name;
    const record = await tableDelegate(this.prisma, table).findUnique({ where: { id: upload.row_id } });
    if (!record || !canRead(actor, table, fromDbRow(table, record))) throw notFound;
    return { path: this.pathFor(id), contentType: upload.content_type, size: upload.size_bytes };
  }
}
