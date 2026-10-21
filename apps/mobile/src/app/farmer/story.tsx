import { farmStory, localDate, nextRound, type StoryKind } from '@wechiau/shared';
import { colors, radii, tones, type Tone } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useMyFarm } from '@/data/farmer';
import { useCollections, useFarmerCases, useFarmerVaccinations, useFarmerVisits, useRounds, useVaccinePayments } from '@/data/hooks';
import { comingDay, firstName, storyDay } from '@/format';

const TONES: Record<StoryKind, Tone> = {
  joined: 'neutral',
  paid: 'money',
  vaccinated: 'good',
  visit: 'neutral',
  problem: 'problem',
  problem_closed: 'good',
  vaccine_paid: 'money',
};

/** Farm story (design: farmer-app/Timeline): what is coming up, then what happened, newest first. */
export default function FarmStory() {
  const { me, farmerId, farmer } = useMyFarm();
  const rounds = useRounds();
  const next = nextRound(rounds, localDate());
  const story = farmStory({
    joinedAt: farmer?.joined_on ? `${farmer.joined_on}T12:00:00.000Z` : (farmer?.created_at ?? null),
    collections: useCollections(),
    vaccinations: useFarmerVaccinations(farmerId),
    rounds,
    visits: useFarmerVisits(farmerId),
    cases: useFarmerCases(farmerId),
    vaccinePayments: useVaccinePayments(),
  });

  // Group under plain day words: Today, Monday, Last week, September.
  const groups: { day: string; events: typeof story }[] = [];
  for (const event of story) {
    const day = storyDay(event.at);
    if (groups.at(-1)?.day === day) groups.at(-1)!.events.push(event);
    else groups.push({ day, events: [event] });
  }

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">{firstName(farmer?.name ?? me.name)}&apos;s farm story</AppText>

      {next?.date ? (
        <View style={{ gap: 6 }}>
          <AppText variant="label">Coming up</AppText>
          <View style={[styles.event, { backgroundColor: tones.comingUp.background }]}>
            <AppText bold style={{ color: tones.comingUp.text }}>
              {comingDay(next.date)}: vaccine round {next.number}
            </AppText>
            <AppText variant="small" style={{ color: tones.comingUp.text }}>
              Keep your birds in the pen that morning
            </AppText>
          </View>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.day} style={{ gap: 6 }}>
          <AppText variant="label">{group.day}</AppText>
          {group.events.map((event) => (
            <View key={event.id} style={[styles.event, { backgroundColor: tones[TONES[event.kind]].background }]}>
              <AppText style={{ color: tones[TONES[event.kind]].text }}>{event.text}</AppText>
            </View>
          ))}
        </View>
      ))}

      <Button label="Report a problem" kind="danger" onPress={() => router.push('/farmer/report')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  event: { borderRadius: radii.tile, padding: 14, gap: 2 },
  line: { height: 1, backgroundColor: colors.divider },
});
