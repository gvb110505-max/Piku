-- 2단계: 팔로우 · 차단(테이블/헬퍼만, UI·트랜잭션은 4단계) · 통화 · 기기 토큰
--
-- 확정된 정책
--   Q4  전화 탭 연락처 = 맞팔로우만
--   Q5  전화는 맞팔로우끼리만 (서버 강제) · 1:1 음성/영상 · 응답 없음 30초
-- 미확정 (4단계에서 확정)
--   Q12 차단의 조회 방향 → public.block_hides() 한 곳에서만 결정
--   Q13 차단당한 쪽에 보이는 방식 → 서버는 'blocked' 로 거부만 하고 표시 방식은 클라이언트에서 결정

-- ════════════════════════════════════════════════════════════
-- follows
-- ════════════════════════════════════════════════════════════
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

-- ════════════════════════════════════════════════════════════
-- blocks — 행 생성/삭제는 4단계의 서버 함수(트랜잭션)로만
-- ════════════════════════════════════════════════════════════
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- ── 공통 헬퍼 ───────────────────────────────────────────────
-- a 와 b 사이 차단 여부.
--   bidirectional = true  : 어느 방향이든 차단이 있으면 true
--   bidirectional = false : a 가 b 를 차단한 경우만 true
-- 로그인 사용자는 자신이 당사자인 쌍만 조회할 수 있다 (제3자 간 차단 관계 탐색 방지).
create function public.is_blocked(a uuid, b uuid, bidirectional boolean default true)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is not null and me <> a and me <> b then
    raise exception 'is_blocked: caller must be a party' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bidirectional and bl.blocker_id = b and bl.blocked_id = a)
  );
end;
$$;

-- 조회 화면(검색·연락처·피드 등)에서 viewer 에게 target 을 숨길지.
-- Q12(양방향 여부) 확정 전: 명세상 확정된 "차단한 사람에게 상대가 안 보임"만 적용.
-- Q12 가 정해지면 이 함수만 바꾼다.
create function public.block_hides(viewer uuid, target uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_blocked(viewer, target, false);
$$;

-- 맞팔로우 여부 (호출자의 RLS 범위 안에서 판단: 본인이 당사자인 경우에만 의미 있음)
create function public.is_mutual_follow(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.follows where follower_id = a and following_id = b)
     and exists (select 1 from public.follows where follower_id = b and following_id = a);
$$;

-- ── follows 권한 ────────────────────────────────────────────
revoke all on table public.follows from anon, authenticated;
grant select, delete on table public.follows to authenticated;
grant insert (follower_id, following_id) on table public.follows to authenticated;
alter table public.follows enable row level security;

create policy "follows: 당사자만 조회"
  on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));

-- 차단 관계(어느 방향이든)면 팔로우 불가.
--  * 차단당한 사람 → 차단한 사람 팔로우: 명세상 금지
--  * 차단한 사람 → 차단당한 사람 팔로우: 4단계의 "재팔로우(차단 해제)" 서버 함수로만 허용
create policy "follows: 본인 명의로만, 차단 관계면 거부"
  on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked(follower_id, following_id, true)
  );

create policy "follows: 본인 팔로우만 취소"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- ── blocks 권한 ─────────────────────────────────────────────
revoke all on table public.blocks from anon, authenticated;
grant select on table public.blocks to authenticated;
alter table public.blocks enable row level security;

create policy "blocks: 내가 차단한 목록만 조회"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- ── 사용자 검색 · 연락처 ────────────────────────────────────
create index profiles_username_prefix_idx on public.profiles (username text_pattern_ops);

