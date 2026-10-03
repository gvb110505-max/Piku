import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/colors';

/** 프로필 > 설정. (4단계: 차단 목록, 5단계: 메시지 진입이 여기에 추가된다) */
export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="설정" />
      <View style={styles.group}>
        <Row icon="mail-outline" label="이메일" value={session?.user.email ?? ''} />
        <Pressable
          onPress={async () => {
            setSigningOut(true);
            await signOut();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[styles.label, { color: colors.danger }]}>로그아웃</Text>
          {signingOut ? <ActivityIndicator size="small" color={colors.danger} /> : null}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  group: { marginHorizontal: 16, marginTop: 4, borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48 },
  pressed: { backgroundColor: colors.border },
  label: { fontSize: 15, color: colors.text },
  value: { flex: 1, textAlign: 'right', fontSize: 14, color: colors.textMuted },
});
