import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

import { env } from './http.ts';

let admin: SupabaseClient | null = null;

/** service_role 클라이언트 — RLS 를 우회하므로 서버 함수 안에서만 사용 */
export function adminClient(): SupabaseClient {
  admin ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Authorization: Bearer <사용자 JWT> 를 검증하고 사용자 반환. 실패 시 null */
export async function requireUser(req: Request): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  media: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | 'failed';
  room_name: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

/** call_update / call_on_* 함수의 반환 형태 */
export type CallChange = { call: CallRow; changed: boolean; previous: CallRow['status'] };

/** DB 함수가 raise 한 예외 메시지(오류 코드)를 꺼낸다 */
export function dbErrorCode(error: { message?: string } | null): string {
  return error?.message?.trim() ?? 'unknown';
}