create function public.search_profiles(q text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  i_follow boolean,
  follows_me boolean
)
language sql
stable
set search_path = ''
as $$
  with term as (
    select lower(trim(q)) as t,
           -- LIKE 와일드카드 이스케이프
           replace(replace(replace(lower(trim(q)), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = p.id),
         exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = (select auth.uid()))
  from public.profiles p, term
  where char_length(term.t) between 1 and 40
    and p.username is not null
    and p.id <> (select auth.uid())
    and (p.username like term.esc || '%' or lower(p.display_name) like '%' || term.esc || '%')
    and not public.block_hides((select auth.uid()), p.id)
  order by (p.username = term.t) desc, p.username
  limit 30;
$$;

-- 전화 탭 연락처: 맞팔로우만 (Q4)
create function public.list_contacts()
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = f.follower_id
  join public.profiles p on p.id = f.following_id
  where f.follower_id = (select auth.uid())
    and not public.block_hides((select auth.uid()), p.id)
  order by coalesce(p.display_name, p.username);
$$;

-- ════════════════════════════════════════════════════════════
-- calls — 생성/상태 변경은 서버(Edge Function → 아래 함수)만
-- ════════════════════════════════════════════════════════════
create type public.call_status as enum ('ringing', 'accepted', 'declined', 'missed', 'ended', 'failed');
create type public.call_media as enum ('audio', 'video');

create table public.calls (
  id          uuid primary key default gen_random_uuid(),
  caller_id   uuid not null references public.profiles (id) on delete cascade,
  callee_id   uuid not null references public.profiles (id) on delete cascade,
  media       public.call_media not null default 'audio',
  status      public.call_status not null default 'ringing',
  room_name   text not null unique,  -- LiveKit 룸 이름
  started_at  timestamptz not null default now(),
  answered_at timestamptz,
  ended_at    timestamptz,
  constraint calls_no_self check (caller_id <> callee_id)
);
create index calls_caller_idx on public.calls (caller_id, started_at desc);
create index calls_callee_idx on public.calls (callee_id, started_at desc);
create index calls_active_idx on public.calls (status) where status in ('ringing', 'accepted');

revoke all on table public.calls from anon, authenticated;
grant select on table public.calls to authenticated;
alter table public.calls enable row level security;

create policy "calls: 당사자만 조회"
  on public.calls for select to authenticated
  using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));

-- 수신 화면 · 상태 변화를 Realtime 으로 받는다 (RLS 적용됨)
alter publication supabase_realtime add table public.calls;

-- 응답 없음 타임아웃 (Q5: 30초). 클라이언트 상수(CALL_RING_TIMEOUT_SEC)와 맞출 것.
create function public.call_ring_timeout()
returns interval
language sql
immutable
as $$ select interval '30 seconds' $$;

-- 발신 앱이 꺼져서 'timeout' 을 못 보낸 통화를 서버가 정리할 때의 여유 시간
create function public.call_ring_grace()
returns interval
language sql
immutable
as $$ select interval '5 seconds' $$;

-- 오래된 ringing → missed. 정리된 행을 돌려준다 (부재중 알림 발송용).
create function public.expire_ringing_calls(p_user uuid default null)
returns setof public.calls
language sql
volatile
security definer
set search_path = ''
as $$
  update public.calls
     set status = 'missed', ended_at = now()
   where status = 'ringing'
     and started_at < now() - public.call_ring_timeout() - public.call_ring_grace()
     and (p_user is null or caller_id = p_user or callee_id = p_user)
  returning *;
$$;

-- 발신. 실패 시 예외 메시지(코드): self_call | callee_not_found | blocked | not_mutual | caller_busy | callee_busy
create function public.call_start(p_caller uuid, p_callee uuid, p_media public.call_media default 'audio')
returns public.calls
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_call public.calls;
begin
  if p_caller = p_callee then
    raise exception 'self_call';
  end if;

  -- 같은 사용자들에 대한 동시 발신 경쟁 방지. 항상 uuid 순서로 잠가 교착을 피한다.
  perform pg_advisory_xact_lock(hashtextextended(least(p_caller, p_callee)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(p_caller, p_callee)::text, 0));

  if not exists (select 1 from public.profiles where id = p_callee and username is not null) then
    raise exception 'callee_not_found';
  end if;
  -- 차단은 방향과 무관하게 통화 불가 (명세: 상대와의 통화는 서버에서 차단, 상대가 걸면 서버가 거부)
  if public.is_blocked(p_caller, p_callee, true) then
    raise exception 'blocked';
  end if;
  if not public.is_mutual_follow(p_caller, p_callee) then
    raise exception 'not_mutual';
  end if;

  perform public.expire_ringing_calls(p_caller);
  perform public.expire_ringing_calls(p_callee);

  if exists (select 1 from public.calls
             where status in ('ringing', 'accepted') and (caller_id = p_caller or callee_id = p_caller)) then
    raise exception 'caller_busy';
  end if;
  if exists (select 1 from public.calls
             where status in ('ringing', 'accepted') and (caller_id = p_callee or callee_id = p_callee)) then
    raise exception 'callee_busy';
  end if;

  insert into public.calls (id, caller_id, callee_id, media, room_name)
  values (v_id, p_caller, p_callee, p_media, 'call_' || replace(v_id::text, '-', ''))
  returning * into v_call;
  return v_call;
