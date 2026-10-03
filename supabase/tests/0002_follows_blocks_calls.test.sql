-- 2단계 테스트: 팔로우 · 차단 헬퍼 · 검색/연락처 · 통화 상태 머신 · 기기 토큰
\set ON_ERROR_STOP on

-- 기대한 오류가 나는지 확인하는 헬퍼 (호출자 권한으로 실행)
create function public._expect_error(p_sql text, p_pattern text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_pattern and sqlstate not like p_pattern then
      raise exception 'expected error like "%" but got [%] %  (sql: %)', p_pattern, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'expected error like "%" but succeeded (sql: %)', p_pattern, p_sql;
end $$;
grant execute on function public._expect_error(text, text) to authenticated, service_role;
grant execute on function public._test_login(uuid) to authenticated, service_role;
grant execute on function public._test_service() to authenticated, service_role;

-- 사용자: a(alice) b(bob) c(carol) e(erin), d 는 username 미설정
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@x.com'),
  ('00000000-0000-0000-0000-00000000000e', 'e@x.com');
update public.profiles set username = 'alice' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set username = 'bob'   where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set username = 'carol' where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set username = 'erin'  where id = '00000000-0000-0000-0000-00000000000e';

-- ── 팔로우 ─────────────────────────────────────────────────
select public._test_login('00000000-0000-0000-0000-00000000000a');
insert into public.follows (follower_id, following_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e');
-- 남의 명의로 팔로우 불가
select public._expect_error($$insert into public.follows values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a')$$, '%row-level security%');
-- 자기 자신 팔로우 불가
select public._expect_error($$insert into public.follows values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a')$$, '23514');

reset role; select public._test_login('00000000-0000-0000-0000-00000000000b');
insert into public.follows (follower_id, following_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
-- b 는 a→c 팔로우 관계를 볼 수 없다
do $$ begin
  assert (select count(*) from public.follows) = 2, 'b 는 자신이 당사자인 팔로우만 조회';
end $$;
-- 남의 팔로우 취소 불가 (0행)
do $$ declare n int; begin
  delete from public.follows where follower_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, '남의 팔로우 삭제 불가';
end $$;

reset role; select public._test_login('00000000-0000-0000-0000-00000000000e');
insert into public.follows (follower_id, following_id) values ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');

-- ── 연락처 (맞팔로우만) · 검색 ──────────────────────────────
reset role; select public._test_login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select array_agg(username order by username) from public.list_contacts()) = array['bob', 'erin'],
    '연락처 = 맞팔로우(bob, erin), 일방 팔로우(carol) 제외';
  assert (select count(*) from public.search_profiles('b')) = 1, '검색: username 접두어';
  assert (select i_follow and follows_me from public.search_profiles('bob')), '검색: 팔로우 상태';
  assert (select count(*) from public.search_profiles('a')) = 0, '검색: 본인 제외';
  assert (select count(*) from public.search_profiles('_')) = 0, '검색: 와일드카드 이스케이프';
  assert (select count(*) from public.search_profiles('')) = 0, '검색: 빈 검색어';
end $$;

-- ── 차단 헬퍼 / 차단 시 팔로우·검색 ─────────────────────────
-- 클라이언트는 blocks 에 직접 쓸 수 없다 (4단계 서버 함수로만)
select public._expect_error($$insert into public.blocks values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$, '42501');
-- 제3자 간 차단 여부 조회 불가
select public._expect_error($$select public.is_blocked('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c')$$, '42501');

reset role;
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a');

select public._test_login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert public.is_blocked(auth.uid(), '00000000-0000-0000-0000-00000000000c'), '양방향 차단 판정';
  assert not public.is_blocked(auth.uid(), '00000000-0000-0000-0000-00000000000c', false), '단방향: a 는 c 를 차단하지 않음';
  assert (select count(*) from public.blocks) = 0, 'a 는 자신을 차단한 기록을 볼 수 없다';
end $$;

-- 차단당한 a 는 차단한 c 를 팔로우할 수 없다 (기존 a→c 를 지우고 다시 시도)
delete from public.follows where following_id = '00000000-0000-0000-0000-00000000000c';
select public._expect_error($$insert into public.follows values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$, '%row-level security%');

reset role; select public._test_login('00000000-0000-0000-0000-00000000000c');
-- 차단한 c 도 일반 insert 로는 팔로우 불가 (4단계 재팔로우 함수 전용)
select public._expect_error($$insert into public.follows values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a')$$, '%row-level security%');
do $$ begin
  assert (select count(*) from public.search_profiles('alice')) = 0, '차단한 사람에게 차단당한 사람이 검색되지 않음';
  assert (select count(*) from public.blocks) = 1, '차단한 사람은 자기 차단 목록 조회';
end $$;

-- ── 통화: 클라이언트는 직접 만들거나 바꿀 수 없다 ──────────
reset role; select public._test_login('00000000-0000-0000-0000-00000000000a');
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'audio')$$, '42501');
select public._expect_error($$select public.call_update(gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'accept')$$, '42501');
select public._expect_error($$insert into public.calls (caller_id, callee_id, room_name) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'x')$$, '42501');

-- ── 통화: 서버(service_role) ───────────────────────────────
reset role; select public._test_service();
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a')$$, 'self_call');
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d')$$, 'callee_not_found');
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$, 'blocked');
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a')$$, 'blocked');
-- 맞팔 아님: b ↛ c
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c')$$, 'not_mutual');

-- 정상 발신 → 수락 → 종료
create temp table t (k text primary key, id uuid);
grant all on t to service_role, authenticated;
insert into t select 'c1', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'video');
do $$ declare c public.calls; begin
  select * into c from public.calls where id = (select id from t where k = 'c1');
  assert c.status = 'ringing' and c.media = 'video' and c.room_name like 'call\_%', '발신 → ringing';
