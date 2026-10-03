import RNCallKeep from 'react-native-callkeep';
import { Platform } from 'react-native';

import { ensureCallKeep } from './callkeep.native';
import type { NativeCallUi } from './nativeCallUi';

export type { NativeCallHandlers } from './nativeCallUi';

/**
 * CallKit / ConnectionService 연동.
 * 앱 화면(CallProvider)이 통화 상태의 기준이고, 네이티브 UI 는 잠금화면·백그라운드 수신과
 * 시스템 오디오 세션을 위해 같은 상태를 따라간다. 콜 UUID = calls.id
 */
export const nativeCallUi: NativeCallUi = {
  setup(handlers) {
    void ensureCallKeep();
    const subs = [
      // JS 가 뜨기 전(앱이 꺼진 상태에서 잠금화면으로 받기 등)에 일어난 이벤트 재생.
      // 첫 리스너가 붙을 때 한 번 오므로 반드시 가장 먼저 등록한다.
      RNCallKeep.addEventListener('didLoadWithEvents', (events) => {
        for (const ev of events ?? []) {
          const id = (ev.data as { callUUID?: string } | undefined)?.callUUID?.toLowerCase();
          if (!id) continue;
          if (ev.name === 'RNCallKeepPerformAnswerCallAction') handlers.onAnswer(id);
          if (ev.name === 'RNCallKeepPerformEndCallAction') handlers.onEnd(id);
        }
      }),
      RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
        if (Platform.OS === 'android') RNCallKeep.backToForeground();
        handlers.onAnswer(callUUID.toLowerCase());
      }),
      RNCallKeep.addEventListener('endCall', ({ callUUID }) => handlers.onEnd(callUUID.toLowerCase())),
      RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ callUUID, muted }) =>
        handlers.onMute(callUUID.toLowerCase(), muted),
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  },
  reportOutgoing(callId, peerName, video) {
    // iOS 는 CallKit 에 발신을 알려야 통화 오디오 세션·시스템 통화 표시가 정상 동작한다
    RNCallKeep.startCall(callId, peerName, peerName, 'generic', video);
  },
  reportConnected(callId) {
    if (Platform.OS === 'ios') RNCallKeep.reportConnectedOutgoingCallWithUUID(callId);
    else RNCallKeep.setCurrentCallActive(callId);
  },
  reportAnswered(callId) {
    RNCallKeep.answerIncomingCall(callId);
  },
  reportEnded(callId) {
    RNCallKeep.endCall(callId);
  },
};
