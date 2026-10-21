import { colors, radii } from '@wechiau/ui/theme';
import { router, usePathname, type Href } from 'expo-router';
import { ClipboardList, Egg, House, Stethoscope, Store, Syringe, Users, Wallet, type LucideIcon } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';

export interface NavItem {
  href: Href;
  match: string;
  label: string;
  Icon: LucideIcon;
}

/** Field app navigation (design: field-app/Main, Cash, Farmers). */
export const FIELD_NAV: NavItem[] = [
  { href: '/field', match: '/field', label: 'Today', Icon: House },
  { href: '/field/collect', match: '/field/collect', label: 'Collect', Icon: Egg },
  { href: '/field/sell', match: '/field/sell', label: 'Sell', Icon: Store },
  { href: '/field/cash', match: '/field/cash', label: 'Cash', Icon: Wallet },
  { href: '/field/farmers', match: '/field/farmers', label: 'Farmers', Icon: Users },
];

/** Vet app navigation (design: vet-app/Main, Cases, Clinic, Stock, MyFarmers). */
export const VET_NAV: NavItem[] = [
  { href: '/vet', match: '/vet', label: 'Today', Icon: House },
  { href: '/vet/cases', match: '/vet/cases', label: 'Cases', Icon: Stethoscope },
  { href: '/vet/clinic', match: '/vet/clinic', label: 'Clinic', Icon: Syringe },
  { href: '/vet/stock', match: '/vet/stock', label: 'Stock', Icon: ClipboardList },
  { href: '/vet/farmers', match: '/vet/farmers', label: 'Farmers', Icon: Users },
];

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // The most specific match wins, so /field/farmers doesn't also light up "Today".
  const active = [...items].sort((a, b) => b.match.length - a.match.length).find((i) => pathname === i.match || pathname.startsWith(`${i.match}/`));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item === active;
        const color = selected ? colors.green : colors.textMuted;
        return (
          <Pressable
            key={item.label}
            onPress={() => (selected ? undefined : router.navigate(item.href))}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            style={[styles.item, selected && styles.itemSelected]}
          >
            <item.Icon size={24} color={color} strokeWidth={2} />
            <AppText variant="small" bold style={[styles.label, { color }]}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.white,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  item: { flex: 1, minHeight: 56, borderRadius: radii.tile, alignItems: 'center', justifyContent: 'center', gap: 2 },
  itemSelected: { backgroundColor: colors.greenTint },
  label: { fontSize: 12 },
});
