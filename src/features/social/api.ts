import { getSupabase } from '@/lib/supabase';

export type SearchResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  i_follow: boolean;
  follows_me: boolean;
};

export async function searchProfiles(q: string): Promise<SearchResult[]> {
  const { data, error } = await getSupabase().rpc('search_profiles', { q });
  if (error) throw error;
  return data as SearchResult[];
}

/** 팔로우. 차단 관계 등으로 서버(RLS)가 거부하면 false */
export async function follow(me: string, target: string): Promise<boolean> {
  const { error } = await getSupabase().from('follows').insert({ follower_id: me, following_id: target });
  if (!error || error.code === '23505') return true; // 이미 팔로우 중
  return false;
}

export async function unfollow(me: string, target: string): Promise<void> {
  const { error } = await getSupabase().from('follows').delete().eq('follower_id', me).eq('following_id', target);
  if (error) throw error;
}
