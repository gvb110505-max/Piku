// 통화 상태 변경: accept | decline | hangup | timeout | fail
// POST { callId: uuid, action }
// 200 { call, token?, url? }  (accept 성공 시에만 수신자용 LiveKit 토큰)

import { afterCallChange, displayName } from '../_shared/calls.ts';
import { fail, json, preflight } from '../_shared/http.ts';
import { createCallToken, livekitClientUrl } from '../_shared/livekit.ts';
import { background, UUID_PATTERN } from '../_shared/runtime.ts';
import { adminClient, type CallChange, dbErrorCode, requireUser } from '../_shared/supabase.ts';

const ACTIONS = new Set(['accept', 'decline', 'hangup', 'timeout', 'fail']);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const user = await requireUser(req);
  if (!user) return fail(401, 'unauthorized');

  let body: { callId?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_body');
  }
  const { callId, action } = body;
  if (typeof callId !== 'string' || !UUID_PATTERN.test(callId) || typeof action !== 'string' || !ACTIONS.has(action)) {
    return fail(400, 'invalid_body');
  }

  const { data, error } = await adminClient().rpc('call_update', {
    p_call_id: callId,
    p_actor: user.id,
    p_action: action,
  });
  if (error) {
    const code = dbErrorCode(error);
    const status = { call_not_found: 404, forbidden: 403, invalid_state: 409, too_early: 409 }[code];
    if (!status) console.error('call_update 실패', error);
    return fail(status ?? 500, status ? code : 'server_error');
  }

  const change = data as CallChange;
  await background(afterCallChange(change));

  if (action === 'accept' && change.call.status === 'accepted') {
    const token = await createCallToken({
      roomName: change.call.room_name,
      userId: user.id,
      name: await displayName(user.id),
      media: change.call.media,
    });
    return json({ call: change.call, token, url: livekitClientUrl() });
  }
  return json({ call: change.call });
});
