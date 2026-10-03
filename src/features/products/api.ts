import { getSupabase } from '@/lib/supabase';

const BUCKET = 'product-images';
const MAX_BYTES = 5 * 1024 * 1024;

export type Product = {
  id: string;
  owner_id: string;
  url: string;
  image_path: string;
  created_at: string;
};

/** DB 제약(products_url_format)과 같은 규칙. 최종 검증은 서버가 한다. */
const URL_PATTERN = /^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)+(:[0-9]{1,5})?([/?#]\S*)?$/i;

/** 붙여넣은 링크 정리: 앞뒤 공백 제거, 스킴이 없으면 https:// 붙임. 형식이 틀리면 null */
export function normalizeProductUrl(input: string): string | null {
  let url = input.trim();
  if (!url) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  if (!/^https?:/i.test(url)) return null;
  return URL_PATTERN.test(url) && url.length <= 2048 ? url : null;
}

/** 카드에 보여줄 짧은 출처 (예: smartstore.naver.com) */
export function productHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./, '');
}

export function productImageUrl(path: string): string {
  return getSupabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function listProducts(ownerId: string): Promise<Product[]> {
  const { data, error } = await getSupabase()
    .from('products')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Product[];
}

export class ProductError extends Error {}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export type PickedImage = { uri: string; mimeType?: string | null; fileSize?: number | null };

/** 이미지 업로드 → 상품 등록. 등록이 실패하면 올린 이미지는 지운다. */
export async function createProduct(ownerId: string, url: string, image: PickedImage): Promise<Product> {
  const supabase = getSupabase();
  const mime = image.mimeType && EXT[image.mimeType] ? image.mimeType : 'image/jpeg';
  if (image.fileSize && image.fileSize > MAX_BYTES) throw new ProductError('사진은 5MB 이하만 올릴 수 있어요.');

  const body = await (await fetch(image.uri)).arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new ProductError('사진은 5MB 이하만 올릴 수 있어요.');

  const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[mime]}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (upErr) throw new ProductError('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');

  const { data, error } = await supabase
    .from('products')
    .insert({ owner_id: ownerId, url, image_path: path })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new ProductError(error.code === '23514' ? '링크 형식이 올바르지 않아요.' : '상품을 등록하지 못했어요.');
  }
  return data as Product;
}

export async function deleteProduct(product: Product): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('products').delete().eq('id', product.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([product.image_path]);
}
