-- 로컬 순수 Postgres 에서 마이그레이션/RLS 를 검증하기 위한 최소 Supabase 흉내.
-- 실제 Supabase 에는 적용하지 않는다 (scripts/test-db.sh 에서만 사용).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase 와 같은 방식: 요청 JWT 의 sub 클레임
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase Storage 최소 흉내 (버킷 · 객체 · foldername)
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Supabase Realtime 퍼블리케이션
create publication supabase_realtime;

-- Supabase 기본 권한과 유사하게 public 의 새 테이블은 API 역할에 열려 있는 상태로 시작
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- 테스트 헬퍼: 특정 사용자로 로그인한 것처럼 전환
create function public._test_login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  execute 'set role authenticated';
end;
$$;

-- 테스트 헬퍼: 서버(Edge Function, service_role)로 전환
create function public._test_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role service_role';
end;
$$;
