import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { markSeen } from '@/chat/seen';
import { sendMessage } from '@/chat/send';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Conversation } from '@/components/Conversation';
import { MessageComposer } from '@/components/MessageComposer';
import { Screen } from '@/components/Screen';
import { useFarmerMessages, useFarmers, useRowFactory } from '@/data/hooks';
import { LANGUAGE_LABELS } from '@/format';
import { callPhone } from '@/linking';
import { useSync } from '@/sync/SyncProvider';

/** One farmer's conversation with the vet team, and a reply by voice or in writing. */
export default function VetConversation() {
  const { farmerId } = useLocalSearchParams<{ farmerId: string }>();
  const { user: me } = useSignedIn();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const farmer = useFarmers().find((f) => f.id === farmerId);
  const messages = useFarmerMessages(farmerId);

  const newest = messages.filter((m) => m.direction === 'from_farmer').at(-1)?.created_at ?? null;
  useEffect(() => markSeen(farmerId, newest), [farmerId, newest]);

  const name = farmer?.name ?? 'Farmer';
  return (
    <Screen>
      <BackLink label="Messages" />
      <View>
        <AppText variant="title">{name}</AppText>
        {farmer?.language ? (
          <AppText muted>Speaks {LANGUAGE_LABELS[farmer.language as keyof typeof LANGUAGE_LABELS] ?? farmer.language}. Reply by voice if they read little.</AppText>
        ) : null}
      </View>
      {farmer?.phone ? <Button label={`Call ${name}`} kind="secondary" size="small" onPress={() => callPhone(farmer.phone!)} /> : null}
      <Conversation messages={messages} farmerName={name} meId={me.id} empty="No messages yet." />
      <MessageComposer
        placeholder={`Write to ${name}`}
        sendLabel={`Send to ${name}`}
        send={(outgoing) => {
          sendMessage(make, { farmerId, senderId: me.id, from: 'staff' }, outgoing);
          requestSync();
        }}
      />
    </Screen>
  );
}
