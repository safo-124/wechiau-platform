import type { MessageLike } from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { StyleSheet, View } from 'react-native';
import { formatSyncTime } from '@/format';
import { AppText } from './AppText';
import { UploadImage } from './UploadImage';
import { VoicePlayer } from './VoicePlayer';

/**
 * One message in a conversation (design: farmer-app/Chat): the person's own
 * messages on the right in green, the other side's on the left.
 */
export function MessageBubble({ message, mine, from, waiting }: { message: MessageLike; mine: boolean; from: string; waiting?: boolean }) {
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {message.kind === 'voice' ? <VoicePlayer value={message.audio_uri} seconds={message.audio_seconds} tone={mine ? 'dark' : 'light'} /> : null}
      {message.body ? (
        <AppText variant="bodyLarge" style={{ color: mine ? colors.white : colors.text }}>
          {message.body}
        </AppText>
      ) : null}
      {message.photo_uri ? <UploadImage value={message.photo_uri} label="Photo sent with the message" /> : null}
      <AppText variant="small" style={{ color: mine ? colors.greenTint : colors.textMuted }}>
        {from} · {message.created_at ? formatSyncTime(message.created_at) : ''}
        {waiting ? ' · waiting for network' : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', borderRadius: radii.tile, padding: 12, gap: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.green, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.neutralTint, borderBottomLeftRadius: 4 },
});
