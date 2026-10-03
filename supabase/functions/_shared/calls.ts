import { pushCallStateAndroid, pushMissedCall } from './push.ts';
import { adminClient, type CallChange } from './supabase.ts';

export async function displayName(userId: string): Promise<string> {
  const { data } = await adminClient().from('profiles').select('username, display_name').eq('id', userId).single();
  return data?.display_name || (data?.username ? `@${data.username}` : '알 수 없음');
}

/**
 * 통화 상태가 바뀐 뒤 필요한 알림.
 *  - 울리던 전화가 끝나거나 수락됨 → Android 수신 화면 정리 (다른 기기 포함)
 *  - missed → 수신자에게 부재중 알림
 * 알림 실패가 통화 처리 자체를 실패시키지 않도록 오류는 기록만 한다.
 */
export async function afterCallChange(change: CallChange | null): Promise<void> {
  if (!change?.changed) return;
  const { call, previous } = change;
  try {
    const tasks: Promise<unknown>[] = [];
    if (previous === 'ringing') {
      tasks.push(pushCallStateAndroid(call.callee_id, call.id, call.status));
    }
    if (call.status === 'missed') {
      tasks.push(displayName(call.caller_id).then((name) => pushMissedCall(call.callee_id, call.id, call.caller_id, name)));
    }
    await Promise.allSettled(tasks);
  } catch (e) {
    console.error('통화 알림 실패', e);
  }
}
