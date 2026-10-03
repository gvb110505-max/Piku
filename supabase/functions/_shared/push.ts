// 푸시 발송: 수신 전화(iOS PushKit VoIP / Android FCM 데이터 메시지) + 일반 알림(Expo Push)
// 키가 설정되지 않은 채널은 건너뛴다 (웹 전용 개발 환경에서도 함수가 동작하도록).

import { optionalEnv } from './http.ts';
import { adminClient } from './supabase.ts';

type DeviceRow = { id: string; platform: 'ios' | 'android'; push_token: string | null; voip_token: string | null };

async function devicesOf(userId: string): Promise<DeviceRow[]> {
  const { data, error } = await adminClient()
    .from('device_tokens')
    .select('id, platform, push_token, voip_token')
    .eq('user_id', userId);
  if (error) {
    console.error('device_tokens 조회 실패', error.message);
    return [];
  }
  return data as DeviceRow[];
}

async function dropDevice(id: string, reason: string) {
  console.warn('무효 토큰 삭제', id, reason);
  await adminClient().from('device_tokens').delete().eq('id', id);
}

// ── base64url / PEM ──────────────────────────────────────────
const enc = new TextEncoder();
function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
async function signJwt(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  key: CryptoKey,
  algorithm: AlgorithmIdentifier | EcdsaParams,
): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(algorithm, key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

// ── APNs (iOS VoIP) ─────────────────────────────────────────
let apnsJwt: { token: string; at: number } | null = null;

async function apnsAuthToken(): Promise<string | null> {
  const keyId = optionalEnv('APNS_KEY_ID');
  const teamId = optionalEnv('APNS_TEAM_ID');
  const p8 = optionalEnv('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !p8) return null;
  const now = Math.floor(Date.now() / 1000);
  // APNs 토큰은 20~60분 사이에 갱신해야 한다
  if (apnsJwt && now - apnsJwt.at < 40 * 60) return apnsJwt.token;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(p8), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  const token = await signJwt({ alg: 'ES256', kid: keyId }, { iss: teamId, iat: now }, key, {
    name: 'ECDSA',
    hash: 'SHA-256',
  });
  apnsJwt = { token, at: now };
  return token;
}

async function sendApnsVoip(device: DeviceRow, payload: Record<string, string>): Promise<void> {
  const auth = await apnsAuthToken();
  const bundleId = optionalEnv('APNS_BUNDLE_ID');
  if (!auth || !bundleId || !device.voip_token) return;
  const host = optionalEnv('APNS_ENV') === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const res = await fetch(`https://${host}/3/device/${device.voip_token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${auth}`,
      'apns-topic': `${bundleId}.voip`,
      'apns-push-type': 'voip',
      'apns-priority': '10',
      'apns-expiration': '0', // 지금 전달 못 하면 버린다 (지난 전화를 나중에 울리지 않도록)
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 410 || body.includes('BadDeviceToken') || body.includes('Unregistered')) {
      await dropDevice(device.id, `apns ${res.status} ${body}`);
    } else {
      console.error('APNs 실패', res.status, body);
    }
  }
}

// ── FCM v1 (Android 데이터 메시지) ────────────────────────────
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let fcmAccess: { token: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = optionalEnv('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  return JSON.parse(raw) as ServiceAccount;
}

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmAccess && fcmAccess.exp - 60 > now) return fcmAccess.token;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    key,
    { name: 'RSASSA-PKCS1-v1_5' },
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`FCM OAuth 실패 ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  fcmAccess = { token: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

async function sendFcmData(device: DeviceRow, data: Record<string, string>, ttlSec: number): Promise<void> {
  const sa = serviceAccount();
  if (!sa || !device.voip_token) return;
  const token = await fcmAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: device.voip_token,
        data, // 데이터 전용 메시지: 앱이 꺼져 있어도 백그라운드 작업이 받아 수신 화면을 띄운다
        android: { priority: 'HIGH', ttl: `${ttlSec}s` },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 || body.includes('UNREGISTERED')) {
      await dropDevice(device.id, `fcm ${res.status} ${body}`);
    } else {
      console.error('FCM 실패', res.status, body);
    }
  }
}

// ── Expo Push (일반 알림) ───────────────────────────────────
async function sendExpo(
  devices: DeviceRow[],
  message: { title: string; body: string; data: Record<string, string>; channelId?: string },
): Promise<void> {
  const targets = devices.filter((d) => d.push_token);
  if (targets.length === 0) return;
  const accessToken = optionalEnv('EXPO_ACCESS_TOKEN');
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(targets.map((d) => ({ to: d.push_token, sound: 'default', priority: 'high', ...message }))),
  });
  if (!res.ok) {
    console.error('Expo push 실패', res.status, await res.text());
    return;
  }
  const result = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  await Promise.all(
    (result.data ?? []).map((ticket, i) =>
      ticket.details?.error === 'DeviceNotRegistered' ? dropDevice(targets[i].id, 'expo DeviceNotRegistered') : null,
    ),
  );
}

// ── 공개 API ────────────────────────────────────────────────
export type IncomingCallPush = {
  callId: string;
  callerId: string;
  callerName: string;
  media: 'audio' | 'video';
};

/** 수신자 기기 전체에 수신 전화 푸시 (네이티브 수신 화면) */
export async function pushIncomingCall(calleeId: string, call: IncomingCallPush): Promise<void> {
  const data = { type: 'incoming_call', ...call };
  const devices = await devicesOf(calleeId);
  await Promise.allSettled(
    devices.map((d) => (d.platform === 'ios' ? sendApnsVoip(d, data) : sendFcmData(d, data, 30))),
  );
}

/**
 * 울리던 전화가 끝났거나(취소·타임아웃·거절) 다른 기기에서 받았을 때 Android 수신 화면을 닫는다.
 * iOS 는 VoIP 푸시로 깨어난 앱이 Realtime 으로 상태 변화를 받아 CallKit 을 닫는다
 * (iOS 는 VoIP 푸시마다 새 전화를 보고해야 하므로 종료 신호를 VoIP 로 보낼 수 없다).
 */
export async function pushCallStateAndroid(userId: string, callId: string, status: string): Promise<void> {
  const devices = (await devicesOf(userId)).filter((d) => d.platform === 'android');
  await Promise.allSettled(devices.map((d) => sendFcmData(d, { type: 'call_state', callId, status }, 60)));
}

/** 부재중 알림 */
export async function pushMissedCall(calleeId: string, callId: string, callerId: string, callerName: string) {
  const devices = await devicesOf(calleeId);
  await sendExpo(devices, {
    title: '부재중 전화',
    body: `${callerName}님의 전화를 받지 못했어요`,
    data: { type: 'missed_call', callId, callerId },
    channelId: 'missed-calls',
  });
}
