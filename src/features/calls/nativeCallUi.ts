// 네이티브 통화 UI(CallKit / ConnectionService) 연동 — 웹은 없음. 네이티브 구현은 nativeCallUi.native.ts

export type NativeCallHandlers = {
  /** 잠금화면/수신 화면에서 "받기" */
  onAnswer: (callId: string) => void;
  /** 네이티브 UI 에서 "거절/종료" */
  onEnd: (callId: string) => void;
  /** 네이티브 UI 에서 음소거 토글 */
  onMute: (callId: string, muted: boolean) => void;
};

export type NativeCallUi = {
  setup: (handlers: NativeCallHandlers) => () => void;
  reportOutgoing: (callId: string, peerName: string, video: boolean) => void;
  reportConnected: (callId: string) => void;
  reportAnswered: (callId: string) => void;
  reportEnded: (callId: string) => void;
};

export const nativeCallUi: NativeCallUi = {
  setup: () => () => undefined,
  reportOutgoing: () => undefined,
  reportConnected: () => undefined,
  reportAnswered: () => undefined,
  reportEnded: () => undefined,
};