end $$;
-- 통화 중 발신/수신 거부
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e')$$, 'caller_busy');
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a')$$, 'callee_busy');
-- 제3자 / 발신자는 수락 불가
select public._expect_error($$select public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000e', 'accept')$$, 'call_not_found');
select public._expect_error($$select public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000a', 'accept')$$, 'forbidden');
select public._expect_error($$select public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000a', 'timeout')$$, 'too_early');
do $$ declare r jsonb; begin
  r := public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000b', 'accept');
  assert r->'call'->>'status' = 'accepted' and (r->>'changed')::bool and r->'call'->>'answered_at' is not null, '수락';
  r := public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000a', 'hangup');
  assert r->'call'->>'status' = 'ended' and r->'call'->>'ended_at' is not null, '종료';
  r := public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000b', 'hangup');
  assert r->'call'->>'status' = 'ended' and not (r->>'changed')::bool, '양쪽 동시 종료: 두 번째는 무시';
end $$;
select public._expect_error($$select public.call_update((select id from t where k='c1'), '00000000-0000-0000-0000-00000000000b', 'accept')$$, 'invalid_state');

-- 거절
insert into t select 'c2', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.call_update((select id from t where k='c2'), '00000000-0000-0000-0000-00000000000b', 'decline')->'call'->>'status' = 'declined', '거절';
end $$;

-- 발신 취소 → 수신자 기준 부재중
insert into t select 'c3', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.call_update((select id from t where k='c3'), '00000000-0000-0000-0000-00000000000a', 'hangup')->'call'->>'status' = 'missed', '발신 취소 → missed';
end $$;

-- 30초 응답 없음 → missed
insert into t select 'c4', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
reset role; update public.calls set started_at = now() - interval '31 seconds' where id = (select id from t where k='c4');
select public._test_service();
do $$ begin
  assert public.call_update((select id from t where k='c4'), '00000000-0000-0000-0000-00000000000a', 'timeout')->'call'->>'status' = 'missed', '타임아웃 → missed';
end $$;

-- 발신 앱이 꺼져 timeout 을 못 보낸 경우: 서버 정리 + 늦은 수락은 missed
insert into t select 'c5', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
reset role; update public.calls set started_at = now() - interval '40 seconds' where id = (select id from t where k='c5');
select public._test_service();
do $$ begin
  assert public.call_update((select id from t where k='c5'), '00000000-0000-0000-0000-00000000000b', 'accept')->'call'->>'status' = 'missed', '시간 지난 수락 → missed';
end $$;
insert into t select 'c6', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
reset role; update public.calls set started_at = now() - interval '40 seconds' where id = (select id from t where k='c6');
select public._test_service();
do $$ begin
  assert (select count(*) from public.expire_ringing_calls()) = 1, '서버 정리: 오래된 ringing → missed';
  assert (select status from public.calls where id = (select id from t where k='c6')) = 'missed', '정리 결과';
end $$;

-- 오래된 ringing 이 남아 있어도 새 발신 시 자동 정리되어 busy 가 아님
insert into t select 'c7', id from public.call_start('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
reset role; update public.calls set started_at = now() - interval '40 seconds' where id = (select id from t where k='c7');
select public._test_service();
insert into t select 'c8', id from public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');

-- LiveKit 웹훅: ringing 중 수신자가 나감 → 변화 없음 / 발신자가 나감 → missed
do $$ declare room text; begin
  select room_name into room from public.calls where id = (select id from t where k='c8');
  assert not (public.call_on_participant_left(room, '00000000-0000-0000-0000-00000000000a')->>'changed')::bool, '수신자 이탈은 무시';
  assert public.call_on_participant_left(room, '00000000-0000-0000-0000-00000000000e')->'call'->>'status' = 'missed', '발신자 이탈 → missed';
end $$;
-- accepted 중 이탈(정상 hangup 없이) → failed
insert into t select 'c9', id from public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');
do $$ declare room text; begin
  perform public.call_update((select id from t where k='c9'), '00000000-0000-0000-0000-00000000000a', 'accept');
  select room_name into room from public.calls where id = (select id from t where k='c9');
  assert public.call_on_participant_left(room, '00000000-0000-0000-0000-00000000000a')->'call'->>'status' = 'failed', '통화 중 끊김 → failed';
  assert public.call_on_participant_left('no_such_room', '00000000-0000-0000-0000-00000000000a') is null, '모르는 룸 무시';
end $$;
-- 룸 소멸 / fail
insert into t select 'c10', id from public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.call_update((select id from t where k='c10'), '00000000-0000-0000-0000-00000000000a', 'accept');
  assert public.call_on_room_gone((select room_name from public.calls where id = (select id from t where k='c10')))->'call'->>'status' = 'failed', '룸 소멸 → failed';
end $$;
insert into t select 'c11', id from public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert public.call_update((select id from t where k='c11'), '00000000-0000-0000-0000-00000000000e', 'fail')->'call'->>'status' = 'failed', 'fail';
end $$;
-- 수신 중에 차단되면 수락해도 연결되지 않음
insert into t select 'c12', id from public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');
reset role;
insert into public.blocks values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e');
select public._test_service();
do $$ begin
  assert public.call_update((select id from t where k='c12'), '00000000-0000-0000-0000-00000000000a', 'accept')->'call'->>'status' = 'failed', '수신 중 차단 → 수락 불가';
end $$;
select public._expect_error($$select public.call_start('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a')$$, 'blocked');
reset role;
delete from public.blocks where blocker_id = '00000000-0000-0000-0000-00000000000a';

-- 통화 기록 조회는 당사자만
select public._test_login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.calls) = 7, 'b: 자기 통화(c1~c7)만 조회';
end $$;
select public._expect_error($$update public.calls set status = 'ended'$$, '42501');
reset role; select public._test_login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from public.calls) = 0, 'c: 남의 통화 조회 불가';
end $$;

-- ── 기기 토큰 ──────────────────────────────────────────────
reset role; select public._test_login('00000000-0000-0000-0000-00000000000a');
select public.register_device('ios', 'ExponentPushToken[A]', 'voipA');
select public._expect_error($$insert into public.device_tokens (user_id, platform, push_token) values (auth.uid(), 'ios', 'x')$$, '42501');
-- 같은 기기에서 b 로 로그인 → a 의 토큰 행은 제거되고 b 로 이전
reset role; select public._test_login('00000000-0000-0000-0000-00000000000b');
select public.register_device('ios', 'ExponentPushToken[A]', 'voipA');
do $$ begin
  assert (select count(*) from public.device_tokens) = 1, 'b 는 자기 토큰 조회';
end $$;
reset role; select public._test_login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(*) from public.device_tokens) = 0, 'a 의 토큰은 이전됨 / 남의 토큰 조회 불가';
end $$;
reset role;
do $$ begin
  assert (select user_id from public.device_tokens where voip_token = 'voipA') = '00000000-0000-0000-0000-00000000000b', '토큰 소유자 이전';
end $$;

-- anon 은 아무 것도 못 한다
set role anon;
select public._expect_error($$select * from public.follows$$, '42501');
select public._expect_error($$select public.search_profiles('b')$$, '42501');
reset role;

select '0002_follows_blocks_calls: ALL PASSED' as result;
