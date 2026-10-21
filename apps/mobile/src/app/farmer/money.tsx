import { formatGhs, paidSince, startOfLocalMonth } from '@wechiau/shared';
import { colors, radii, tones } from '@wechiau/ui/theme';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackLink } from '@/components/BackLink';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InfoBox } from '@/components/Tiles';
import { useMyFarm } from '@/data/farmer';
import { useCollections, useFarmerVaccinations, useRounds, useSettings, useVaccinePayments } from '@/data/hooks';
import { storyDay } from '@/format';

/** My money (design: farmer-app/Money): what the farmer was paid for eggs, and vaccine rounds. */
export default function MyMoney() {
  const { farmerId } = useMyFarm();
  const collections = useCollections();
  const month = paidSince(collections, startOfLocalMonth().toISOString());
  const price = useSettings().values.buy_price_per_crate;
  const rounds = useRounds();
  const vaccinations = useFarmerVaccinations(farmerId);
  const payments = useVaccinePayments();
  const prices = new Set(collections.filter((c) => (c.collected_at ?? '') >= startOfLocalMonth().toISOString()).map((c) => c.price_per_crate));

  return (
    <Screen>
      <BackLink />
      <AppText variant="title">My money</AppText>
      <View style={[styles.big, { backgroundColor: tones.money.background }]}>
        <AppText style={{ color: tones.money.text }}>Paid to you this month</AppText>
        <AppText style={[styles.amount, { color: tones.money.text }]}>{formatGhs(month.paid)}</AppText>
        <AppText style={{ color: tones.money.text }}>
          {month.crates} crate{month.crates === 1 ? '' : 's'} of eggs
          {prices.size === 1 && [...prices][0] ? ` at ${formatGhs([...prices][0]!)}` : ''}
        </AppText>
      </View>

      <AppText variant="label">Recent</AppText>
      {collections.length === 0 ? (
        <AppText muted>No eggs collected yet.</AppText>
      ) : (
        collections.slice(0, 10).map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <AppText bold>
                {c.crates} crate{c.crates === 1 ? '' : 's'}
              </AppText>
              <AppText variant="small" muted>
                {c.collected_at ? storyDay(c.collected_at) : ''}
              </AppText>
            </View>
            <AppText bold>{formatGhs(c.amount_paid ?? 0)}</AppText>
          </View>
        ))
      )}

      {rounds.length ? <AppText variant="label">Vaccine</AppText> : null}
      {rounds
        .filter((r) => vaccinations.some((v) => v.round_id === r.id))
        .map((r) => {
          const paid = payments.filter((p) => p.round_id === r.id).reduce((n, p) => n + (p.amount ?? 0), 0);
          const done = vaccinations.find((v) => v.round_id === r.id);
          return (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <AppText bold>Vaccine round {r.number}</AppText>
                <AppText variant="small" muted>
                  {done?.vaccinated_at ? storyDay(done.vaccinated_at) : ''}
                </AppText>
              </View>
              <AppText bold>{r.is_free ? 'Free' : paid ? `You paid ${formatGhs(paid)}` : 'To pay'}</AppText>
            </View>
          );
        })}

      <InfoBox>
        <AppText>
          Price today: {formatGhs(price)} for one crate. You are paid in cash when we collect.
        </AppText>
      </InfoBox>
      <Button label="See your farm story" kind="secondary" onPress={() => router.push('/farmer/story')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { borderRadius: radii.card, padding: 18, gap: 4 },
  amount: { fontSize: 40, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
