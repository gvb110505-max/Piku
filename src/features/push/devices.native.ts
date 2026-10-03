import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

/**
 * 이 기기의 푸시 토큰을 서버(device_tokens)에 등록한다.
 *  - push_token : Expo 푸시 토큰 → 부재중 알림 등 일반 알림
 *  - voip_token : 수신 전화용. iOS = PushKit VoIP 토큰, Android = FCM 토큰(데이터 메시지)
 */
let registered: { push: string | null; voip: string | null } = { push: null, voip: null };

export async function registerThisDevice(): Promise<void> {
  if (!Device.isDevice) return; // 시뮬레이터는 푸시를 받을 수 없다

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('missed-calls', {
      name: '부재중 전화',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const [push, voip] = await Promise.all([expoPushToken(), Platform.OS === 'ios' ? iosVoipToken() : androidFcmToken()]);
  if (!push && !voip) return;
  if (push === registered.push && voip === registered.voip) return;

  const { error } = await getSupabase().rpc('register_device', {
    p_platform: Platform.OS,
    p_push_token: push,
    p_voip_token: voip,
  });
  if (error) {
    console.warn('기기 등록 실패', error.message);
    return;
  }
  registered = { push, voip };
}

/** 로그아웃 전에 호출: 이 기기로 더 이상 전화·알림이 오지 않게 한다 */
export async function unregisterThisDevice(): Promise<void> {
  const { push, voip } = registered;
  registered = { push: null, voip: null };
  const supabase = getSupabase();
  if (push) await supabase.from('device_tokens').delete().eq('push_token', push);
  if (voip) await supabase.from('device_tokens').delete().eq('voip_token', voip);
}

async function expoPushToken(): Promise<string | null> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null; // 알림을 거부해도 수신 전화(VoIP/FCM 데이터)는 동작한다
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn('EAS projectId 가 없어 Expo 푸시 토큰을 받을 수 없습니다 (npx eas-cli init)');
      return null;
    }
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('Expo 푸시 토큰 실패', e);
    return null;
  }
}

async function androidFcmToken(): Promise<string | null> {
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === 'string' ? token.data : null;
  } catch (e) {
    console.warn('FCM 토큰 실패 (google-services.json 확인)', e);
    return null;
  }
}

/** iOS VoIP 토큰: 네이티브(CallSNSVoip)가 앱 시작 시 PushKit 을 등록하고, 토큰은 이벤트로 전달된다 */
let voipToken: Promise<string | null> | null = null;
function iosVoipToken(): Promise<string | null> {
  voipToken ??= new Promise((resolve) => {
    // iOS 전용 모듈이라 iOS 에서만 불러온다
    const VoipPushNotification = (
      require('react-native-voip-push-notification') as typeof import('react-native-voip-push-notification')
    ).default;
    const timer = setTimeout(() => resolve(null), 10_000);
    const done = (token: string | null) => {
      clearTimeout(timer);
      resolve(token);
    };
    // 첫 리스너가 붙는 순간 JS 로딩 전에 쌓인 이벤트(이미 발급된 토큰)가 didLoadWithEvents 로 한 번 온다.
    // 그래서 didLoadWithEvents 를 반드시 먼저 등록한다.
    VoipPushNotification.addEventListener('didLoadWithEvents', (events) => {
      const ev = events?.find((e) => e.name === VoipPushNotification.RNVoipPushRemoteNotificationsRegisteredEvent);
      if (ev) done(ev.data as string);
    });
    VoipPushNotification.addEventListener('register', (token) => done(token));
  });
  return voipToken;
}
