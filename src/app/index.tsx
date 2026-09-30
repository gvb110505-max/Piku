import { Redirect } from 'expo-router';

/** 앱 실행 시 첫 화면은 전화 탭 (Q1 기본값) */
export default function Index() {
  return <Redirect href="/call" />;
}
