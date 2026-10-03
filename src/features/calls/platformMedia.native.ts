import { AndroidAudioTypePresets, AudioSession, registerGlobals } from '@livekit/react-native';
import type { RemoteAudioTrack } from 'livekit-client';
import { Platform } from 'react-native';

// livekit-client 가 사용하는 WebRTC 전역 객체를 네이티브 구현으로 등록 (앱 시작 시 1회)
registerGlobals();

export const speakerSupported = true;

export async function beginAudioSession(): Promise<void> {
  await AudioSession.configureAudio({
    android: {
      preferredOutputList: ['earpiece', 'headset', 'bluetooth', 'speaker'],
      audioTypeOptions: AndroidAudioTypePresets.communication,
    },
    ios: { defaultOutput: 'earpiece' },
  });
  await AudioSession.startAudioSession();
}

export async function endAudioSession(): Promise<void> {
  await AudioSession.stopAudioSession();
}

export async function setSpeakerOn(on: boolean): Promise<void> {
  if (Platform.OS === 'ios') {
    await AudioSession.selectAudioOutput(on ? 'force_speaker' : 'default');
  } else {
    await AudioSession.selectAudioOutput(on ? 'speaker' : 'earpiece');
  }
}

/** 네이티브는 구독한 원격 오디오가 자동 재생된다 */
export function attachRemoteAudio(_track: RemoteAudioTrack): void {}
export function detachRemoteAudio(_track: RemoteAudioTrack): void {}
