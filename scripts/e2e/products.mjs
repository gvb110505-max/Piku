// 2.5단계 상품 소싱 웹 E2E: 상품 등록(사진 + 링크) → 남의 프로필에서 보기 · 링크 열기 → 삭제
// 사용: APP_URL=http://localhost:4173 node scripts/e2e/products.mjs   (로컬 Supabase + 웹 빌드 서빙 필요)
import { deflateSync } from 'node:zlib';

import { APP, expectText, loadPlaywright, log, newPage, runId as run, shot, signUp, sleep } from './helpers.mjs';

const { chromium } = loadPlaywright();

/** 테스트용 단색 PNG (외부 파일 없이) */
function makePng(size, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const A = await newPage(browser);
const B = await newPage(browser);
const ua = `sel_${run}`;
const ub = `buy_${run}`;

try {
  console.log('가입');
  await signUp(A, `sel-${run}@e2e.local`, ua);
  await signUp(B, `buy-${run}@e2e.local`, ub);
  log('판매자(A) · 구매자(B) 가입');
  await shot(A, 'call-tab');

  console.log('상품 등록');
  await A.getByRole('button', { name: '프로필', exact: true }).click();
  await A.getByRole('button', { name: '상품 추가' }).click();
  await A.getByText('상품 링크').first().waitFor();
  // 사진 없이 게시 불가
  if (await A.getByRole('button', { name: '게시' }).isEnabled()) throw new Error('사진 없이 게시 버튼 활성');
  const chooser = A.waitForEvent('filechooser');
  await A.getByRole('button', { name: '상품 사진 선택' }).click();
  await (await chooser).setFiles({ name: 'product.png', mimeType: 'image/png', buffer: makePng(320, [249, 115, 22]) });
  await A.getByRole('button', { name: '상품 사진 바꾸기' }).waitFor();
  // 위험한 링크는 거부
  await A.getByLabel('상품 링크').fill('javascript:alert(1)');
  await A.getByRole('button', { name: '게시' }).click();
  await expectText(A, '상품 링크를 확인해 주세요');
  log('사진 필수 · 위험한 링크 거부');
  // 스킴 없이 붙여넣어도 https:// 로 정리
  await A.getByLabel('상품 링크').fill('smartstore.naver.com/e2e-shop/products/12345');
  await shot(A, 'new-product');
  await A.getByRole('button', { name: '게시' }).click();
  await A.getByRole('link', { name: '상품 링크 smartstore.naver.com' }).waitFor({ timeout: 20000 });
  await A.waitForFunction(() => [...document.images].some((img) => img.src.includes('product-images') && img.naturalWidth > 0), null, {
    timeout: 15000,
  });
  log('등록 → 프로필 상단 상품 줄에 이미지 + 링크 표시');
  await shot(A, 'profile-with-product');

  console.log('다른 사람이 보기');
  await B.getByRole('button', { name: '검색', exact: true }).click();
  await B.getByLabel('사용자 검색').fill(ua);
  await B.getByRole('button', { name: `@${ua} 프로필 보기` }).click();
  await B.getByRole('link', { name: '상품 링크 smartstore.naver.com' }).waitFor({ timeout: 15000 });
  log('검색 → 남의 프로필에서 상품 보임');
  const callBtn = B.getByRole('button', { name: `@${ua}에게 전화` });
  if (!(await callBtn.isDisabled())) throw new Error('맞팔로우가 아닌데 전화 버튼 활성');
  log('맞팔로우가 아니면 전화 버튼 비활성 (전화 규칙 유지)');
  await shot(B, 'other-profile');
  // 외부 사이트에 실제로 접속하지 않도록 상품 페이지를 가짜 응답으로 대체
  await B.context().route('https://smartstore.naver.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>product</h1>' }),
  );
  const popup = B.context().waitForEvent('page');
  await B.getByRole('link', { name: '상품 링크 smartstore.naver.com' }).click();
  const opened = await popup;
  await opened.waitForURL(/smartstore\.naver\.com/, { timeout: 10000 });
  const openedUrl = opened.url();
  if (!openedUrl.startsWith('https://smartstore.naver.com/e2e-shop/products/12345')) throw new Error(`링크 이동 실패: ${openedUrl}`);
  await opened.close();
  log('상품 누르면 상품 링크로 이동');

  console.log('팔로우 → 맞팔로우 → 전화 버튼');
  await B.getByRole('button', { name: `@${ua} 팔로우` }).click();
  await B.getByRole('button', { name: `@${ua} 팔로우 취소` }).waitFor();
  await A.goto(`${APP}/search`);
  await A.getByLabel('사용자 검색').fill(ub);
  await A.getByRole('button', { name: new RegExp(`@${ub} 팔로우$`) }).click();
  await A.getByRole('button', { name: new RegExp(`@${ub} 팔로우 취소`) }).waitFor();
  await B.reload();
  await B.getByRole('button', { name: `@${ua}에게 전화` }).waitFor();
  await sleep(500);
  if (await B.getByRole('button', { name: `@${ua}에게 전화` }).isDisabled()) throw new Error('맞팔로우인데 전화 버튼 비활성');
  log('맞팔로우가 되면 남의 프로필에서 바로 전화 가능');

  console.log('상품 삭제');
  await A.goto(`${APP}/profile`);
  const card = A.getByRole('link', { name: '상품 링크 smartstore.naver.com' });
  await card.waitFor();
  A.once('dialog', (d) => d.accept());
  const box = await card.boundingBox();
  await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await A.mouse.down();
  await sleep(900);
  await A.mouse.up();
  await card.waitFor({ state: 'detached', timeout: 10000 });
  log('길게 눌러 삭제');

  console.log('화면');
  await A.goto(`${APP}/home`);
  await A.getByText('홈 피드').waitFor();
  await shot(A, 'home');
  await A.goto(`${APP}/settings`);
  await A.getByRole('button', { name: '로그아웃' }).click();
  await A.getByLabel('이메일').waitFor();
  log('설정 → 로그아웃');

  console.log('\n상품 E2E: 모두 통과');
} catch (e) {
  await shot(A, 'FAIL-A');
  await shot(B, 'FAIL-B');
  console.error('\n상품 E2E 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
