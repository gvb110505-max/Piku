import type { PublicProfile } from '@/features/calls/types';
import { getSupabase } from '@/lib/supabase';

export type ProfileStats = { followers: number; following: number; products: number };

export async function fetchProfileStats(userId: string): Promise<ProfileStats | null> {
  const { data, error } = await getSupabase().rpc('profile_stats', { p_user: userId });
  if (error || !data?.[0]) return null;
  const row = data[0] as { followers: number | string; following: number | string; products: number | string };
  return { followers: Number(row.followers), following: Number(row.following), products: Number(row.products) };
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data } = await getSupabase()
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  return (data as PublicProfile | null) ?? null;
}

/** 나와 상대의 팔로우 관계 (follows 는 당사자만 조회 가능하므로 두 행 모두 보인다) */
export async function fetchRelation(me: string, other: string): Promise<{ iFollow: boolean; followsMe: boolean }> {
  const { data } = await getSupabase()
    .from('follows')
    .select('follower_id, following_id')
    .or(`and(follower_id.eq.${me},following_id.eq.${other}),and(follower_id.eq.${other},following_id.eq.${me})`);
  const rows = (data ?? []) as { follower_id: string; following_id: string }[];
  return {
    iFollow: rows.some((r) => r.follower_id === me),
    followsMe: rows.some((r) => r.follower_id === other),
  };
}
