import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthScreen } from '@/components/AuthScreen';
import { Button, ErrorText, Field } from '@/components/ui';
import { authErrorMessage } from '@/lib/authErrors';
import { getSupabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';

/** Supabase 기본 이메일 재전송 제한(60초)에 맞춘 대기 시간 */
const RESEND_COOLDOWN_SEC = 60;
/** Supabase 프로젝트 설정에 따라 OTP 길이는 6~10자리 */
const CODE_PATTERN = /^\d{6,10}$/;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 새로고침 등으로 이메일 파라미터가 없으면 처음으로
  useEffect(() => {
    if (!email) router.replace('/sign-in');
  }, [email]);
  if (!email) return null;

  const verify = async () => {
    if (!CODE_PATTERN.test(code)) {
      setError('메일로 받은 숫자 코드를 정확히 입력해 주세요.');
      return;
    }
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await getSupabase().auth.verifyOtp({ email, token: code, type: 'email' });
    setVerifying(false);
    if (verifyError) {
      setError(authErrorMessage(verifyError));
      return;
    }
    // 성공 시 세션이 생기고, 루트 레이아웃이 온보딩/전화 탭으로 이동시킨다.
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    const { error: otpError } = await getSupabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setResending(false);
    if (otpError) {
      setError(authErrorMessage(otpError));
      return;
    }
    setCode('');
    setNotice('새 인증 코드를 보냈습니다. 이전 코드는 더 이상 쓸 수 없습니다.');
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  return (
    <AuthScreen title="인증 코드 입력" subtitle={`${email} 으로 보낸 코드를 입력하세요.`}>
      <Field
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 10));
          if (error) setError(null);
        }}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="done"
        onSubmitEditing={verify}
        autoFocus
        maxLength={10}
        style={styles.code}
        accessibilityLabel="인증 코드"
      />
      <ErrorText>{error}</ErrorText>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Button title="확인" onPress={verify} loading={verifying} disabled={code.length < 6} />
      <Button
        title={cooldown > 0 ? `코드 다시 받기 (${cooldown}초)` : '코드 다시 받기'}
        variant="ghost"
        onPress={resend}
        loading={resending}
        disabled={cooldown > 0}
      />
      <Button title="이메일 다시 입력" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  notice: { color: colors.textMuted, fontSize: 14 },
});
