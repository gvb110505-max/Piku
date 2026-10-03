import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 라우트 이름 → 접근성 라벨/아이콘. 화면에는 글자 없이 작은 아이콘만, 전화(call)만 가운데 크게 */
const TAB_META: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  home: { label: '홈', icon: 'home-outline', iconActive: 'home' },
  search: { label: '검색', icon: 'search-outline', iconActive: 'search' },
  call: { label: '전화', icon: 'call', iconActive: 'call' },
  compose: { label: '작성', icon: 'add-outline', iconActive: 'add' },
  profile: { label: '프로필', icon: 'person-outline', iconActive: 'person' },
};

const ICON_SIZE = 22;
const CALL_BUTTON_SIZE = 64;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        if (route.name === 'call') {
          return (
            <View key={route.key} style={styles.slot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={meta.label}
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.callButton,
                  { backgroundColor: pressed ? colors.callPressed : colors.call },
                ]}
              >
                <Ionicons name="call" size={30} color={colors.onCall} />
              </Pressable>
            </View>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.slot}
            hitSlop={6}
          >
            <Ionicons
              name={focused ? meta.iconActive : meta.icon}
              size={ICON_SIZE}
              color={focused ? colors.tabActive : colors.tabInactive}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  slot: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  callButton: {
    width: CALL_BUTTON_SIZE,
    height: CALL_BUTTON_SIZE,
    borderRadius: CALL_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // 탭바 위로 떠 있도록 끌어올림
    marginTop: -CALL_BUTTON_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.background,
    ...Platform.select({
      ios: { shadowColor: colors.call, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
      default: { boxShadow: `0px 4px 14px ${colors.call}73` },
    }),
  },
});
