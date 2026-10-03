// LiveKit 웹훅: 참가자 이탈 / 룸 종료 → 통화 상태 정리
// LiveKit Cloud(또는 서버 설정)의 Webhook URL 에 이 함수 주소를 등록한다.

import { afterCallChange } from '../_shared/calls.ts';
import { fail, json } from '../_shared/http.ts';
import { webhookReceiver } from '../_shared/livekit.ts';
import { adminClient, type CallChange } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const raw = await req.text();
  let event;
  try {
    event = await webhookReceiver().receive(raw, req.headers.get('Authorization') ?? undefined);
  } catch (e) {
    console.warn('웹훅 서명 검증 실패', e);
    return fail(401, 'invalid_signature');
  }

  const room = event.room?.name;
  if (!room?.startsWith('call_')) return json({ ok: true, ignored: true });

  const db = adminClient();
  let result: { data: unknown; error: { message: string } | null } | null = null;
  if (event.event === 'participant_left' && event.participant?.identity) {
    result = await db.rpc('call_on_participant_left', { p_room: room, p_user: event.participant.identity });
  } else if (event.event === 'room_finished') {
    result = await db.rpc('call_on_room_gone', { p_room: room });
  }
  if (result?.error) {
    console.error('웹훅 처리 실패', event.event, result.error);
    return fail(500, 'server_error');
  }
  await afterCallChange((result?.data ?? null) as CallChange | null);
  return json({ ok: true });
});
