import { flockStatus, formatGhs, localDate, nextRound, paidSince } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StatTile, Tag, TileRow } from '@/components/Tiles';
import { useMyFarm } from '@/data/farmer';
import { useCollections, useFarmerCases, useFarmerCounts, useFarmerVaccinations, useRounds } from '@/data/hooks';
import { comingDay } from '@/format';

/** My flock (design: farmer-app/Flock): how many birds are protected, and what the eggs earned. */
export default function MyFlock() {
  const { farmerId } = useMyFarm();
  const today = localDate();
  const rounds = useRounds();
  const flock = flockStatus({ counts: useFarmerCounts(farmerId), rounds, vaccinations: useFarmerVaccinations(farmerId) }, today);
  const next = nextRound(rounds, today);
  const sold = paidSince(useCollections(), '');
  const sick = useFarmerCases(farmerId).some((c) => c.status === 'open');
  const unprotected = flock.birds !== null ? Math.max(flock.birds - flock.protected, 0) : 0;
  const nextDay = next?.date ? comingDay(next.date) : null;

  const status = sick
    ? { text: 'A vet is looking at a problem on your farm.', tone: 'problem' as const }
    : { text: `Healthy flock.${nextDay ? ` Next vaccine ${nextDay === 'Today' || nextDay === 'Tomorrow' ? nextDay.toLowerCase() : nextDay}.` : ''}`, tone: 'good' as const };

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">My flock</AppText>
      <View style={[styles.big, { backgroundColor: tones[status.tone].background }]}>
        <AppText style={[styles.number, { color: tones[status.tone].text }]}>
          {flock.birds === null ? '–' : `${flock.protected}/${flock.birds}`}
        </AppText>
        <AppText variant="bodyLarge" bold style={{ color: tones[status.tone].text }}>
          birds protected
        </AppText>
        <AppText style={{ color: tones[status.tone].text }}>{status.text}</AppText>
        {flock.round ? <Tag label={`Round ${flock.round.number}`} tone="neutral" /> : null}
      </View>

      <TileRow>
        <StatTile tone="good" value={`${sold.crates} crate${sold.crates === 1 ? '' : 's'}`} label="Sold" />
        <StatTile tone="money" value={formatGhs(sold.paid)} label="Earned" />
      </TileRow>

      {unprotected > 0 ? (
        <View style={[styles.note, { backgroundColor: tones.comingUp.background }]}>
          <AppText style={{ color: tones.comingUp.text }}>
            {unprotected} bird{unprotected === 1 ? ' is' : 's are'} not protected yet.
            {nextDay ? ` They will get the vaccine ${nextDay === 'Today' || nextDay === 'Tomorrow' ? nextDay.toLowerCase() : `on ${nextDay}`}.` : ''}
          </AppText>
        </View>
      ) : null}

      <Button label="Report a problem" kind="danger" onPress={() => router.push('/farmer/report')} />
      <Button label="See your farm story" kind="secondary" onPress={() => router.push('/farmer/story')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { borderRadius: radii.card, padding: 18, gap: 6, alignItems: 'flex-start' },
  number: { fontSize: 44, fontWeight: '700' },
  note: { borderRadius: radii.tile, padding: 14 },
  divider: { height: 1, backgroundColor: colors.divider },
});
