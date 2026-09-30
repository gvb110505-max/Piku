/**
 * 클라이언트에서 읽는 환경변수.
 * EXPO_PUBLIC_ 값은 앱 번들에 포함되므로 공개돼도 되는 값(Supabase URL, anon key)만 둔다.
 * Expo는 process.env.EXPO_PUBLIC_* 를 정적으로 치환하므로 반드시 이 형태로 직접 참조해야 한다.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
