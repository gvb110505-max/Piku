import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  DisconnectReason,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from 'livekit-client';

import { attachRemoteAudio, detachRemoteAudio } from './platformMedia';
import type { CallMedia } from './types';

export type LocalMedia = {
  audio: LocalAudioTrack;
  video: LocalVideoTrack | null;
  /** 영상 통화인데 카메라를 쓸 수 없음 (권한 거부·장치 없음) → 음성으로 진행 */
  cameraUnavailable: boolean;
};

/** 마이크(필수)·카메라(영상 통화일 때) 준비. 권한 거부 시 MediaPermissionError */
export class MediaPermissionError extends Error {
  constructor(public kind: 'mic_denied' | 'no_device') {
    super(kind);
  }
}

function isPermissionError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = String((e as { message?: string } | null)?.message ?? '');
  return /NotAllowed|Permission|Security/i.test(name) || /permission|denied/i.test(message);
}

export async function prepareLocalMedia(media: CallMedia): Promise<LocalMedia> {
  let audio: LocalAudioTrack;
  try {
    audio = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  } catch (e) {
    throw new MediaPermissionError(isPermissionError(e) ? 'mic_denied' : 'no_device');
  }
  if (media !== 'video') return { audio, video: null, cameraUnavailable: false };
  try {
    const video = await createLocalVideoTrack({ facingMode: 'user', resolution: VideoPresets.h540.resolution });
    return { audio, video, cameraUnavailable: false };
  } catch {
    return { audio, video: null, cameraUnavailable: true };
  }
}

export function releaseLocalMedia(media: LocalMedia | null): void {
  media?.audio.stop();
  media?.video?.stop();
}

export type CallRoomHandlers = {
  onRemoteJoined: () => void;
  onRemoteLeft: () => void;
  onRemoteVideo: (track: RemoteVideoTrack | null) => void;
  onReconnecting: (reconnecting: boolean) => void;
  /** 사용자가 끊지 않았는데 연결이 끊김 (재접속 실패 포함) */
  onLost: () => void;
};

/** 1:1 통화용 LiveKit 룸 */
export class CallRoom {
  private room = new Room({ adaptiveStream: true, dynacast: true });
  private leaving = false;

  constructor(
    private local: LocalMedia,
    private handlers: CallRoomHandlers,
  ) {
    const r = this.room;
    r.on(RoomEvent.ParticipantConnected, () => handlers.onRemoteJoined());
    r.on(RoomEvent.ParticipantDisconnected, () => {
      handlers.onRemoteVideo(null);
      handlers.onRemoteLeft();
    });
    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) attachRemoteAudio(track as RemoteAudioTrack);
      if (track.kind === Track.Kind.Video && !track.isMuted) handlers.onRemoteVideo(track as RemoteVideoTrack);
    });
    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) detachRemoteAudio(track as RemoteAudioTrack);
      if (track.kind === Track.Kind.Video) handlers.onRemoteVideo(null);
    });
    // 상대가 카메라를 끄고 켤 때
    r.on(RoomEvent.TrackMuted, (pub) => {
      if (pub.kind === Track.Kind.Video && pub !== this.localVideoPublication()) handlers.onRemoteVideo(null);
    });
    r.on(RoomEvent.TrackUnmuted, (pub) => {
      const track = (pub as RemoteTrackPublication).track;
      if (pub.kind === Track.Kind.Video && track && pub !== this.localVideoPublication()) {
        handlers.onRemoteVideo(track as RemoteVideoTrack);
      }
    });
    r.on(RoomEvent.Reconnecting, () => handlers.onReconnecting(true));
    r.on(RoomEvent.Reconnected, () => handlers.onReconnecting(false));
    r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (this.leaving || reason === DisconnectReason.CLIENT_INITIATED) return;
      handlers.onLost();
    });
  }

  private localVideoPublication() {
    return this.local.video ? this.room.localParticipant.getTrackPublication(Track.Source.Camera) : undefined;
  }

  async connect(url: string, token: string): Promise<void> {
    await this.room.connect(url, token);
    await this.room.localParticipant.publishTrack(this.local.audio);
    if (this.local.video) await this.room.localParticipant.publishTrack(this.local.video);
    // 웹 자동재생 정책: 사용자 조작(발신/수락 탭) 직후이므로 허용됨
    await this.room.startAudio().catch(() => undefined);
    if (this.room.remoteParticipants.size > 0) this.handlers.onRemoteJoined();
  }

  get hasRemote(): boolean {
    return this.room.remoteParticipants.size > 0;
  }

  async setMicEnabled(on: boolean): Promise<void> {
    if (on) await this.local.audio.unmute();
    else await this.local.audio.mute();
  }

  async setCameraEnabled(on: boolean): Promise<void> {
    if (!this.local.video) return;
    if (on) await this.local.video.unmute();
    else await this.local.video.mute();
  }

  async leave(): Promise<void> {
    this.leaving = true;
    await this.room.disconnect().catch(() => undefined);
    releaseLocalMedia(this.local);
  }
}
