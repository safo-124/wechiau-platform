import { Injectable, NotFoundException } from '@nestjs/common';
import { buildMessage, currentVets, parseUploadRef, type Actor, type ConversationPage, type ConversationSummary, type MessageView } from '@wechiau/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncService } from '../sync/sync.service.js';
import { loadTable, newDashboardRow, saveThroughSync } from './records.js';

const seconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The farmers' conversations with the vet team, for the admin (Health ›
 * Messages). The admin may read every message (permissions map) and reply in
 * writing; replies go through sync like a vet's, so the farmer app gets them.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  private async people() {
    const [users, farmers, assignments, cases] = await Promise.all([
      loadTable(this.prisma, 'user'),
      loadTable(this.prisma, 'farmer'),
      loadTable(this.prisma, 'vet_assignment'),
      loadTable(this.prisma, 'health_case'),
    ]);
    const vets = currentVets(assignments);
    const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return { farmers, vets, cases, nameOf };
  }

  async conversations(): Promise<ConversationSummary[]> {
    const [messages, { farmers, vets, cases, nameOf }] = await Promise.all([loadTable(this.prisma, 'message'), this.people()]);
    const byFarmer = new Map<string, typeof messages>();
    for (const m of messages) byFarmer.set(m.farmer_id, [...(byFarmer.get(m.farmer_id) ?? []), m]);
    return [...byFarmer.entries()]
      .map(([farmerId, list]) => {
        const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const last = sorted.at(-1)!;
        return {
          farmerId,
          farmerName: farmers.find((f) => f.id === farmerId)?.name ?? 'A farmer',
          vetName: nameOf(vets.get(farmerId) ?? null),
          lastAt: last.created_at,
          lastDirection: last.direction,
          lastPreview: last.kind === 'voice' ? `Voice ${seconds(last.audio_seconds ?? 0)}` : (last.body ?? '').slice(0, 120),
          fromFarmer: sorted.filter((m) => m.direction === 'from_farmer').length,
          openCase: cases.some((c) => c.farmer_id === farmerId && c.status === 'open'),
        };
      })
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  async conversation(farmerId: string): Promise<ConversationPage> {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer || farmer.deleted_at) throw new NotFoundException('Farmer not found.');
    const [messages, { vets, nameOf }] = await Promise.all([loadTable(this.prisma, 'message'), this.people()]);
    const views: MessageView[] = messages
      .filter((m) => m.farmer_id === farmerId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        id: m.id,
        at: m.created_at,
        direction: m.direction,
        kind: m.kind,
        body: m.body,
        audioId: parseUploadRef(m.audio_uri),
        audioSeconds: m.audio_seconds,
        photoId: parseUploadRef(m.photo_uri),
        transcript: m.translation ?? m.transcript,
        senderName: m.direction === 'from_farmer' ? farmer.name : (nameOf(m.sender_id) ?? 'Vet team'),
        caseId: m.health_case_id,
      }));
    return {
      farmer: { id: farmer.id, name: farmer.name, phone: farmer.phone, language: farmer.language },
      vetName: nameOf(vets.get(farmerId) ?? null),
      messages: views,
    };
  }

  async reply(actor: Actor, farmerId: string, body: string): Promise<{ id: string }> {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer || farmer.deleted_at) throw new NotFoundException('Farmer not found.');
    const row = buildMessage((fields) => newDashboardRow(actor, fields), { farmerId, senderId: actor.userId, from: 'staff', text: body });
    await saveThroughSync(this.sync, actor, [{ table: 'message', row: row as ReturnType<typeof newDashboardRow> }]);
    return { id: row.id };
  }
}
