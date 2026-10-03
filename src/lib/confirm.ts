import { Alert, Platform } from 'react-native';

/** 확인 대화상자 (웹은 브라우저 confirm, 네이티브는 Alert) */
export function confirmAsync(title: string, message: string, okText = '확인'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