end;
$$;

-- 상태 변경. 반환: {"call": <calls 행>, "changed": bool, "previous": <이전 status>}
--   accept  : 수신자, ringing → accepted (타임아웃 지났으면 missed, 그사이 차단됐으면 failed)
--   decline : 수신자, ringing → declined
--   hangup  : 양쪽. accepted → ended / ringing 중 발신자 → missed, 수신자 → declined
--   timeout : 양쪽. ringing 이고 30초 경과 → missed
--   fail    : 양쪽. ringing/accepted → failed (네트워크 재접속 실패, 마이크 권한 거부 등)
-- 이미 끝난 통화에 대한 decline/hangup/timeout/fail 은 오류 없이 무시 (양쪽 동시 종료 경쟁 대비).
create function public.call_update(p_call_id uuid, p_actor uuid, p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v        public.calls;
  v_prev   public.call_status;
  v_caller boolean;
  v_callee boolean;
  v_next   public.call_status;
begin
  select * into v from public.calls where id = p_call_id for update;
  if not found then
    raise exception 'call_not_found';
  end if;
  v_caller := v.caller_id = p_actor;
  v_callee := v.callee_id = p_actor;
  if not (v_caller or v_callee) then
    raise exception 'call_not_found';  -- 당사자가 아니면 존재 자체를 숨긴다
  end if;
  v_prev := v.status;

  if p_action = 'accept' then
    if not v_callee then raise exception 'forbidden'; end if;
    if v.status <> 'ringing' then raise exception 'invalid_state'; end if;
    if v.started_at < now() - public.call_ring_timeout() - public.call_ring_grace() then
      v_next := 'missed';
    elsif public.is_blocked(v.caller_id, v.callee_id, true) then
      v_next := 'failed';
    else
      v_next := 'accepted';
    end if;
  elsif p_action = 'decline' then
    if not v_callee then raise exception 'forbidden'; end if;
    v_next := case when v.status = 'ringing' then 'declined'::public.call_status end;
  elsif p_action = 'hangup' then
    v_next := case
      when v.status = 'accepted' then 'ended'::public.call_status
      when v.status = 'ringing' and v_caller then 'missed'::public.call_status
      when v.status = 'ringing' and v_callee then 'declined'::public.call_status
    end;
  elsif p_action = 'timeout' then
    if v.status = 'ringing' then
      -- 기기 시계 오차를 감안해 2초 일찍 오는 것까지 허용
      if v.started_at > now() - public.call_ring_timeout() + interval '2 seconds' then
        raise exception 'too_early';
      end if;
      v_next := 'missed';
    end if;
  elsif p_action = 'fail' then
    v_next := case when v.status in ('ringing', 'accepted') then 'failed'::public.call_status end;
  else
    raise exception 'invalid_action';
  end if;

  if v_next is not null and v_next <> v.status then
    update public.calls
       set status      = v_next,
           answered_at = case when v_next = 'accepted' then now() else answered_at end,
           ended_at    = case when v_next = 'accepted' then null else now() end
     where id = v.id
    returning * into v;
  end if;

  return jsonb_build_object('call', to_jsonb(v), 'changed', v.status <> v_prev, 'previous', v_prev);
end;
$$;

-- LiveKit 웹훅: 참가자가 룸을 떠남.
--  * accepted 인데 떠났다 = 정상 종료(hangup 이 먼저 ended 로 바꿈)가 아니므로 failed (네트워크 끊김 등)
--  * ringing 중 발신자가 떠남 = 발신 취소 → missed
create function public.call_on_participant_left(p_room text, p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v      public.calls;
  v_prev public.call_status;
  v_next public.call_status;
begin
  select * into v from public.calls where room_name = p_room for update;
  if not found then
    return null;
  end if;
  v_prev := v.status;
  v_next := case
    when v.status = 'accepted' and p_user in (v.caller_id, v.callee_id) then 'failed'::public.call_status
    when v.status = 'ringing' and p_user = v.caller_id then 'missed'::public.call_status
  end;
  if v_next is not null then
    update public.calls set status = v_next, ended_at = now() where id = v.id returning * into v;
  end if;
  return jsonb_build_object('call', to_jsonb(v), 'changed', v.status <> v_prev, 'previous', v_prev);
end;
$$;

-- LiveKit 웹훅/정리 작업: 룸이 사라짐 → 진행 중이던 통화 종료 처리
create function public.call_on_room_gone(p_room text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v      public.calls;
  v_prev public.call_status;
  v_next public.call_status;
begin
  select * into v from public.calls where room_name = p_room for update;
  if not found then
    return null;
  end if;
  v_prev := v.status;
  v_next := case v.status
    when 'ringing' then 'missed'::public.call_status
    when 'accepted' then 'failed'::public.call_status
  end;
  if v_next is not null then
    update public.calls set status = v_next, ended_at = now() where id = v.id returning * into v;
  end if;
  return jsonb_build_object('call', to_jsonb(v), 'changed', v.status <> v_prev, 'previous', v_prev);
end;
$$;

-- ════════════════════════════════════════════════════════════
-- device_tokens
--   push_token : Expo 푸시 토큰 (부재중 알림 등 일반 푸시)
--   voip_token : 수신 전화용 — iOS PushKit 토큰 / Android FCM 토큰(데이터 메시지)
-- ════════════════════════════════════════════════════════════
create type public.device_platform as enum ('ios', 'android');

create table public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   public.device_platform not null,
  push_token text unique,
  voip_token text unique,
  updated_at timestamptz not null default now(),
  constraint device_tokens_has_token check (push_token is not null or voip_token is not null)
);
create index device_tokens_user_idx on public.device_tokens (user_id);

revoke all on table public.device_tokens from anon, authenticated;
grant select, delete on table public.device_tokens to authenticated;
alter table public.device_tokens enable row level security;

create policy "device_tokens: 본인 것만 조회"
  on public.device_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy "device_tokens: 본인 것만 삭제"
  on public.device_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- 기기 등록. 같은 토큰이 다른 계정에 남아 있으면(같은 기기에서 계정 전환) 지운다.
create function public.register_device(
  p_platform public.device_platform,
  p_push_token text,
  p_voip_token text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_push_token is null and p_voip_token is null then
    raise exception 'no_token';
  end if;
  delete from public.device_tokens
   where (p_push_token is not null and push_token = p_push_token)
      or (p_voip_token is not null and voip_token = p_voip_token);
  insert into public.device_tokens (user_id, platform, push_token, voip_token)
  values (me, p_platform, p_push_token, p_voip_token);
end;
$$;

-- ════════════════════════════════════════════════════════════
-- 함수 실행 권한
-- ════════════════════════════════════════════════════════════
revoke execute on all functions in schema public from public, anon;

-- 로그인 사용자용
grant execute on function public.is_blocked(uuid, uuid, boolean) to authenticated;
grant execute on function public.block_hides(uuid, uuid) to authenticated;
grant execute on function public.is_mutual_follow(uuid, uuid) to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.list_contacts() to authenticated;
grant execute on function public.register_device(public.device_platform, text, text) to authenticated;
grant execute on function public.call_ring_timeout() to authenticated;

-- 서버(Edge Function, service_role) 전용
revoke execute on function public.expire_ringing_calls(uuid) from authenticated;
revoke execute on function public.call_start(uuid, uuid, public.call_media) from authenticated;
revoke execute on function public.call_update(uuid, uuid, text) from authenticated;
revoke execute on function public.call_on_participant_left(text, uuid) from authenticated;
revoke execute on function public.call_on_room_gone(text) from authenticated;
grant execute on function public.expire_ringing_calls(uuid) to service_role;
grant execute on function public.call_start(uuid, uuid, public.call_media) to service_role;
grant execute on function public.call_update(uuid, uuid, text) to service_role;
grant execute on function public.call_on_participant_left(text, uuid) to service_role;
grant execute on function public.call_on_room_gone(text) to service_role;
