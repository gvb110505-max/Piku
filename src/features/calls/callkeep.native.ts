import RNCallKeep from 'react-native-callkeep';
import { Platform } from 'react-native';

/** CallKit(iOS) / ConnectionService(Android) 설정. 앱 프로세스마다 1회 (백그라운드 작업 포함) */
let ready: Promise<boolean> | null = null;

export function ensureCallKeep(): Promise<boolean> {
  ready ??= RNCallKeep.setup({
    ios: {
      appName: 'CallSNS',
      supportsVideo: true,
      maximumCallGroups: '1',
      maximumCallsPerCallGroup: '1',
      includesCallsInRecents: false,
    },
    android: {
      alertTitle: '전화 수신 권한',
      alertDescription: '앱이 꺼져 있을 때도 전화를 받으려면 이 앱의 통화 계정을 허용해 주세요.',
      cancelButton: '나중에',
      okButton: '허용',
      additionalPermissions: [],
      foregroundService: {
        channelId: 'callsns-ongoing-call',
        channelName: '통화 중',
        notificationTitle: 'CallSNS 통화 중',
      },
    },
  })
    .then((ok) => {
      if (Platform.OS === 'android') RNCallKeep.setAvailable(true);
      return ok;
    })
    .catch((e) => {
      console.warn('CallKeep 설정 실패', e);
      return false;
    });
  return ready;
}

/** Android: 백그라운드에서 받은 데이터 푸시로 시스템 수신 화면 표시 */
export async function displayIncomingCall(callId: string, callerName: string, video: boolean): Promise<void> {
  await ensureCallKeep();
  RNCallKeep.displayIncomingCall(callId, callerName, callerName, 'generic', video);
}

/** 상대가 취소했거나 다른 기기에서 받음 → 시스템 수신 화면 닫기 */
export function dismissIncomingCall(callId: string): void {
  // 6 = 원격에서 끝남 / 부재중 (react-native-callkeep CONSTANTS.END_CALL_REASONS.MISSED)
  RNCallKeep.reportEndCallWithUUID(callId, 6);
}
