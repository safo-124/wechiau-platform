import { chatItems, localDate, nextRound } from '@wechiau/shared';
import { colors, radii, spacing, tones } from '@wechiau/ui/theme';
import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { markSeen } from '@/chat/seen';
import { sendMessage } from '@/chat/send';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { MessageBubble } from '@/components/MessageBubble';
import { MessageComposer } from '@/components/MessageComposer';
import { useMyFarm } from '@/data/farmer';
import { useCollections, useFarmerMessages, useRounds, useRowFactory, useUsers, useWaitingIds } from '@/data/hooks';
import { comingDay, daysUntil, firstName, LANGUAGE_LABELS } from '@/format';
import { useSync } from '@/sync/SyncProvider';

/**
 * Messages (design: farmer-app/Chat): the farmer's one conversation with the
 * vet team. Voice and written messages both ways, with each egg payment in
 * between, and the next vaccine day at the end.
 */
export default function FarmerMessages() {
  const { me, farmerId, farmer } = useMyFarm();
  const make = useRowFactory();
  const { requestSync } = useSync();
  const messages = useFarmerMessages(farmerId);
  const items = chatItems(messages, useCollections());
  const users = useUsers();
  const waiting = useWaitingIds('message');
  const next = nextRound(useRounds(), localDate());
  const scroll = useRef<ScrollViewInstance>(null);

  // Everything shown here counts as seen, for "1 new" on Home.
  const newest = messages.filter((m) => m.direction === 'to_farmer').at(-1)?.created_at ?? null;
  useEffect(() => markSeen(farmerId, newest), [farmerId, newest]);

  const from = (senderId: string | null) => {
    if (senderId === me.id) return 'You';
    const person = users.find((u) => u.id === senderId);
    return person?.name ? firstName(person.name) : 'Vet team';
  };
  // The next vaccine day, when it is within a week.
  const soon = next?.date && daysUntil(next.date) <= 7 ? comingDay(next.date) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior="height">
        <ScrollView ref={scroll} contentContainerStyle={styles.content} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <BackLink />
          <View>
            <AppText variant="title">Messages</AppText>
            <AppText muted>
              Wechiau Poultry vets{farmer?.language ? ` · replies in ${LANGUAGE_LABELS[farmer.language as keyof typeof LANGUAGE_LABELS] ?? 'your language'}` : ''}
            </AppText>
          </View>

          {items.length === 0 ? (
            <AppText muted>No messages yet. Record a message below and a vet will reply.</AppText>
          ) : (
            items.map((item) =>
              item.type === 'paid' ? (
                <View key={item.id} style={[styles.event, { backgroundColor: tones.money.background }]}>
                  <AppText bold style={{ color: tones.money.text }}>
                    {item.text}
                  </AppText>
                  <AppText variant="small" style={{ color: tones.money.text }}>
                    {item.detail}
                  </AppText>
                </View>
              ) : (
                <MessageBubble
                  key={item.id}
                  message={item.message}
                  mine={item.message.direction === 'from_farmer'}
                  from={from(item.message.sender_id)}
                  waiting={waiting.has(item.id)}
                />
              ),
            )
          )}

          {soon ? (
            <View style={[styles.event, { backgroundColor: tones.comingUp.background }]}>
              <AppText bold style={{ color: tones.comingUp.text }}>
                Vaccine day is {soon === 'Today' || soon === 'Tomorrow' ? soon.toLowerCase() : soon}
              </AppText>
              <AppText variant="small" style={{ color: tones.comingUp.text }}>
                Keep your birds in the pen that morning
              </AppText>
            </View>
          ) : null}

          <MessageComposer
            placeholder="Write to the vets"
            send={(outgoing) => {
              sendMessage(make, { farmerId, senderId: me.id, from: 'farmer' }, outgoing);
              requestSync();
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: spacing.screenPadding, gap: 12 },
  event: { alignSelf: 'center', alignItems: 'center', borderRadius: radii.tile, paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
});
