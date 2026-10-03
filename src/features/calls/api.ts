import { FunctionsHttpError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

import type { CallAction, CallMedia, CallRow, PublicProfile } from './types';

/** Edge Function 이 돌려준 오류 코드 (unavailable, not_mutual, callee_busy, ...) */
export class CallApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

type JoinInfo = { call: CallRow; token: string; url: string };

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new CallApiError(payload?.error ?? 'server_error');
    }
    throw new CallApiError('network');
  }
  return data as T;
}

export function startCall(calleeId: string, media: CallMedia): Promise<JoinInfo> {
  return invoke<JoinInfo>('call-start', { calleeId, media });
}

export function acceptCall(callId: string): Promise<{ call: CallRow; token?: string; url?: string }> {
  return invoke('call-action', { callId, action: 'accept' });
}

export function updateCall(callId: string, action: Exclude<CallAction, 'accept'>): Promise<{ call: CallRow }> {
  return invoke('call-action', { callId, action });
}

const PROFILE_COLUMNS = 'id, username, display_name, avatar_url';

export async function fetchProfile(userId: string): Promise<PublicProfile | null> {
  const { data } = await getSupabase().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  return (data as PublicProfile | null) ?? null;
}

export async function fetchCall(callId: string): Promise<CallRow | null> {
  const { data } = await getSupabase().from('calls').select('*').eq('id', callId).maybeSingle();
  return (data as CallRow | null) ?? null;
}

export type CallLogEntry = CallRow & { caller: PublicProfile | null; callee: PublicProfile | null };

export async function fetchRecentCalls(limit = 30): Promise<CallLogEntry[]> {
  const { data, error } = await getSupabase()
    .from('calls')
    .select(
      `*, caller:profiles!calls_caller_id_fkey(${PROFILE_COLUMNS}), callee:profiles!calls_callee_id_fkey(${PROFILE_COLUMNS})`,
    )
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as CallLogEntry[];
}

/** 전화 탭 연락처 = 맞팔로우 (서버 함수 list_contacts) */
export async function fetchContacts(): Promise<PublicProfile[]> {
  const { data, error } = await getSupabase().rpc('list_contacts');
  if (error) throw error;
  return data as PublicProfile[];
}
