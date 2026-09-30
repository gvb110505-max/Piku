import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/TabBar';

export const unstable_settings = {
  initialRouteName: 'call',
};

/** 선언 순서 = 탭바 표시 순서. 전화 탭이 정가운데(3번째). DM 탭은 두지 않는다. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="search" options={{ title: '검색' }} />
      <Tabs.Screen name="call" options={{ title: '전화' }} />
      <Tabs.Screen name="compose" options={{ title: '작성' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
