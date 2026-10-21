import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { replyRequestSchema, uuid, type Actor, type ConversationPage, type ConversationSummary, type ReplyRequest } from '@wechiau/shared';
import { CurrentActor } from '../auth/auth.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { adminOnly } from './dashboard.controller.js';
import { MessagesService } from './messages.service.js';

const idPipe = new ZodPipe(uuid);

/** /api/dashboard/messages: the farmers' conversations with the vet team. Admins only. */
@Controller('dashboard/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<ConversationSummary[]> {
    adminOnly(actor);
    return this.messages.conversations();
  }

  @Get(':farmerId')
  conversation(@CurrentActor() actor: Actor, @Param('farmerId', idPipe) farmerId: string): Promise<ConversationPage> {
    adminOnly(actor);
    return this.messages.conversation(farmerId);
  }

  @Post(':farmerId')
  reply(@CurrentActor() actor: Actor, @Param('farmerId', idPipe) farmerId: string, @Body(new ZodPipe(replyRequestSchema)) body: ReplyRequest): Promise<{ id: string }> {
    return this.messages.reply(adminOnly(actor), farmerId, body.body);
  }
}
