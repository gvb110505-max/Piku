// Android: 앱이 꺼져 있거나 백그라운드일 때 FCM 데이터 메시지를 받아 시스템 수신 화면을 띄운다.
// (iOS 는 VoIP 푸시를 네이티브 코드(CallSNSVoip.m)가 직접 CallKit 에 보고한다)
// 이 모듈은 앱 시작 시 가장 먼저 import 되어야 한다 (TaskManager.defineTask 는 최상위에서).
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { dismissIncomingCall, displayIncomingCall } from '@/features/calls/callkeep.native';

const TASK = 'callsns-background-push';

type CallPush =
  | { type: 'incoming_call'; callId: string; callerName: string; media: string }
  | { type: 'call_state'; callId: string; status: string };

function readData(payload: unknown): CallPush | null {
  // expo-notifications 백그라운드 작업 payload 는 { data: { ... } } 또는 { data: { body: JSON } } 형태
  const p = payload as { data?: Record<string, unknown> } | null;
  let data = p?.data as Record<string, unknown> | undefined;
  if (data && typeof data.body === 'string') {
    try {
      data = { ...data, ...JSON.parse(data.body) };
    } catch {
      /* ignore */
    }
  }
  if (!data || typeof data.type !== 'string' || typeof data.callId !== 'string') return null;
  return data as unknown as CallPush;
}

if (Platform.OS === 'android') {
  TaskManager.defineTask(TASK, async ({ data, error }) => {
    if (error) return;
    const push = readData(data);
    if (!push) return;
    // 앱이 화면에 떠 있으면 Realtime 으로 앱 수신 화면이 뜬다
    if (AppState.currentState === 'active') return;
    if (push.type === 'incoming_call') {
      await displayIncomingCall(push.callId, push.callerName, push.media === 'video');
    } else if (push.type === 'call_state' && push.status !== 'ringing') {
      dismissIncomingCall(push.callId);
    }
  });
  Notifications.registerTaskAsync(TASK).catch((e) => console.warn('백그라운드 푸시 작업 등록 실패', e));
}
