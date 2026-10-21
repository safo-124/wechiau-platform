import { parseUploadRef } from '@wechiau/shared';
import { colors, radii } from '@wechiau/ui/theme';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { uploadUrl } from '@/api/client';
import { useSession } from '@/auth/session';
import { localPhoto } from '@/uploads/photos';
import { AppText } from './AppText';

/**
 * A photo from a record's "upload:<id>". Uses the copy on this phone when there
 * is one (works offline); otherwise fetches it from the server with the sign-in.
 */
export function UploadImage({ value, style, label }: { value: string | null | undefined; style?: StyleProp<ImageStyle>; label: string }) {
  const { session } = useSession();
  const [failed, setFailed] = useState(false);
  const id = parseUploadRef(value);
  const token = session.status === 'signed_in' ? session.token : null;

  const source = useMemo(() => {
    if (!id) return null;
    const local = localPhoto(id);
    if (local.exists) return { uri: local.uri };
    return token ? { uri: uploadUrl(id), headers: { Authorization: `Bearer ${token}` } } : null;
  }, [id, token]);

  if (!id) return null;
  if (!source || failed) {
    return (
      <View style={[styles.placeholder, style]}>
        <AppText variant="small" muted>
          Photo not on this phone yet. It appears when there is network.
        </AppText>
      </View>
    );
  }
  return <Image source={source} style={[styles.image, style]} accessibilityLabel={label} onError={() => setFailed(true)} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.tile, backgroundColor: colors.neutralTint },
  placeholder: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.tile, backgroundColor: colors.neutralTint, padding: 16, justifyContent: 'center' },
});
