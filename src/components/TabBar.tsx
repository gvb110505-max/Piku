import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 라우트 이름 → 라벨/아이콘. 전화(call)는 가운데 강조 버튼으로 따로 그린다. */
const TAB_META: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  home: { label: '홈', icon: 'home-outline', iconActive: 'home' },
  search: { label: '검색', icon: 'search-outline', iconActive: 'search' },
  call: { label: '전화', icon: 'call', iconActive: 'call' },
  compose: { label: '작성', icon: 'add-circle-outline', iconActive: 'add-circle' },
  profile: { label: '프로필', icon: 'person-outline', iconActive: 'person' },
};

const CALL_BUTTON_SIZE = 68;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
            <View key={route.key} style={styles.callSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="전화"
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.callButton,
                  { backgroundColor: pressed ? colors.callPressed : colors.call },
                ]}
              >
                <Ionicons name="call" size={32} color={colors.onCall} />
              </Pressable>
              <Text style={[styles.label, styles.callLabel]}>{meta.label}</Text>
            </View>
          );
        }

        const tint = focused ? colors.tabActive : colors.tabInactive;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.tab}
          >
            <Ionicons name={focused ? meta.iconActive : meta.icon} size={24} color={tint} />
            <Text style={[styles.label, { color: tint }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '500' },
  callSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  callButton: {
    width: CALL_BUTTON_SIZE,
    height: CALL_BUTTON_SIZE,
    borderRadius: CALL_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // 탭바 위로 떠 있도록 위로 끌어올림
    marginTop: -CALL_BUTTON_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.background,
    ...Platform.select({
      ios: { shadowColor: colors.call, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
      default: { boxShadow: `0px 4px 14px ${colors.call}73` },
    }),
  },
  callLabel: { color: colors.call, fontWeight: '700', marginTop: 2, paddingBottom: 4 },
});
