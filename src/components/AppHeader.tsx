import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME, LOGO, TAGLINE } from '@/theme/brand';
import { colors } from '@/theme/colors';

/** 탭 화면 공통 상단 바: 왼쪽 로고 + 앱 이름 + 소개 문구, 오른쪽 화면별 버튼 */
export function AppHeader({ right }: { right?: ReactNode }) {
  return (
    <View style={styles.bar}>
      <View style={styles.brand} accessibilityRole="header" accessibilityLabel={`${APP_NAME}, ${TAGLINE}`}>
        {LOGO ? (
          <Image source={LOGO} style={styles.logo} contentFit="contain" />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Ionicons name="call" size={15} color={colors.onCall} />
          </View>
        )}
        <Text style={styles.name}>{APP_NAME}</Text>
        <Text style={styles.tagline} numberOfLines={1}>
          {TAGLINE}
        </Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  logo: { width: 26, height: 26, borderRadius: 8 },
  logoFallback: { backgroundColor: colors.call, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 19, fontWeight: '800', color: colors.text },
  tagline: { flexShrink: 1, fontSize: 12, color: colors.textMuted, marginLeft: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
