import type { MessageLike } from '@wechiau/shared';
import { View } from 'react-native';
import { AppText } from './AppText';
import { MessageBubble } from './MessageBubble';
import { useUsers, useWaitingIds } from '@/data/hooks';
import { firstName } from '@/format';

/**
 * A farmer's messages as the vets see them: the farmer on the left, the vet
 * team on the right (the staff side is "mine" in the vet app).
 */
export function Conversation({ messages, farmerName, meId, empty }: { messages: readonly MessageLike[]; farmerName: string; meId: string; empty: string }) {
  const users = useUsers();
  const waiting = useWaitingIds('message');
  const from = (m: MessageLike) => {
    if (m.direction === 'from_farmer') return firstName(farmerName);
    if (m.sender_id === meId) return 'You';
    const person = users.find((u) => u.id === m.sender_id);
    return person?.name ? firstName(person.name) : 'Vet team';
  };
  if (messages.length === 0) return <AppText muted>{empty}</AppText>;
  return (
    <View style={{ gap: 10 }}>
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} mine={m.direction === 'to_farmer'} from={from(m)} waiting={waiting.has(m.id)} />
      ))}
    </View>
  );
}
