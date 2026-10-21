import { Controller, Param, Post } from '@nestjs/common';
import { uuid, type Actor, type FarmerAccessResponse } from '@wechiau/shared';
import { CurrentActor } from '../auth/auth.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { FarmerAccessService } from './farmer-access.service.js';

@Controller('farmers')
export class FarmerAccessController {
  constructor(private readonly access: FarmerAccessService) {}

  /** POST /api/farmers/<id>/app-access: a new 6-digit PIN for the farmer app (shown once). */
  @Post(':id/app-access')
  grant(@CurrentActor() actor: Actor, @Param('id', new ZodPipe(uuid)) id: string): Promise<FarmerAccessResponse> {
    return this.access.grant(actor, id);
  }
}
