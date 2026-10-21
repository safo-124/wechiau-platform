import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  PULL_LIMIT_DEFAULT,
  pushRequestSchema,
  type Actor,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from '@wechiau/shared';
import { z } from 'zod';
import { CurrentActor } from '../auth/auth.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { SyncService } from './sync.service.js';

const pullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(PULL_LIMIT_DEFAULT).default(PULL_LIMIT_DEFAULT),
});
type PullQuery = z.infer<typeof pullQuerySchema>;

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** POST /api/sync/push: the phone's outbox, oldest first. */
  @Post('push')
  @HttpCode(200)
  push(@CurrentActor() actor: Actor, @Body(new ZodPipe(pushRequestSchema)) body: PushRequest): Promise<PushResponse> {
    return this.sync.push(actor, body);
  }

  /** GET /api/sync/pull?since=<cursor>&limit=500 */
  @Get('pull')
  pull(@CurrentActor() actor: Actor, @Query(new ZodPipe(pullQuerySchema)) query: PullQuery): Promise<PullResponse> {
    return this.sync.pull(actor, query.since, query.limit);
  }
}
