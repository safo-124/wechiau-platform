import { describe, expect, it } from 'vitest';
import { newNotices, type NoticeInput } from './notices';

const message = (id: string, fields: Partial<NoticeInput['newMessages'][number]>) => ({
  id,
  created_at: '2026-10-21T09:00:00.000Z',
  direction: 'from_farmer',
  kind: 'text',
  body: 'My birds are coughing',
  audio_uri: null,
  audio_seconds: null,
  photo_uri: null,
  sender_id: 'ama-user',
  health_case_id: null,
  farmer_id: 'ama',
  ...fields,
});

const base: Omit<NoticeInput, 'role' | 'userId' | 'farmerId'> = {
  newMessages: [],
  newlyUrgent: [],
  farmerName: (id) => ({ ama: 'Ama', naa: 'Naa' })[id ?? ''] ?? 'A farmer',
  userName: (id) => ({ kofi: 'Kofi', esi: 'Esi' })[id ?? ''] ?? null,
  vetOf: (farmerId) => ({ ama: 'kofi' })[farmerId] ?? null,
};

describe('newNotices', () => {
  it('tells a farmer when a vet writes back, but not about their own messages', () => {
    const notices = newNotices({
      ...base,
      role: 'farmer',
      userId: 'ama-user',
      farmerId: 'ama',
      newMessages: [message('m1', {}), message('m2', { direction: 'to_farmer', sender_id: 'kofi', kind: 'voice', body: null, audio_seconds: 15 })],
    });
    expect(notices).toEqual([{ id: 'm2', title: 'Message from Kofi', body: 'Voice message 0:15', url: '/farmer/messages' }]);
  });

  it('tells a vet about their own farmers and farmers with no vet, one notice per farmer', () => {
    const input = {
      ...base,
      role: 'vet' as const,
      farmerId: null,
      newMessages: [message('m1', { health_case_id: 'case-1' }), message('m2', { body: 'And three died' }), message('m3', { farmer_id: 'naa', sender_id: 'naa-user' })],
    };
    expect(newNotices({ ...input, userId: 'kofi' })).toEqual([
      { id: 'm2', title: 'Ama reported a problem', body: 'And three died', url: '/vet/messages/ama' },
      { id: 'm3', title: 'Naa sent a message', body: 'My birds are coughing', url: '/vet/messages/naa' },
    ]);
    // Esi only hears about Naa, who has no vet yet.
    expect(newNotices({ ...input, userId: 'esi' }).map((n) => n.title)).toEqual(['Naa sent a message']);
  });

  it('tells the vet and the admin about cases that became urgent', () => {
    const newlyUrgent = [{ id: 'case-1', farmer_id: 'ama', assigned_vet_id: 'kofi' }];
    expect(newNotices({ ...base, role: 'vet', userId: 'kofi', farmerId: null, newlyUrgent })).toEqual([
      { id: 'case-1', title: 'Urgent case: Ama', body: 'You are the vet for this case.', url: '/vet/cases/case-1' },
    ]);
    expect(newNotices({ ...base, role: 'admin', userId: 'gloria', farmerId: null, newlyUrgent })).toEqual([
      { id: 'case-1', title: 'Urgent case: Ama', body: 'Kofi is the vet for it.', url: '/field/farmers/ama' },
    ]);
    expect(newNotices({ ...base, role: 'field_agent', userId: 'agent', farmerId: null, newlyUrgent })).toEqual([]);
  });
});
