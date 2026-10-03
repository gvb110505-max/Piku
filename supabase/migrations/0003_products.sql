-- 2.5단계: 상품 소싱 — 프로필 상단에 상품(링크 + 이미지)을 올린다.
-- 확정: 프로필 상단에만 표시 · 사진 직접 업로드 · 상품을 봐도 전화는 맞팔로우끼리만(기존 규칙 유지)

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  -- http(s) 링크만 허용 (javascript: 등 위험한 스킴 차단)
  url        text not null
             constraint products_url_format check (
               char_length(url) <= 2048
               and url ~* '^https?://[^\s/?#.]+(\.[^\s/?#.]+)+(:[0-9]{1,5})?([/?#][^\s]*)?$'
             ),
  -- Storage(product-images) 안의 경로: <owner_id>/<파일명>
  image_path text not null constraint products_image_path_length check (char_length(image_path) <= 300),
  created_at timestamptz not null default now()
);
create index products_owner_idx on public.products (owner_id, created_at desc);

revoke all on table public.products from anon, authenticated;
grant select, delete on table public.products to authenticated;
grant insert (owner_id, url, image_path) on table public.products to authenticated;
alter table public.products enable row level security;

-- 차단 관계 조회 규칙은 block_hides() 한 곳에서 (Q12 확정 시 함께 반영됨)
create policy "products: 로그인 사용자 조회 (차단 시 숨김)"
  on public.products for select to authenticated
  using (not public.block_hides((select auth.uid()), owner_id));

-- 본인 명의로만, 본인 폴더의 이미지만 연결 가능
create policy "products: 본인만 등록"
  on public.products for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and image_path like owner_id::text || '/%'
  );

create policy "products: 본인만 삭제"
  on public.products for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── 프로필 숫자(팔로워 · 팔로잉 · 상품) ──────────────────────
-- follows 는 당사자만 조회할 수 있으므로 숫자만 서버 함수로 제공한다.
create function public.profile_stats(p_user uuid)
returns table (followers bigint, following bigint, products bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.follows where following_id = p_user),
         (select count(*) from public.follows where follower_id = p_user),
         (select count(*) from public.products where owner_id = p_user)
  where (select auth.uid()) is not null
    and not public.block_hides((select auth.uid()), p_user);
$$;

revoke execute on function public.profile_stats(uuid) from public, anon;
grant execute on function public.profile_stats(uuid) to authenticated;

-- ── 상품 이미지 저장소 ─────────────────────────────────────
-- 공개 읽기(이미지 URL 로 표시), 쓰기·삭제는 본인 폴더(<user_id>/...)만. 5MB, 이미지 형식만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "product-images: 본인 폴더에만 업로드"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 삭제 API 는 대상 조회 권한도 필요하다
create policy "product-images: 본인 파일 조회"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "product-images: 본인 파일만 삭제"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
