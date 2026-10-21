/**
 * What deserves a notification after a sync, worked out from what the sync
 * brought in (rows that weren't on the phone before it). Plain logic, tested
 * in Node; showing the notification is in notify.ts.
 *
 *   farmer     a vet (or the admin) wrote back
 *   vet        a farmer wrote or reported, for the vet's own farmers (and
 *              farmers with no vet yet); a case handed to them is urgent
 *   admin      a case a vet marked urgent
 */
import type { MessageLike, Role } from '@wechiau/shared';

export interface Notice {
  id: string;
  title: string;
  body: string;
  /** The screen to open when it is tapped. */
  url: string;
}

interface CaseLike {
  id: string;
  farmer_id: string | null;
  assigned_vet_id: string | null;
}

export interface NoticeInput {
  role: Role;
  userId: string;
  farmerId: string | null;
  /** Messages that arrived with this sync. */
  newMessages: readonly (MessageLike & { farmer_id: string | null })[];
  /** Open cases that became urgent with this sync. */
  newlyUrgent: readonly CaseLike[];
  farmerName(id: string | null): string;
  userName(id: string | null): string | null;
  vetOf(farmerId: string): string | null;
}

const seconds = (s: number | null) => `${Math.floor((s ?? 0) / 60)}:${String((s ?? 0) % 60).padStart(2, '0')}`;
const preview = (m: MessageLike) => (m.kind === 'voice' ? `Voice message ${seconds(m.audio_seconds)}` : (m.body ?? '').slice(0, 120));

export function newNotices(input: NoticeInput): Notice[] {
  const notices: Notice[] = [];

  if (input.role === 'farmer') {
    const replies = input.newMessages.filter((m) => m.direction === 'to_farmer' && m.farmer_id === input.farmerId && m.sender_id !== input.userId);
    if (replies.length === 1) {
      const m = replies[0]!;
      notices.push({ id: m.id, title: `Message from ${input.userName(m.sender_id) ?? 'the vet team'}`, body: preview(m), url: '/farmer/messages' });
    } else if (replies.length > 1) {
      notices.push({ id: replies.at(-1)!.id, title: `${replies.length} new messages from the vets`, body: preview(replies.at(-1)!), url: '/farmer/messages' });
    }
    return notices;
  }

  if (input.role === 'vet') {
    const mine = input.newMessages.filter((m) => {
      if (m.direction !== 'from_farmer' || !m.farmer_id) return false;
      const vet = input.vetOf(m.farmer_id);
      return vet === input.userId || vet === null;
    });
    const byFarmer = new Map<string, typeof mine>();
    for (const m of mine) byFarmer.set(m.farmer_id!, [...(byFarmer.get(m.farmer_id!) ?? []), m]);
    for (const [farmerId, list] of byFarmer) {
      const name = input.farmerName(farmerId);
      const reported = list.some((m) => m.health_case_id);
      notices.push({
        id: list.at(-1)!.id,
        title: reported ? `${name} reported a problem` : list.length > 1 ? `${name} sent ${list.length} messages` : `${name} sent a message`,
        body: preview(list.at(-1)!),
        url: `/vet/messages/${farmerId}`,
      });
    }
    for (const c of input.newlyUrgent.filter((c) => c.assigned_vet_id === input.userId)) {
      notices.push({ id: c.id, title: `Urgent case: ${input.farmerName(c.farmer_id)}`, body: 'You are the vet for this case.', url: `/vet/cases/${c.id}` });
    }
    return notices;
  }

  if (input.role === 'admin') {
    for (const c of input.newlyUrgent) {
      const vet = input.userName(c.assigned_vet_id);
      notices.push({
        id: c.id,
        title: `Urgent case: ${input.farmerName(c.farmer_id)}`,
        body: vet ? `${vet} is the vet for it.` : 'No vet has it yet.',
        url: c.farmer_id ? `/field/farmers/${c.farmer_id}` : '/field',
      });
    }
  }
  return notices;
}
