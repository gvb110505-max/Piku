-- 2.5단계 테스트: 상품 · 이미지 저장소 정책 · 프로필 숫자
\set ON_ERROR_STOP on

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
grant execute on function public._expect_error(text, text) to authenticated;
grant execute on function public._test_login(uuid) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.com');
update public.profiles set username = 'alice' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set username = 'bob'   where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set username = 'carol' where id = '00000000-0000-0000-0000-00000000000c';
insert into public.follows values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

-- ── 이미지 저장소 ──────────────────────────────────────────
select public._test_login('00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name) values ('product-images', '00000000-0000-0000-0000-00000000000a/p1.jpg');
select public._expect_error($$insert into storage.objects (bucket_id, name) values ('product-images', '00000000-0000-0000-0000-00000000000b/x.jpg')$$, '%row-level security%');
select public._expect_error($$insert into storage.objects (bucket_id, name) values ('product-images', 'x.jpg')$$, '%row-level security%');

-- ── 상품 등록 ──────────────────────────────────────────────
insert into public.products (owner_id, url, image_path) values
  ('00000000-0000-0000-0000-00000000000a', 'https://smartstore.naver.com/shop/products/123?x=1', '00000000-0000-0000-0000-00000000000a/p1.jpg'),
  ('00000000-0000-0000-0000-00000000000a', 'http://coupang.com', '00000000-0000-0000-0000-00000000000a/p2.jpg');
-- 위험한 링크 / 형식이 아닌 링크 거부
select public._expect_error($$insert into public.products (owner_id, url, image_path) values (auth.uid(), 'javascript:alert(1)', auth.uid()::text || '/a.jpg')$$, '23514');
select public._expect_error($$insert into public.products (owner_id, url, image_path) values (auth.uid(), 'https://', auth.uid()::text || '/a.jpg')$$, '23514');
select public._expect_error($$insert into public.products (owner_id, url, image_path) values (auth.uid(), 'ftp://a.com/x', auth.uid()::text || '/a.jpg')$$, '23514');
-- 남의 명의 / 남의 폴더 이미지 연결 거부
select public._expect_error($$insert into public.products (owner_id, url, image_path) values ('00000000-0000-0000-0000-00000000000b', 'https://a.com', '00000000-0000-0000-0000-00000000000b/a.jpg')$$, '%row-level security%');
select public._expect_error($$insert into public.products (owner_id, url, image_path) values (auth.uid(), 'https://a.com', '00000000-0000-0000-0000-00000000000b/a.jpg')$$, '%row-level security%');
-- 수정 불가 (삭제 후 다시 등록)
select public._expect_error($$update public.products set url = 'https://b.com'$$, '42501');

do $$ begin
  assert (select followers from public.profile_stats(auth.uid())) = 2, '팔로워 2';
  assert (select following from public.profile_stats(auth.uid())) = 1, '팔로잉 1';
  assert (select products from public.profile_stats(auth.uid())) = 2, '상품 2';
end $$;

-- ── 다른 사람: 조회는 되지만 삭제 불가 ──────────────────────
reset role; select public._test_login('00000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  assert (select count(*) from public.products where owner_id = '00000000-0000-0000-0000-00000000000a') = 2, '남의 상품 조회';
  assert (select followers from public.profile_stats('00000000-0000-0000-0000-00000000000a')) = 2, '남의 프로필 숫자 조회';
  delete from public.products where owner_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, '남의 상품 삭제 불가';
  delete from storage.objects where name like '00000000-0000-0000-0000-00000000000a/%';
  get diagnostics n = row_count;
  assert n = 0, '남의 이미지 삭제 불가';
end $$;

-- ── 차단: 차단한 사람에게는 상대 상품·프로필 숫자가 보이지 않음 ──
reset role;
insert into public.blocks values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a');
select public._test_login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from public.products) = 0, '차단한 사람에게 상품 숨김';
  assert (select count(*) from public.profile_stats('00000000-0000-0000-0000-00000000000a')) = 0, '차단한 사람에게 숫자 숨김';
end $$;

-- 본인 삭제
reset role; select public._test_login('00000000-0000-0000-0000-00000000000a');
do $$ declare n int; begin
  delete from public.products where url = 'http://coupang.com';
  get diagnostics n = row_count;
  assert n = 1, '본인 상품 삭제';
  delete from storage.objects where name = '00000000-0000-0000-0000-00000000000a/p1.jpg';
  get diagnostics n = row_count;
  assert n = 1, '본인 이미지 삭제';
end $$;

-- anon 불가
reset role; set role anon;
select public._expect_error($$select * from public.products$$, '42501');
reset role;

select '0003_products: ALL PASSED' as result;
