// 웹 구현. 네이티브는 platformMedia.native.ts
import type { RemoteAudioTrack } from 'livekit-client';

/** 웹 브라우저는 스피커/수화기 전환 개념이 없다 */
export const speakerSupported = false;

export async function beginAudioSession(): Promise<void> {}
export async function endAudioSession(): Promise<void> {}
export async function setSpeakerOn(_on: boolean): Promise<void> {}

/** 웹: 원격 오디오는 <audio> 요소에 붙여야 재생된다 */
export function attachRemoteAudio(track: RemoteAudioTrack): void {
  const el = track.attach();
  el.dataset.callAudio = 'true';
  document.body.appendChild(el);
}
export function detachRemoteAudio(track: RemoteAudioTrack): void {
  track.detach().forEach((el) => el.remove());
}
