import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { resolveAvatarUriForDisplay } from '../lib/avatarUrls';

type AvatarImageProps = {
  userId: string;
  username?: string | null;
  /** From profiles.profile_image_url — any non-empty means avatar exists at storage path. */
  profileImageUrl: string | null | undefined;
  size: number;
  style?: StyleProp<ImageStyle>;
};

export function AvatarImage({
  userId,
  username,
  profileImageUrl,
  size,
  style,
}: AvatarImageProps) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!profileImageUrl) {
      setUri(null);
      return;
    }
    let cancelled = false;
    void resolveAvatarUriForDisplay(userId, profileImageUrl).then((u) => {
      if (!cancelled) setUri(u);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, profileImageUrl]);

  const letter = (username?.trim()?.charAt(0) ?? '?').toUpperCase();

  if (!profileImageUrl || !uri) {
    return (
      <View
        style={[
          styles.ph,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Text style={[styles.phText, { fontSize: size * 0.4 }]}>{letter}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      contentFit="cover"
    />
  );
}

const styles = StyleSheet.create({
  ph: {
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phText: {
    fontWeight: '600',
    color: '#64748B',
  },
});
