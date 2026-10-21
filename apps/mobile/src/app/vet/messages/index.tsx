import { currentVets, unreadCount } from '@wechiau/shared';
import { colors } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '@/auth/session';
import { useSeenTimes } from '@/chat/seen';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { ChevronRight } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { Tag } from '@/components/Tiles';
import { useFarmers, useMessages, useVetAssignments } from '@/data/hooks';
import { formatAgo, formatSeconds } from '@/format';

/**
 * Messages from farmers, one conversation per farmer, newest first: the
 * vet's own farmers, then everyone else's. Any vet can answer any farmer.
 */
export default function VetMessages() {
  const { user: me } = useSignedIn();
  const farmers = useFarmers();
  const messages = useMessages();
  const vets = currentVets(useVetAssignments());

  const byFarmer = new Map<string, typeof messages>();
  for (const m of messages) if (m.farmer_id) byFarmer.set(m.farmer_id, [...(byFarmer.get(m.farmer_id) ?? []), m]);
  const seen = useSeenTimes([...byFarmer.keys()]);
  const conversations = [...byFarmer.entries()]
    .map(([farmerId, list]) => ({
      farmerId,
      name: farmers.find((f) => f.id === farmerId)?.name ?? 'A farmer',
      last: list.at(-1)!,
      unread: unreadCount(list, seen(farmerId), 'from_farmer'),
      mine: vets.get(farmerId) === me.id,
    }))
    .sort((a, b) => (b.last.created_at ?? '').localeCompare(a.last.created_at ?? ''));
  const groups = [
    { title: 'Your farmers', items: conversations.filter((c) => c.mine) },
    { title: 'Other farmers', items: conversations.filter((c) => !c.mine) },
  ].filter((g) => g.items.length);

  return (
    <Screen>
      <BackLink label="Today" />
      <AppText variant="title">Messages</AppText>
      {groups.length === 0 ? <AppText muted>No messages from farmers yet. They arrive here when a farmer sends one from the farmer app.</AppText> : null}
      {groups.map((group) => (
        <View key={group.title} style={{ gap: 8 }}>
          <AppText variant="label" muted>
            {group.title}
          </AppText>
          {group.items.map((c) => (
            <Pressable
              key={c.farmerId}
              onPress={() => router.push({ pathname: '/vet/messages/[farmerId]', params: { farmerId: c.farmerId } })}
              accessibilityRole="button"
              style={styles.row}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <AppText bold>{c.name}</AppText>
                <AppText variant="small" muted numberOfLines={1}>
                  {c.last.direction === 'to_farmer' ? 'Vet team: ' : ''}
                  {c.last.kind === 'voice' ? `Voice ${formatSeconds(c.last.audio_seconds ?? 0)}` : c.last.body}
                  {c.last.created_at ? ` · ${formatAgo(c.last.created_at)}` : ''}
                </AppText>
              </View>
              {c.unread ? <Tag tone="problem" label={`${c.unread} new`} /> : null}
              <ChevronRight size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
