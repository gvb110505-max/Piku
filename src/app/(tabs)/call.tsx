import { StyleSheet, Text } from 'react-native';

import { Placeholder } from '@/components/Placeholder';
import { isSupabaseConfigured } from '@/lib/env';
import { colors } from '@/theme/colors';

export default function CallScreen() {
  return (
    <Placeholder title="전화" note="2단계에서 구현 (통화 기록 · 연락처 · 발신/수신)">
      <Text style={[styles.status, { color: isSupabaseConfigured ? colors.call : colors.textMuted }]}>
        Supabase 환경변수: {isSupabaseConfigured ? '설정됨' : '미설정 (.env 필요)'}
      </Text>
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: 16, fontSize: 12 },
});
