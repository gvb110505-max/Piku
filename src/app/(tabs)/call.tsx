import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { fetchContacts, fetchRecentCalls, type CallLogEntry } from '@/features/calls/api';
import { useCall } from '@/features/calls/CallProvider';
import { profileName, type PublicProfile } from '@/features/calls/types';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/colors';

const RECENT_LIMIT = 10;

type Row = { kind: 'recent'; entry: CallLogEntry } | { kind: 'contact'; profile: PublicProfile };

export default function CallTab() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { startCall, view } = useCall();
  const [recent, setRecent] = useState<CallLogEntry[]>([]);
  const [contacts, setContacts] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([fetchRecentCalls(RECENT_LIMIT), fetchContacts()]);
      setRecent(r);
      setContacts(c);
      setError(null);
    } catch {
      setError('목록을 불러오지 못했습니다. 아래로 당겨 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // 통화가 끝나면 기록 갱신
  useEffect(() => {
    if (view.phase === 'idle') void load();
  }, [view.phase, load]);

  const sections = [
    ...(recent.length ? [{ key: 'recent', title: '최근 통화', data: recent.map((entry): Row => ({ kind: 'recent', entry })) }] : []),
    { key: 'contacts', title: '연락처', data: contacts.map((profile): Row => ({ kind: 'contact', profile })) },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>전화</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <SectionList
        sections={sections}
        keyExtractor={(row) => (row.kind === 'recent' ? `r-${row.entry.id}` : `c-${row.profile.id}`)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderSectionFooter={({ section }) =>
          section.key === 'contacts' && !loading && contacts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>서로 팔로우한 친구가 여기에 나타나요.{'\n'}친구를 찾아 팔로우해 보세요.</Text>
              <Pressable style={styles.emptyBtn} onPress={() => router.navigate('/search')} accessibilityRole="button">
                <Text style={styles.emptyBtnText}>친구 찾기</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'recent' ? (
            <RecentRow entry={item.entry} me={me} onCall={(p) => startCall(p, 'audio')} />
          ) : (
            <ContactRow
              profile={item.profile}
              onCall={() => startCall(item.profile, 'audio')}
              onVideo={() => startCall(item.profile, 'video')}
            />
          )
        }
      />
    </SafeAreaView>
  );
}

/** 연락처: 한 번 탭하면 바로 음성 발신, 오른쪽 버튼은 영상 발신 */
function ContactRow({ profile, onCall, onVideo }: { profile: PublicProfile; onCall: () => void; onVideo: () => void }) {
  const name = profileName(profile);
  return (
    <Pressable
      onPress={onCall}
      accessibilityRole="button"
      accessibilityLabel={`${name}에게 전화 걸기`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={name} url={profile.avatar_url} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {profile.display_name ? <Text style={styles.sub}>@{profile.username}</Text> : null}
      </View>
      <Pressable
        onPress={onVideo}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${name}에게 영상 통화`}
        style={styles.iconBtn}
      >
        <Ionicons name="videocam" size={22} color={colors.call} />
      </Pressable>
      <Ionicons name="call" size={22} color={colors.call} />
    </Pressable>
  );
}

function RecentRow({ entry, me, onCall }: { entry: CallLogEntry; me: string; onCall: (p: PublicProfile) => void }) {
  const outgoing = entry.caller_id === me;
  const peer = (outgoing ? entry.callee : entry.caller) ?? {
    id: outgoing ? entry.callee_id : entry.caller_id,
    username: null,
    display_name: null,
    avatar_url: null,
  };
  const name = profileName(peer);
  const missed = !outgoing && entry.status === 'missed';
  const { icon, label } = describe(entry, outgoing);
  return (
    <Pressable
      onPress={() => onCall(peer)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${label}. 다시 걸기`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={name} url={peer.avatar_url} size={40} />
      <View style={styles.rowText}>
        <Text style={[styles.name, missed && { color: colors.danger }]} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.meta}>
          <Ionicons name={icon} size={13} color={missed ? colors.danger : colors.textMuted} />
          {entry.media === 'video' ? <Ionicons name="videocam-outline" size={13} color={colors.textMuted} /> : null}
          <Text style={[styles.sub, missed && { color: colors.danger }]}>{label}</Text>
        </View>
      </View>
      <Text style={styles.time}>{shortTime(entry.started_at)}</Text>
    </Pressable>
  );
}

function describe(entry: CallLogEntry, outgoing: boolean) {
  const icon = (outgoing ? 'arrow-up-outline' : 'arrow-down-outline') as 'arrow-up-outline' | 'arrow-down-outline';
  const dir = outgoing ? '발신' : '수신';
  switch (entry.status) {
    case 'ended':
    case 'accepted':
      return { icon, label: `${dir} · ${duration(entry)}` };
    case 'missed':
      return { icon, label: outgoing ? '발신 · 응답 없음' : '부재중' };
    case 'declined':
      return { icon, label: outgoing ? '발신 · 받지 않음' : '수신 거절' };
    case 'failed':
      return { icon, label: `${dir} · 연결 끊김` };
    case 'ringing':
    default:
      return { icon, label: dir };
  }
}

function duration(entry: CallLogEntry): string {
  if (!entry.answered_at) return '0:00';
  const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now();
  const sec = Math.max(0, Math.round((end - new Date(entry.answered_at).getTime()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  error: { color: colors.danger, paddingHorizontal: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12 },
  pressed: { backgroundColor: colors.surface },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { fontSize: 13, color: colors.textMuted },
  iconBtn: { padding: 6, marginRight: 6 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.call },
  emptyBtnText: { color: colors.onCall, fontWeight: '700' },
});
