import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '@/components/AuthScreen';
import { Button, ErrorText, Field } from '@/components/ui';
import { authErrorMessage, EMAIL_PATTERN } from '@/lib/authErrors';
import { getSupabase } from '@/lib/supabase';

/** 이메일 입력 — 가입/로그인 통합. 처음 쓰는 이메일이면 자동 가입된다. */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError('이메일 형식이 올바르지 않습니다.');
      return;
    }
    setError(null);
    setSending(true);
    const { error: otpError } = await getSupabase().auth.signInWithOtp({
      email: value,
      options: { shouldCreateUser: true },
    });
    setSending(false);
    if (otpError) {
      setError(authErrorMessage(otpError));
      return;
    }
    router.push({ pathname: '/verify', params: { email: value } });
  };

  return (
    <AuthScreen title="이메일로 시작하기" subtitle="이메일로 받은 인증 코드만 입력하면 됩니다. 처음이면 자동으로 가입돼요.">
      <Field
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (error) setError(null);
        }}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
        autoFocus
        accessibilityLabel="이메일"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="인증 코드 받기" onPress={submit} loading={sending} disabled={!email.trim()} />
    </AuthScreen>
  );
}
