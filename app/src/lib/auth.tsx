// 로그인 상태를 앱 전역에 유지한다. 토큰은 SecureStore(웹은 localStorage)에 저장.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Api, setToken } from "./api";
import { saveToken, loadToken, clearToken } from "./store";

type Me = {
  user: { id: number; nickname: string; points: number; welcome_used: number | boolean; is_minor: boolean; identity_verified: boolean };
  identity: { verified: boolean; is_minor: boolean; provider?: string };
  limit: { is_minor: boolean; daily_limit: number | null; today_spent: number; remaining: number | null };
  cards: any[]; point_logs: any[]; shipments: any[]; orders: any[];
};

type Ctx = {
  ready: boolean;
  me: Me | null;
  signedIn: boolean;
  refresh: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try { setMe(await Api.me()); }
    catch { setMe(null); setToken(null); await clearToken(); }
  }, []);

  const signIn = useCallback(async (token: string) => {
    setToken(token);
    await saveToken(token);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    setToken(null);
    await clearToken();
    setMe(null);
  }, []);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (t) { setToken(t); await refresh(); }
      setReady(true);
    })();
  }, [refresh]);

  return (
    <AuthCtx.Provider value={{ ready, me, signedIn: !!me, refresh, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
