import { colors, radii } from '@wechiau/ui/theme';
import { StyleSheet, View } from 'react-native';
import { useSync } from '@/sync/SyncProvider';
import { AppText } from './AppText';
import { Button } from './Button';

/** Changes the server turned down, in red until the person has seen them. Problems stay on the screen, not in a menu. */
export function SyncProblems() {
  const sync = useSync();
  if (sync.rejections.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {sync.rejections.map((rejection) => (
        <View key={rejection.id} style={styles.rejection} accessibilityRole="alert">
          <AppText bold style={{ color: colors.red }}>
            Not saved on the server
          </AppText>
          <AppText variant="small" style={{ color: colors.red }}>
            {rejection.reason} The change was undone on this phone.
          </AppText>
          <Button label="OK" kind="secondary" size="small" onPress={() => sync.dismissRejection(rejection.id)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  rejection: { borderRadius: radii.tile, padding: 14, gap: 6, backgroundColor: colors.redTint },
});
