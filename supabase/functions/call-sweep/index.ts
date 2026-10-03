// 주기 정리 작업 (1분마다 권장, README 의 pg_cron 설정 참고)
//  1) 응답 없음 30초(+여유 5초)가 지났는데 아직 ringing 인 통화 → missed + 부재중 알림
//     (발신 앱이 꺼져서 timeout 을 못 보낸 경우)
//  2) accepted 인데 LiveKit 룸이 이미 없는 통화 → failed (웹훅 유실 대비)
// 헤더 x-cron-secret 이 CALL_SWEEP_SECRET 과 같아야 한다.

import { afterCallChange } from '../_shared/calls.ts';
import { env, fail, json } from '../_shared/http.ts';
import { roomService } from '../_shared/livekit.ts';
import { adminClient, type CallChange, type CallRow } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CALL_SWEEP_SECRET')) return fail(401, 'unauthorized');

  const db = adminClient();

  const { data: expired, error } = await db.rpc('expire_ringing_calls');
  if (error) {
    console.error('expire_ringing_calls 실패', error);
    return fail(500, 'server_error');
  }
  for (const call of (expired ?? []) as CallRow[]) {
    await afterCallChange({ call, changed: true, previous: 'ringing' });
  }

  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: active } = await db
    .from('calls')
    .select('room_name')
    .eq('status', 'accepted')
    .lt('answered_at', cutoff)
    .limit(200);
  let closed = 0;
  const names = (active ?? []).map((c: { room_name: string }) => c.room_name);
  if (names.length > 0) {
    const alive = new Set((await roomService().listRooms(names)).map((r) => r.name));
    for (const name of names.filter((n) => !alive.has(n))) {
      const { data } = await db.rpc('call_on_room_gone', { p_room: name });
      await afterCallChange(data as CallChange | null);
      closed++;
    }
  }

  return json({ expired: (expired ?? []).length, closed });
});
