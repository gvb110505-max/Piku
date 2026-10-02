-- 1단계 profiles 테스트. 실패 시 예외로 중단된다.
\set ON_ERROR_STOP on

-- 준비: 가입 2명 (트리거로 프로필 생성되는지)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

do $$ begin
  assert (select count(*) from public.profiles) = 2, '가입 시 프로필 자동 생성';
  assert (select username from public.profiles where email = 'a@example.com') is null, 'username 초기값 null';
end $$;

grant execute on function public._test_login(uuid) to authenticated;
select public._test_login('00000000-0000-0000-0000-00000000000a');

-- A: 본인 username 설정 가능
update public.profiles set username = 'alice' where id = '00000000-0000-0000-0000-00000000000a';

-- A: 다른 사람 프로필 수정 → RLS 로 0행
do $$ declare n int; begin
  update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, '타인 프로필 수정 불가';
end $$;

-- A: 다른 사람 프로필 조회는 가능 (email 제외 컬럼)
do $$ begin
  assert (select count(*) from public.profiles) = 2, '프로필 조회 가능';
end $$;

-- A: email 컬럼 조회 불가
do $$ begin
  begin
    perform email from public.profiles limit 1;
    assert false, 'email 조회가 허용되면 안 됨';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A: email / id 수정 불가
do $$ begin
  begin
    update public.profiles set email = 'x@example.com' where id = auth.uid();
    assert false, 'email 수정이 허용되면 안 됨';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A: 프로필 직접 insert / delete 불가
do $$ begin
  begin
    insert into public.profiles (id, email) values (gen_random_uuid(), 'c@example.com');
    assert false, 'insert 가 허용되면 안 됨';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.profiles where id = auth.uid();
    assert false, 'delete 가 허용되면 안 됨';
  exception when insufficient_privilege then null;
  end;
end $$;

-- username 형식 위반 → check 위반 (23514)
do $$ begin
  begin
    update public.profiles set username = 'Bad Name!' where id = auth.uid();
    assert false, '형식 위반 username 이 허용되면 안 됨';
  exception when check_violation then null;
  end;
end $$;

-- B 로 전환: A 와 같은 username → unique 위반 (23505)
reset role;
select public._test_login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    update public.profiles set username = 'alice' where id = auth.uid();
    assert false, '중복 username 이 허용되면 안 됨';
  exception when unique_violation then null;
  end;
end $$;

-- 비로그인(anon)은 조회 불가
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.profiles limit 1;
    assert false, 'anon 조회가 허용되면 안 됨';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 이메일 변경 동기화 / 탈퇴 시 cascade
reset role;
update auth.users set email = 'a2@example.com' where id = '00000000-0000-0000-0000-00000000000a';
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select email from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'a2@example.com', '이메일 동기화';
  assert (select count(*) from public.profiles) = 1, 'auth.users 삭제 시 프로필 삭제';
end $$;

select '0001_profiles: ALL PASSED' as result;
