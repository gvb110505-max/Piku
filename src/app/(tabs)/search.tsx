import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { profileName } from '@/features/calls/types';
import { follow, searchProfiles, unfollow, type SearchResult } from '@/features/social/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/colors';

export default function SearchScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // 입력이 멈추면 검색 (250ms)
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchProfiles(term);
        if (id === seq.current) {
          setResults(rows);
          setError(null);
        }
      } catch {
        if (id === seq.current) setError('검색하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const toggleFollow = async (row: SearchResult) => {
    if (!me) return;
    const next = !row.i_follow;
    setResults((rs) => rs.map((r) => (r.id === row.id ? { ...r, i_follow: next } : r)));
    try {
      if (next) {
        const ok = await follow(me, row.id);
        if (!ok) throw new Error('rejected');
      } else {
        await unfollow(me, row.id);
      }
    } catch {
      setResults((rs) => rs.map((r) => (r.id === row.id ? { ...r, i_follow: !next } : r)));
      // 차단 관계 등으로 서버가 거부. 차단당한 쪽 표시 방식(Q13)은 4단계에서 확정.
      setError(next ? '팔로우할 수 없습니다.' : '팔로우를 취소하지 못했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="사용자 이름 검색"
          placeholderTextColor={colors.tabInactive}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel="사용자 검색"
        />
        {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={q.trim() && !loading ? <Text style={styles.empty}>검색 결과가 없습니다</Text> : null}
        renderItem={({ item }) => {
          const name = profileName(item);
          const mutual = item.i_follow && item.follows_me;
          return (
            <View style={styles.row}>
              <Pressable
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${name} 프로필 보기`}
                style={styles.rowMain}
              >
                <Avatar name={name} url={item.avatar_url} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    @{item.username}
                    {mutual ? ' · 맞팔로우 · 전화 가능' : item.follows_me ? ' · 나를 팔로우함' : ''}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => toggleFollow(item)}
                accessibilityRole="button"
                accessibilityLabel={item.i_follow ? `${name} 팔로우 취소` : `${name} 팔로우`}
                style={[styles.followBtn, item.i_follow && styles.followingBtn]}
              >
                <Text style={[styles.followText, item.i_follow && styles.followingText]}>
                  {item.i_follow ? '팔로잉' : item.follows_me ? '맞팔로우' : '팔로우'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, height: '100%' },
  error: { color: colors.danger, paddingHorizontal: 20, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  followBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.text },
  followingBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followText: { color: colors.onCall, fontWeight: '700', fontSize: 14 },
  followingText: { color: colors.text },
});
