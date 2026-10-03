// 웹 2개 브라우저로 실제 통화 E2E (로컬 Supabase + LiveKit + Mailpit + 웹 빌드 서빙이 떠 있어야 함)
//  - 이메일 OTP 가입(메일은 Mailpit 에서 읽음) → username → 서로 팔로우 → 음성 통화 → 영상 통화 → 거절 → 응답 없음(30초)
// 사용: APP_URL=http://localhost:4173 node scripts/e2e-web-call.mjs   (playwright 필요: npm i -g playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(execSync('npm root -g').toString().trim() + '/playwright');
}
const { chromium } = playwright;

const APP = process.env.APP_URL ?? 'http://localhost:4173';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const SHOTS = process.env.SHOTS_DIR;
const run = Date.now().toString(36).slice(-5);
let step = 0;
const log = (m) => console.log(`  ✓ ${m}`);

async function otpFor(email) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const list = await res.json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      const code = (msg.Text || msg.HTML || '').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`OTP 메일 없음: ${email}`);
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png` });
}

async function signUp(page, email, username) {
  await page.goto(APP);
  await page.getByLabel('이메일').fill(email);
  await page.getByRole('button', { name: '인증 코드 받기' }).click();
  await page.getByLabel('인증 코드').waitFor();
  await page.getByLabel('인증 코드').fill(await otpFor(email));
  await page.getByRole('button', { name: '확인' }).click();
  await page.getByLabel('사용자 이름').fill(username);
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByText('연락처').waitFor();
}

async function followByName(page, username) {
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByLabel('사용자 검색').fill(username);
  const btn = page.getByRole('button', { name: new RegExp(`${username} 팔로우$`) });
  await btn.waitFor();
  await btn.click();
  await page.getByRole('button', { name: new RegExp(`${username} 팔로우 취소`) }).waitFor();
  await page.getByRole('button', { name: '전화', exact: true }).click();
}

const expectText = (page, text, timeout = 15000) => page.getByText(text).first().waitFor({ timeout });

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone', 'camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('    [pageerror]', e.message));
  return page;
};
const A = await mk();
const B = await mk();
const ua = `ana_${run}`;
const ub = `ben_${run}`;

try {
  console.log('가입 (이메일 OTP)');
  await signUp(A, `ana-${run}@e2e.local`, ua);
  await signUp(B, `ben-${run}@e2e.local`, ub);
  log('두 사용자 가입 · username 설정');

  console.log('맞팔로우');
  await followByName(A, ub);
  await expectText(A, '서로 팔로우한 친구가 여기에 나타나요');
  log('일방 팔로우는 연락처에 없음');
  await followByName(B, ua);
  await A.reload();
  await A.getByRole('button', { name: `@${ub}에게 전화 걸기` }).waitFor();
  log('맞팔로우 → 연락처에 표시');
  await shot(A, 'contacts');

  console.log('음성 통화');
  await A.getByRole('button', { name: `@${ub}에게 전화 걸기` }).click();
  await expectText(A, '전화 거는 중');
  await expectText(B, '음성 통화 수신 중');
  log('한 번 탭 → 발신 화면 / 상대에게 수신 화면');
  await shot(A, 'outgoing');
  await shot(B, 'incoming');
  await B.getByRole('button', { name: '받기' }).click();
  await A.getByLabel(/통화 시간/).waitFor({ timeout: 20000 });
  await B.getByLabel(/통화 시간/).waitFor({ timeout: 20000 });
  log('수락 → 양쪽 통화 중');
  const audioEls = await B.evaluate(() => document.querySelectorAll('audio[data-call-audio]').length);
  if (audioEls < 1) throw new Error('원격 오디오 요소 없음');
  log('원격 오디오 트랙 수신');
  await A.getByRole('switch', { name: '음소거' }).click();
  await A.getByRole('switch', { name: '음소거 해제' }).waitFor();
  log('음소거 토글');
  await shot(A, 'active');
  await new Promise((r) => setTimeout(r, 2000));
  await B.getByRole('button', { name: '종료' }).click();
  await expectText(A, '통화가 종료되었습니다');
  await shot(A, 'ended');
  await A.getByText('최근 통화').waitFor({ timeout: 10000 });
  await expectText(A, /발신 · 0:0\d/);
  log('상대가 종료 → 종료 표시 → 최근 통화에 기록');

  console.log('영상 통화');
  await A.getByRole('button', { name: `@${ub}에게 영상 통화` }).click();
  await expectText(B, '영상 통화 수신 중');
  await B.getByRole('button', { name: '받기' }).click();
  await B.getByLabel(/통화 시간/).waitFor({ timeout: 20000 });
  await B.waitForFunction(
    () => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length >= 2,
    null,
    { timeout: 20000 },
  );
  log('상대 영상 + 내 영상 재생');
  await shot(B, 'video');
  await B.getByRole('switch', { name: '카메라 끄기' }).click();
  await B.getByRole('switch', { name: '카메라 켜기' }).waitFor();
  log('카메라 끄기');
  await A.getByRole('button', { name: '종료' }).click();
  await expectText(B, '통화가 종료되었습니다');
  log('종료');

  console.log('거절');
  await new Promise((r) => setTimeout(r, 2500));
  await A.getByRole('button', { name: `@${ub}에게 전화 걸기` }).click();
  await expectText(B, '음성 통화 수신 중');
  await B.getByRole('button', { name: '거절' }).click();
  await expectText(A, '상대방이 전화를 받을 수 없습니다');
  log('거절 → 발신자에게 표시');

  console.log('응답 없음 (30초)');
  await new Promise((r) => setTimeout(r, 2500));
  const t0 = Date.now();
  await A.getByRole('button', { name: `@${ub}에게 전화 걸기` }).click();
  await expectText(B, '음성 통화 수신 중');
  await expectText(A, '응답이 없습니다', 45000);
  const sec = Math.round((Date.now() - t0) / 1000);
  if (sec < 29) throw new Error(`타임아웃이 너무 빠름: ${sec}s`);
  log(`응답 없음 처리 (${sec}초)`);
  await expectText(B, '부재중 전화', 15000);
  log('수신자 화면도 부재중으로 닫힘');
  await new Promise((r) => setTimeout(r, 2500));
  await expectText(B, '부재중');
  await shot(B, 'missed-log');
  log('수신자 최근 통화에 부재중 표시');

  console.log('통화 중 네트워크 끊김');
  await new Promise((r) => setTimeout(r, 2500));
  await A.getByRole('button', { name: `@${ub}에게 전화 걸기` }).click();
  await expectText(B, '음성 통화 수신 중');
  await B.getByRole('button', { name: '받기' }).click();
  await A.getByLabel(/통화 시간/).waitFor({ timeout: 20000 });
  await B.context().setOffline(true);
  await expectText(A, '통화가 끊어졌습니다', 90000);
  log('상대 네트워크 끊김 → 발신자에게 끊김 표시 (서버 failed)');
  // 끊긴 쪽은 오프라인 상태에서 재접속을 포기하고 스스로 통화 화면을 닫는다
  await B.getByText('연락처').waitFor({ timeout: 90000 });
  if (await B.getByLabel(/통화 시간/).count()) throw new Error('끊긴 쪽 통화 화면이 남아 있음');
  await B.context().setOffline(false);
  log('끊긴 쪽도 재접속 실패 후 통화 화면 정리');

  console.log('마이크 권한 거부');
  // 실제 브라우저에서 사용자가 "차단"을 누른 것과 같은 오류(NotAllowedError)를 재현
  const denyBrowser = await chromium.launch();
  try {
    const denyCtx = await denyBrowser.newContext({ viewport: { width: 390, height: 844 } });
    await denyCtx.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    const C = await denyCtx.newPage();
    const uc = `cat_${run}`;
    await signUp(C, `cat-${run}@e2e.local`, uc);
    await followByName(C, ua);
    await B.reload().catch(() => undefined);
    await followByName(A, uc);
    await C.reload();
    await C.getByRole('button', { name: `@${ua}에게 전화 걸기` }).click();
    await expectText(C, '마이크 권한이 필요합니다');
    await shot(C, 'mic-denied');
    log('마이크 권한 거부 → 권한 안내 화면');
    await new Promise((r) => setTimeout(r, 2000));
    if (await A.getByText('음성 통화 수신 중').count()) throw new Error('권한이 없는데 상대가 울림');
    log('권한이 없으면 상대를 울리지 않음');
  } finally {
    await denyBrowser.close();
  }

  console.log('\nE2E: 모두 통과');
} catch (e) {
  await shot(A, 'FAIL-A');
  await shot(B, 'FAIL-B');
  console.error('\nE2E 실패:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
