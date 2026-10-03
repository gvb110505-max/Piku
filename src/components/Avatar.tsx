import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

type Props = {
  name: string;
  url?: string | null;
  size?: number;
};

const PALETTE = ['#F97316', '#0EA5E9', '#A855F7', '#EC4899', '#14B8A6', '#EAB308', '#6366F1'];

function initial(name: string): string {
  const clean = name.replace(/^@/, '').trim();
  return clean ? clean[0].toUpperCase() : '?';
}

/** 프로필 사진, 없으면 이름 첫 글자 */
export function Avatar({ name, url, size = 44 }: Props) {
  const radius = size / 2;
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />;
  }
  const bg = PALETTE[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % PALETTE.length];
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{initial(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: colors.onCall, fontWeight: '700' },
});
