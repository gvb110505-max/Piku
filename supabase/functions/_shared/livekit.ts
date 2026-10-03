import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'npm:livekit-server-sdk@2';

import { env, optionalEnv } from './http.ts';

/** 앱이 접속할 LiveKit 주소 (wss://...) */
export function livekitClientUrl(): string {
  return env('LIVEKIT_URL');
}

/** 서버 API 주소. 기본은 LIVEKIT_URL 의 ws→http. (로컬 Docker 처럼 서버에서 보는 주소가 다를 때 LIVEKIT_API_URL 지정) */
function livekitApiUrl(): string {
  return optionalEnv('LIVEKIT_API_URL') ?? livekitClientUrl().replace(/^ws/, 'http');
}

let rooms: RoomServiceClient | null = null;
export function roomService(): RoomServiceClient {
  rooms ??= new RoomServiceClient(livekitApiUrl(), env('LIVEKIT_API_KEY'), env('LIVEKIT_API_SECRET'));
  return rooms;
}

/** 1:1 통화용 룸. 2명 제한, 아무도 안 들어오면 45초 뒤 자동 종료(→ 웹훅으로 missed 처리) */
export async function createCallRoom(roomName: string): Promise<void> {
  await roomService().createRoom({ name: roomName, maxParticipants: 2, emptyTimeout: 45, departureTimeout: 10 });
}

/** 통화 당사자 한 명이 특정 룸에만 들어갈 수 있는 짧은 토큰 */
export async function createCallToken(params: {
  roomName: string;
  userId: string;
  name: string;
  media: 'audio' | 'video';
}): Promise<string> {
  const at = new AccessToken(env('LIVEKIT_API_KEY'), env('LIVEKIT_API_SECRET'), {
    identity: params.userId,
    name: params.name,
    ttl: '10m', // 입장할 때만 필요. 입장 후에는 LiveKit 이 연결을 유지한다.
  });
  at.addGrant({
    room: params.roomName,
    roomJoin: true,
    roomCreate: false,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources:
      params.media === 'video' ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE],
  });
  return await at.toJwt();
}

export function webhookReceiver(): WebhookReceiver {
  return new WebhookReceiver(env('LIVEKIT_API_KEY'), env('LIVEKIT_API_SECRET'));
}
