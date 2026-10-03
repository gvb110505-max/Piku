// 발신: 서버가 차단·맞팔로우·통화 중 여부를 확인하고 통화를 만든 뒤 LiveKit 토큰 발급 + 수신자에게 푸시.
// POST { calleeId: uuid, media?: 'audio' | 'video' }
// 200 { call, token, url } | 4xx { error: unavailable | not_mutual | self_call | caller_busy | callee_busy }

import { afterCallChange, displayName } from '../_shared/calls.ts';
import { fail, json, preflight } from '../_shared/http.ts';
import { createCallRoom, createCallToken, livekitClientUrl } from '../_shared/livekit.ts';
import { pushIncomingCall } from '../_shared/push.ts';
import { background, UUID_PATTERN } from '../_shared/runtime.ts';
import { adminClient, type CallChange, type CallRow, dbErrorCode, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const user = await requireUser(req);
  if (!user) return fail(401, 'unauthorized');

  let body: { calleeId?: unknown; media?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_body');
  }
  const calleeId = body.calleeId;
  const media = body.media ?? 'audio';
  if (typeof calleeId !== 'string' || !UUID_PATTERN.test(calleeId) || (media !== 'audio' && media !== 'video')) {
    return fail(400, 'invalid_body');
  }

  const db = adminClient();
  const { data, error } = await db.rpc('call_start', { p_caller: user.id, p_callee: calleeId, p_media: media });
  if (error) {
    const code = dbErrorCode(error);
    switch (code) {
      // 차단 여부를 응답으로 드러내지 않는다. 차단당한 쪽 표시 방식(Q13)은 4단계에서 확정.
      case 'blocked':
      case 'callee_not_found':
        return fail(403, 'unavailable');
      case 'not_mutual':
        return fail(403, 'not_mutual');
      case 'self_call':
        return fail(400, 'self_call');
      case 'caller_busy':
      case 'callee_busy':
        return fail(409, code);
      default:
        console.error('call_start 실패', error);
        return fail(500, 'server_error');
    }
  }

  const call = data as CallRow;
  try {
    const callerName = await displayName(user.id);
    await createCallRoom(call.room_name);
    const token = await createCallToken({ roomName: call.room_name, userId: user.id, name: callerName, media: call.media });
    await background(
      pushIncomingCall(call.callee_id, { callId: call.id, callerId: user.id, callerName, media: call.media }),
    );
    return json({ call, token, url: livekitClientUrl() });
  } catch (e) {
    // 룸/토큰 준비 실패 → 통화를 failed 로 정리해 "통화 중" 상태가 남지 않게 한다
    console.error('통화 준비 실패', e);
    const { data: change } = await db.rpc('call_update', { p_call_id: call.id, p_actor: user.id, p_action: 'fail' });
    await afterCallChange(change as CallChange | null);
    return fail(502, 'call_setup_failed');
  }
});
