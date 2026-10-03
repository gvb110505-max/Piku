import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

import { AppHeader } from './AppHeader';

type Props = {
  title: string;
  note: string;
  children?: ReactNode;
};

/** 아직 구현 전인 탭. 큰 빈 공간 대신 상단에 짧은 안내만 둔다. */
export function Placeholder({ title, note, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.note}>{note}</Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  card: { marginHorizontal: 16, marginTop: 4, padding: 14, borderRadius: 12, backgroundColor: colors.surface, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  note: { fontSize: 13, color: colors.textMuted },
});
