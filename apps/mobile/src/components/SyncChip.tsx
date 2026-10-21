import { radii, tones } from '@wechiau/ui/theme';
import { Pressable, StyleSheet } from 'react-native';
import { describeSync } from '@/sync/describe';
import { useSync } from '@/sync/SyncProvider';
import { AppText } from './AppText';
import { Check, CloudOff, RefreshCw, Upload } from './icons';

/**
 * Sync at a glance in the header: a green tick and the time when everything
 * is on the server, amber when changes are waiting. Tapping it syncs now.
 */
export function SyncChip() {
  const sync = useSync();
  const summary = describeSync(sync);
  const look = tones[summary.tone];
  const Icon = summary.kind === 'synced' ? Check : summary.kind === 'offline' ? CloudOff : summary.kind === 'syncing' ? RefreshCw : Upload;
  return (
    <Pressable
      onPress={() => void sync.syncNow()}
      disabled={sync.running}
      accessibilityRole="button"
      accessibilityLabel={`${summary.title}. ${summary.detail} Sync now.`}
      accessibilityLiveRegion="polite"
      hitSlop={8}
      style={({ pressed }) => [styles.chip, { backgroundColor: look.background }, pressed && { opacity: 0.75 }]}
    >
      <Icon size={15} color={look.text} strokeWidth={2.5} />
      <AppText variant="small" bold style={{ color: look.text }}>
        {summary.chip}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: radii.pill },
});
