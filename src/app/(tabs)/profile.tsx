import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/colors';

export default function ProfileScreen() {
  const { session, profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.name}>{profile?.display_name ?? `@${profile?.username}`}</Text>
        {profile?.display_name ? <Text style={styles.sub}>@{profile.username}</Text> : null}
        {/* 본인 이메일은 세션에서 읽는다 (profiles.email 은 클라이언트에 비공개) */}
        <Text style={styles.sub}>{session?.user.email}</Text>
      </View>
      <Text style={styles.note}>내 게시물 · 팔로워/팔로잉 · 설정 · 메시지 진입은 이후 단계에서 구현</Text>
      <View style={styles.footer}>
        <Button title="로그아웃" variant="ghost" onPress={onSignOut} loading={signingOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: 24 },
  header: { gap: 4, paddingTop: 16 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.textMuted },
  note: { marginTop: 32, fontSize: 13, color: colors.textMuted },
  footer: { marginTop: 'auto', paddingBottom: 16 },
});
