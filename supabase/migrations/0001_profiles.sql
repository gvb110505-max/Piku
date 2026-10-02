-- 1단계: 사용자 프로필 (명세의 users 테이블)
-- auth.users 와 1:1. 레코드 생성은 서버 트리거만 할 수 있다.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  -- 가입 직후 온보딩 화면에서 설정한다. 설정 전에는 null.
  username     text unique
               constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text
               constraint profiles_display_name_length check (char_length(display_name) between 1 and 40),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is '사용자 프로필. auth.users 와 1:1';

-- ── 가입 시 프로필 자동 생성 ────────────────────────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이메일 변경 시 동기화
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ── 권한 ────────────────────────────────────────────────────
-- 컬럼 단위로 열어준다:
--  * email 은 다른 사용자에게 노출하지 않는다 (본인 이메일은 auth 세션에서 읽는다)
--  * insert/delete 는 클라이언트에 주지 않는다 (트리거 · auth.users cascade 로만)
--  * update 는 username / display_name / avatar_url 만
revoke all on table public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, created_at) on table public.profiles to authenticated;
grant update (username, display_name, avatar_url) on table public.profiles to authenticated;

alter table public.profiles enable row level security;

-- 차단 관계에 따른 조회 제한은 4단계에서 이 정책을 교체한다.
create policy "profiles: 로그인 사용자는 조회 가능"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: 본인만 수정"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
