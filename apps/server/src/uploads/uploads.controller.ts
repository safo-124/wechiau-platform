import { Body, Controller, Get, HttpCode, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_MAX_BYTES, uploadFieldsSchema, uuid, type Actor, type UploadFields, type UploadResponse } from '@wechiau/shared';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentActor } from '../auth/auth.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { UploadsService } from './uploads.service.js';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** POST /api/uploads/<id>: multipart form with `file`, `table` and `row_id`. */
  @Post(':id')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 } }))
  upload(
    @CurrentActor() actor: Actor,
    @Param('id', new ZodPipe(uuid)) id: string,
    @Body(new ZodPipe(uploadFieldsSchema)) fields: UploadFields,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadResponse> {
    return this.uploads.store(actor, id, fields, file?.buffer);
  }

  /** GET /api/uploads/<id>. Files never change once stored, so phones may cache them. */
  @Get(':id')
  async fetch(@CurrentActor() actor: Actor, @Param('id', new ZodPipe(uuid)) id: string, @Res() res: Response): Promise<void> {
    const file = await this.uploads.open(actor, id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(file.path);
  }
}
