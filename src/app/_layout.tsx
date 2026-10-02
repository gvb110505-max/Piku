import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {isSupabaseConfigured ? (
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        ) : (
          <Centered>
            <Text style={styles.title}>Supabase 설정이 필요합니다</Text>
            <Text style={styles.body}>
              .env.example 을 .env 로 복사하고{'\n'}EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 를 채운 뒤 다시 실행하세요.
            </Text>
          </Centered>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * 로그인 상태에 따라 접근 가능한 화면 그룹을 나눈다.
 *  - 비로그인          → (auth): 이메일 입력 / 코드 입력
 *  - 로그인 + username 없음 → onboarding
 *  - 로그인 + username 있음 → 탭 (첫 화면: 전화)
 */
function RootNavigator() {
  const { loading, session, profile, profileError, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator color={colors.call} size="large" />
      </Centered>
    );
  }

  if (session && profileError) {
    return (
      <Centered>
        <Text style={styles.title}>프로필을 불러오지 못했습니다</Text>
        <Text style={styles.body}>{profileError}</Text>
        <Button title="다시 시도" onPress={refreshProfile} />
        <Button title="로그아웃" variant="ghost" onPress={signOut} />
      </Centered>
    );
  }

  const signedIn = Boolean(session);
  const needsOnboarding = signedIn && !profile?.username;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsOnboarding}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
