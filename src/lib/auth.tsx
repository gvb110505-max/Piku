import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { getSupabase } from './supabase';

/** 클라이언트가 읽을 수 있는 프로필 컬럼 (email 은 RLS/권한상 다른 사람에게 비공개) */
export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, created_at';

type AuthState = {
  /** 세션 복원·프로필 로딩 중 */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** 프로필을 불러오지 못한 경우 (마이그레이션 미적용, 네트워크 등) */
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // 세션 복원 + 변경 구독
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // 네이티브: 포그라운드일 때만 토큰 자동 갱신 (Supabase 권장 방식)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handle = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => handle.remove();
  }, [supabase]);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
    if (error || !data) {
      setProfile(null);
      setProfileError(error?.message ?? '프로필이 없습니다. DB 마이그레이션(0001_profiles.sql) 적용 여부를 확인하세요.');
    } else {
      setProfile(data as Profile);
      setProfileError(null);
    }
  }, [supabase, userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthState>(
    () => ({
      // 로그인 직후 프로필을 아직 못 받은 순간(또는 이전 계정 프로필이 남은 순간)도 로딩으로 본다
      loading: !sessionLoaded || (Boolean(userId) && profile?.id !== userId && !profileError),
      session,
      profile: profile?.id === userId ? profile : null,
      profileError,
      refreshProfile,
      setProfile,
      signOut,
    }),
    [sessionLoaded, userId, profile, session, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
