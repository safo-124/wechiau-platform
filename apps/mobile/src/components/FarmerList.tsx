import type { Language } from '@wechiau/shared';
import { colors, tones } from '@wechiau/ui/theme';
import { asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { db } from '@/db/client';
import { farmer, sync_outbox } from '@/db/schema';
import { LANGUAGE_LABELS } from '@/format';
import { AppText } from './AppText';

interface FarmerListProps {
  search?: string;
  /** When given, rows can be tapped (field app: open the farmer to edit). */
  onSelect?(id: string): void;
}

/** Farmers on this phone, updating live as records are saved or synced. */
export function FarmerList({ search = '', onSelect }: FarmerListProps) {
  const { data: farmers } = useLiveQuery(
    db.select().from(farmer).where(isNull(farmer.deleted_at)).orderBy(asc(farmer.name)),
  );
  const { data: waiting } = useLiveQuery(
    db.select({ id: sync_outbox.row_id }).from(sync_outbox).where(eq(sync_outbox.table_name, 'farmer')),
  );
  const notSynced = useMemo(() => new Set(waiting.map((w) => w.id)), [waiting]);
  const query = search.trim().toLowerCase();
  const shown = query ? farmers.filter((f) => f.name?.toLowerCase().includes(query)) : farmers;

  if (farmers.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText muted>No farmers on this phone yet.</AppText>
      </View>
    );
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      renderItem={({ item }) => {
        const pending = notSynced.has(item.id);
        const meta = [item.language ? LANGUAGE_LABELS[item.language as Language] : null, item.landmark].filter(Boolean).join(' · ');
        const label = `${item.name}${pending ? ', not on the server yet' : ''}`;
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && onSelect ? styles.pressed : null]}
            onPress={onSelect ? () => onSelect(item.id) : undefined}
            disabled={!onSelect}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityLabel={onSelect ? `${label}. Open profile` : label}
          >
            <View style={styles.avatar}>
              <AppText bold style={{ color: colors.green }}>
                {item.name?.[0] ?? '?'}
              </AppText>
            </View>
            <View style={styles.text}>
              <AppText bold>{item.name}</AppText>
              {meta ? (
                <AppText variant="small" muted>
                  {meta}
                </AppText>
              ) : null}
            </View>
            {pending ? (
              <View style={[styles.tag, { backgroundColor: tones.comingUp.background }]}>
                <AppText variant="small" bold style={{ color: tones.comingUp.text }}>
                  Not synced
                </AppText>
              </View>
            ) : null}
            {onSelect ? (
              <AppText variant="bodyLarge" muted>
                ›
              </AppText>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: 16, backgroundColor: colors.neutralTint, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderBottomWidth: 1, borderBottomColor: colors.divider },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.neutralTint },
  text: { flex: 1 },
  tag: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
});
