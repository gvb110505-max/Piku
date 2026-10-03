import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { profileName, type PublicProfile } from '@/features/calls/types';
import { colors } from '@/theme/colors';

import type { ProfileStats } from './api';

/** 프로필 상단: 사진 + 이름 + 숫자(상품 · 팔로워 · 팔로잉) 한 줄 */
export function ProfileHeader({ profile, stats }: { profile: PublicProfile; stats: ProfileStats | null }) {
  const name = profileName(profile);
  return (
    <View style={styles.row}>
      <Avatar name={name} url={profile.avatar_url} size={72} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {profile.display_name && profile.username ? <Text style={styles.sub}>@{profile.username}</Text> : null}
        <View style={styles.stats}>
          <Stat label="상품" value={stats?.products} />
          <Stat label="팔로워" value={stats?.followers} />
          <Stat label="팔로잉" value={stats?.following} />
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  stats: { flexDirection: 'row', gap: 20, marginTop: 6 },
  stat: { alignItems: 'flex-start' },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
});
