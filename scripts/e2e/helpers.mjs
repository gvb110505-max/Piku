// 웹 E2E 공용 도우미 (로컬 Supabase + Mailpit + 웹 빌드 서빙 필요)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(execSync('npm root -g').toString().trim() + '/playwright');
  }
}

export const APP = process.env.APP_URL ?? 'http://localhost:4173';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
export const SHOTS = process.env.SHOTS_DIR;
export const runId = Date.now().toString(36).slice(-5);

let step = 0;
export const log = (m) => console.log(`  ✓ ${m}`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png` });
}

export const expectText = (page, text, timeout = 15000) => page.getByText(text).first().waitFor({ timeout });

/** Mailpit 에서 이메일 OTP 코드 읽기 */
export async function otpFor(email) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const list = await res.json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      const code = (msg.Text || msg.HTML || '').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await sleep(500);
  }
  throw new Error(`OTP 메일 없음: ${email}`);
}

/** 이메일 OTP 가입 → username 설정 → 전화 탭 */
export async function signUp(page, email, username) {
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

/** 검색 탭에서 username 으로 찾아 팔로우하고 전화 탭으로 돌아온다 */
export async function followByName(page, username) {
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByLabel('사용자 검색').fill(username);
  const btn = page.getByRole('button', { name: new RegExp(`${username} 팔로우$`) });
  await btn.waitFor();
  await btn.click();
  await page.getByRole('button', { name: new RegExp(`${username} 팔로우 취소`) }).waitFor();
  await page.getByRole('button', { name: '전화', exact: true }).click();
}

export async function newPage(browser, contextOptions = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...contextOptions });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('    [pageerror]', e.message));
  return page;
}
