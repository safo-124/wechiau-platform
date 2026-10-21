import { colors, radii, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useMyFarm } from '@/data/farmer';
import { useFarmerCases, useFarmerVaccinations, useFarmerVisits, useRounds } from '@/data/hooks';
import { comingDay, firstName, storyDay } from '@/format';
import { callPhone } from '@/linking';

/** My vet (design: farmer-app/MyVet): who looks after the farm, when they come, how to reach them. */
export default function MyVet() {
  const { farmerId, vet } = useMyFarm();
  const rounds = useRounds();
  const visit = useFarmerCases(farmerId).find((c) => c.status === 'open' && c.follow_up_on)?.follow_up_on ?? null;
  const name = vet?.name ? firstName(vet.name) : null;

  // This vet's work on the farm: vaccinations, and visits they recorded.
  const work = [
    ...useFarmerVaccinations(farmerId)
      .filter((v) => vet && v.vet_id === vet.id && v.vaccinated_at)
      .map((v) => {
        const round = rounds.find((r) => r.id === v.round_id);
        return { id: v.id, at: v.vaccinated_at!, text: `Vaccinated ${v.birds_vaccinated} birds${round?.is_free ? ', free' : ''}` };
      }),
    ...useFarmerVisits(farmerId)
      .filter((v) => vet && v.recorded_by === vet.id && v.visited_at)
      .map((v) => ({ id: v.id, at: v.visited_at!, text: v.deaths ? `Visit. ${v.deaths} birds had died.` : 'Visit to check the birds' })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (!vet) {
    return (
      <Screen>
        <BackLink />
        <AppText variant="title">My vet</AppText>
        <AppText>Wechiau will give you a vet soon. You can already send a message to the vet team.</AppText>
        <Button label="Send a message" onPress={() => router.push('/farmer/messages')} />
      </Screen>
    );
  }

  const when = visit ? comingDay(visit) : null;
  return (
    <Screen>
      <BackLink />
      <View style={styles.person}>
        <View style={styles.initial}>
          <AppText style={styles.initialText}>{(vet.name ?? 'V').slice(0, 1).toUpperCase()}</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{vet.name}</AppText>
          <AppText muted>Your vet · Wechiau Poultry</AppText>
        </View>
      </View>

      {when ? (
        <View style={[styles.box, { backgroundColor: tones.comingUp.background }]}>
          <AppText variant="bodyLarge" bold style={{ color: tones.comingUp.text }}>
            Coming {when === 'Today' || when === 'Tomorrow' ? when.toLowerCase() : when}
          </AppText>
          <AppText style={{ color: tones.comingUp.text }}>To check your sick birds</AppText>
        </View>
      ) : null}

      {vet.phone ? <Button label={`Call ${name}`} onPress={() => callPhone(vet.phone!)} /> : null}
      <Button label="Voice message" kind="secondary" onPress={() => router.push('/farmer/messages')} />

      <AppText variant="label">{name}&apos;s visits to your farm</AppText>
      {work.length === 0 ? (
        <AppText muted>No visits yet.</AppText>
      ) : (
        work.map((w) => (
          <View key={w.id} style={styles.item}>
            <AppText variant="small" muted>
              {storyDay(w.at)}
            </AppText>
            <AppText>{w.text}</AppText>
          </View>
        ))
      )}
      <Button label={`Messages with ${name}`} kind="secondary" onPress={() => router.push('/farmer/messages')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  initial: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: colors.green, fontSize: 28, fontWeight: '700' },
  box: { borderRadius: radii.tile, padding: 14, gap: 2 },
  item: { gap: 2, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
