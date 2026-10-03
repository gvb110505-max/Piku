// 통화 API 통합 테스트 — 로컬 Supabase(`supabase start`) + LiveKit + `supabase functions serve` 가 떠 있어야 한다.
// 사용: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... CALL_SWEEP_SECRET=... node scripts/test-calls-api.mjs
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SWEEP = process.env.CALL_SWEEP_SECRET;
assert(ANON && SERVICE && SWEEP, 'SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / CALL_SWEEP_SECRET 필요');

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const run = Date.now().toString(36);
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

async function makeUser(tag) {
  const email = `${tag}-${run}@test.local`;
  const password = `pw-${run}-${tag}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const username = `${tag}_${run}`.slice(0, 20);
  const { error: e3 } = await client.from('profiles').update({ username }).eq('id', data.user.id);
  if (e3) throw e3;
  return { id: data.user.id, client, username };
}

async function fn(user, name, body) {
  const { data: { session } } = await user.client.auth.getSession();
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}`, apikey: ANON },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const follow = (u, target) => u.client.from('follows').insert({ follower_id: u.id, following_id: target.id }).then(({ error }) => { if (error) throw error; });

console.log('준비');
const [a, b, c, e] = await Promise.all(['ana', 'ben', 'cat', 'eve'].map(makeUser));
await follow(a, b); await follow(b, a);
await follow(a, c);
await follow(e, b); await follow(b, e);
await follow(e, a); await follow(a, e);

console.log('연락처 · 검색');
{
  const { data } = await a.client.rpc('list_contacts');
  assert.deepEqual(data.map((p) => p.id).sort(), [b.id, e.id].sort());
  ok('연락처 = 맞팔로우만');
  const { data: found } = await c.client.rpc('search_profiles', { q: a.username });
  assert.equal(found.length, 1); assert.equal(found[0].follows_me, true); assert.equal(found[0].i_follow, false);
  ok('검색 + 팔로우 상태');
}

console.log('발신 거부');
{
  const r = await fn(a, 'call-start', { calleeId: c.id });
  assert.equal(r.status, 403); assert.equal(r.body.error, 'not_mutual');
  ok('맞팔이 아니면 거부');
  const r2 = await fn(a, 'call-start', { calleeId: a.id });
  assert.equal(r2.body.error, 'self_call');
  ok('자기 자신에게 거부');
  const r3 = await fetch(`${URL}/functions/v1/call-start`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${ANON}` }, body: '{}' });
  assert.equal(r3.status, 401);
  ok('로그인 없이 거부');
}

console.log('발신 → Realtime 수신 → 수락 → 종료');
let callId;
{
  let subscribed;
  const ready = new Promise((r) => (subscribed = r));
  const incoming = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Realtime 수신 이벤트 없음')), 10000);
    const ch = b.client.channel('incoming-test')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${b.id}` }, (p) => {
        clearTimeout(t); b.client.removeChannel(ch); resolve(p.new);
      })
      // SUBSCRIBED 이후에도 postgres_changes 준비가 끝났다는 system 메시지를 기다려야 이벤트를 놓치지 않는다
      .on('system', {}, (m) => { if (m.extension === 'postgres_changes' && m.status === 'ok') subscribed(); })
      .subscribe();
  });
  await ready;
  const r = await fn(a, 'call-start', { calleeId: b.id, media: 'video' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token && r.body.url && r.body.call.status === 'ringing' && r.body.call.media === 'video');
  callId = r.body.call.id;
  ok('발신 → ringing + LiveKit 토큰');
  const ev = await incoming;
  assert.equal(ev.id, callId);
  ok('수신자가 Realtime 으로 수신');

  const { data: cView } = await c.client.from('calls').select('id').eq('id', callId);
  assert.equal(cView.length, 0);
  ok('제3자는 통화 조회 불가');

  const busy = await fn(e, 'call-start', { calleeId: b.id });
  assert.equal(busy.status, 409); assert.equal(busy.body.error, 'callee_busy');
  ok('상대가 통화 중이면 callee_busy');

  const early = await fn(a, 'call-action', { callId, action: 'timeout' });
  assert.equal(early.body.error, 'too_early');
  ok('30초 전 timeout 거부');

  const notMine = await fn(a, 'call-action', { callId, action: 'accept' });
  assert.equal(notMine.body.error, 'forbidden');
  ok('발신자는 수락 불가');

  const acc = await fn(b, 'call-action', { callId, action: 'accept' });
  assert.equal(acc.status, 200); assert.equal(acc.body.call.status, 'accepted'); assert.ok(acc.body.token);
  ok('수락 → accepted + 수신자 토큰');

  const end = await fn(a, 'call-action', { callId, action: 'hangup' });
  assert.equal(end.body.call.status, 'ended');
  const end2 = await fn(b, 'call-action', { callId, action: 'hangup' });
  assert.equal(end2.body.call.status, 'ended');
  ok('종료 (양쪽 동시 종료 안전)');
}

console.log('거절 · 발신 취소');
{
  const r = await fn(a, 'call-start', { calleeId: b.id });
  const d = await fn(b, 'call-action', { callId: r.body.call.id, action: 'decline' });
  assert.equal(d.body.call.status, 'declined');
  ok('거절 → declined');
  const r2 = await fn(a, 'call-start', { calleeId: b.id });
  const x = await fn(a, 'call-action', { callId: r2.body.call.id, action: 'hangup' });
  assert.equal(x.body.call.status, 'missed');
  ok('발신 취소 → missed');
}

console.log('응답 없음 정리 (call-sweep)');
{
  const r = await fn(a, 'call-start', { calleeId: b.id });
  await admin.from('calls').update({ started_at: new Date(Date.now() - 40_000).toISOString() }).eq('id', r.body.call.id);
  const bad = await fetch(`${URL}/functions/v1/call-sweep`, { method: 'POST', headers: { 'x-cron-secret': 'wrong' } });
  assert.equal(bad.status, 401);
  const res = await fetch(`${URL}/functions/v1/call-sweep`, { method: 'POST', headers: { 'x-cron-secret': SWEEP } });
  const body = await res.json();
  assert.equal(res.status, 200); assert.ok(body.expired >= 1);
  const { data } = await a.client.from('calls').select('status').eq('id', r.body.call.id).single();
  assert.equal(data.status, 'missed');
  ok('오래된 ringing → missed');
}

console.log('웹훅 서명 검증');
{
  const res = await fetch(`${URL}/functions/v1/livekit-webhook`, { method: 'POST', headers: { authorization: 'bad' }, body: '{}' });
  assert.equal(res.status, 401);
  ok('서명 없는 웹훅 거부');
}

console.log(`\n통화 API: ${passed}개 통과`);
process.exit(0);
