import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

/** 탭 밖 화면(남의 프로필 · 상품 추가 · 설정)의 상단 바: 뒤로 + 제목 */
export function ScreenHeader({ title, right, icon = 'chevron-back' }: { title: string; right?: ReactNode; icon?: 'chevron-back' | 'close' }) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
        accessibilityRole="button"
        accessibilityLabel={icon === 'close' ? '닫기' : '뒤로'}
        hitSlop={8}
        style={styles.side}
      >
        <Ionicons name={icon} size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  side: { width: 64, justifyContent: 'center', paddingHorizontal: 4 },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text },
});
