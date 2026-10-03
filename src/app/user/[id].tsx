import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useCall } from '@/features/calls/CallProvider';
import { profileName, type PublicProfile } from '@/features/calls/types';
import { listProducts, type Product } from '@/features/products/api';
import { ProductStrip } from '@/features/products/ProductStrip';
import { fetchProfileStats, fetchPublicProfile, fetchRelation, type ProfileStats } from '@/features/profile/api';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { follow, unfollow } from '@/features/social/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/colors';

/** 다른 사람 프로필: 숫자 · 상품 · 팔로우 · (맞팔로우면) 전화 */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { startCall } = useCall();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [relation, setRelation] = useState({ iFollow: false, followsMe: false });
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !me || id === me) return;
    const p = await fetchPublicProfile(id);
    if (!p) {
      setMissing(true);
      return;
    }
    setProfile(p);
    const [s, list, rel] = await Promise.all([fetchProfileStats(id), listProducts(id), fetchRelation(me, id)]);
    setStats(s);
    setProducts(list);
    setRelation(rel);
  }, [id, me]);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => setError('불러오지 못했습니다.'));
    }, [load]),
  );

  if (id === me) return <Redirect href="/profile" />;

  const toggleFollow = async () => {
    if (!profile) return;
    const next = !relation.iFollow;
    setRelation((r) => ({ ...r, iFollow: next }));
    try {
      if (next) {
        if (!(await follow(me, profile.id))) throw new Error('rejected');
      } else {
        await unfollow(me, profile.id);
      }
      setStats(await fetchProfileStats(profile.id));
      setError(null);
    } catch {
      setRelation((r) => ({ ...r, iFollow: !next }));
      // 차단 관계 등으로 서버가 거부. 차단당한 쪽 표시 방식(Q13)은 4단계에서 확정.
      setError(next ? '팔로우할 수 없습니다.' : '팔로우를 취소하지 못했습니다.');
    }
  };

  const mutual = relation.iFollow && relation.followsMe;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={profile?.username ? `@${profile.username}` : ''} />
      {missing ? (
        <Text style={styles.muted}>사용자를 찾을 수 없습니다</Text>
      ) : profile ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileHeader profile={profile} stats={stats} />
          <View style={styles.actions}>
            <Pressable
              onPress={toggleFollow}
              accessibilityRole="button"
              accessibilityLabel={relation.iFollow ? `${profileName(profile)} 팔로우 취소` : `${profileName(profile)} 팔로우`}
              style={[styles.btn, relation.iFollow ? styles.btnSecondary : styles.btnPrimary]}
            >
              <Text style={[styles.btnText, relation.iFollow ? styles.btnTextSecondary : null]}>
                {relation.iFollow ? '팔로잉' : relation.followsMe ? '맞팔로우' : '팔로우'}
              </Text>
            </Pressable>
            {/* 전화는 맞팔로우끼리만 (서버도 같은 규칙으로 강제) */}
            <Pressable
              onPress={() => mutual && startCall(profile, 'audio')}
              disabled={!mutual}
              accessibilityRole="button"
              accessibilityLabel={`${profileName(profile)}에게 전화`}
              accessibilityState={{ disabled: !mutual }}
              style={[styles.btn, styles.btnCall, !mutual && styles.btnDisabled]}
            >
              <Ionicons name="call" size={16} color={colors.onCall} />
              <Text style={styles.btnText}>전화</Text>
            </Pressable>
          </View>
          {!mutual ? <Text style={styles.hint}>서로 팔로우하면 전화할 수 있어요</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상품</Text>
            <ProductStrip products={products} />
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 4, paddingBottom: 48, gap: 14 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  btn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.text },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnCall: { backgroundColor: colors.call },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: colors.onCall, fontWeight: '700', fontSize: 14 },
  btnTextSecondary: { color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, marginTop: -6 },
  error: { color: colors.danger, paddingHorizontal: 16 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, paddingHorizontal: 16 },
  muted: { fontSize: 14, color: colors.textMuted, padding: 16 },
});
