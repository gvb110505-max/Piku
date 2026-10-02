import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthScreen } from '@/components/AuthScreen';
import { Button, ErrorText, Field } from '@/components/ui';
import { PROFILE_COLUMNS, useAuth, type Profile } from '@/lib/auth';
import { profileErrorMessage } from '@/lib/authErrors';
import { getSupabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';

/** DB 체크 제약(profiles_username_format)과 같은 규칙. 최종 검증은 서버가 한다. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** 가입 직후 1회: 사용자 이름(username) 설정. 프로필 사진·표시 이름은 선택 사항이라 묻지 않는다. */
export default function OnboardingScreen() {
  const { session, setProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!session) return;
    if (!USERNAME_PATTERN.test(username)) {
      setError('영문 소문자, 숫자, 밑줄(_)로 3~20자를 입력해 주세요.');
      return;
    }
    setError(null);
    setSaving(true);
    const { data, error: updateError } = await getSupabase()
      .from('profiles')
      .update({ username })
      .eq('id', session.user.id)
      .select(PROFILE_COLUMNS)
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(profileErrorMessage(updateError));
      return;
    }
    setProfile(data as Profile); // → 루트 레이아웃이 전화 탭으로 이동
  };

  return (
    <AuthScreen title="사용자 이름 정하기" subtitle="친구가 검색으로 나를 찾을 때 쓰는 이름이에요.">
      <Field
        value={username}
        onChangeText={(t) => {
          setUsername(t.toLowerCase().replace(/\s/g, ''));
          if (error) setError(null);
        }}
        placeholder="username"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        returnKeyType="done"
        onSubmitEditing={submit}
        maxLength={20}
        autoFocus
        accessibilityLabel="사용자 이름"
      />
      <Text style={styles.hint}>영문 소문자 · 숫자 · 밑줄(_) 3~20자</Text>
      <ErrorText>{error}</ErrorText>
      <Button title="시작하기" onPress={submit} loading={saving} disabled={username.length < 3} />
      <Button title="다른 이메일로 로그인" variant="ghost" onPress={signOut} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 13 },
});
