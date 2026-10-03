import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { useCall, type CallView } from '@/features/calls/CallProvider';
import { VideoSurface } from '@/features/calls/components/VideoSurface';
import { endReasonText } from '@/features/calls/messages';
import { profileName } from '@/features/calls/types';
import { colors } from '@/theme/colors';

/** 발신 · 수신 · 통화 중 · 종료 · 마이크 권한 안내를 한 화면에서 상태별로 보여준다 */
export default function InCallScreen() {
  const { view, controls, accept, decline, hangup, toggleMute, toggleSpeaker, toggleCamera, dismiss } = useCall();

  if (view.phase === 'idle') return <View style={styles.root} />;

  if (view.phase === 'mic_denied') {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Ionicons name="mic-off" size={56} color={colors.onCall} />
        <Text style={styles.title}>마이크 권한이 필요합니다</Text>
        <Text style={styles.body}>
          {Platform.OS === 'web'
            ? '브라우저 주소창 왼쪽의 사이트 설정에서 마이크를 허용한 뒤 다시 걸어 주세요.'
            : '전화를 하려면 설정에서 이 앱의 마이크 접근을 허용해 주세요.'}
        </Text>
        {Platform.OS !== 'web' ? (
          <Pressable style={[styles.pill, { backgroundColor: colors.call }]} onPress={() => Linking.openSettings()}>
            <Text style={styles.pillText}>설정 열기</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.pill} onPress={dismiss} accessibilityRole="button">
          <Text style={styles.pillText}>닫기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const peerName = profileName(view.peer);
  const remoteVideo = view.phase === 'active' ? controls.remoteVideo : null;
  const isVideo = view.media === 'video';

  return (
    <View style={styles.root}>
      {remoteVideo ? <VideoSurface track={remoteVideo} style={StyleSheet.absoluteFill} /> : null}
      <SafeAreaView style={styles.flex}>
        {controls.localVideo && controls.cameraOn && view.phase !== 'ended' ? (
          <VideoSurface track={controls.localVideo} mirror style={styles.pip} />
        ) : null}

        <View style={styles.header}>
          {!remoteVideo ? <Avatar name={peerName} url={view.peer.avatar_url} size={112} /> : null}
          <Text style={styles.name}>{peerName}</Text>
          <StatusLine view={view} />
          {controls.reconnecting ? <Text style={styles.warn}>연결이 불안정합니다. 다시 연결하는 중…</Text> : null}
          {isVideo && controls.cameraUnavailable && view.phase !== 'ended' ? (
            <Text style={styles.warn}>카메라를 사용할 수 없어 음성으로 연결합니다</Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          {view.phase === 'incoming' ? (
            <View style={styles.row}>
              <RoundButton icon="close" label="거절" color={colors.danger} onPress={decline} />
              <RoundButton icon={isVideo ? 'videocam' : 'call'} label="받기" color={colors.call} onPress={accept} />
            </View>
          ) : view.phase === 'ended' ? (
            <Pressable onPress={dismiss} style={styles.pill} accessibilityRole="button">
              <Text style={styles.pillText}>닫기</Text>
            </Pressable>
          ) : (
            <>
              {view.phase === 'active' ? (
                <View style={styles.row}>
                  <ToggleButton
                    icon={controls.muted ? 'mic-off' : 'mic'}
                    label={controls.muted ? '음소거 해제' : '음소거'}
                    active={controls.muted}
                    onPress={toggleMute}
                  />
                  {controls.speakerSupported ? (
                    <ToggleButton
                      icon="volume-high"
                      label="스피커"
                      active={controls.speaker}
                      onPress={toggleSpeaker}
                    />
                  ) : null}
                  {isVideo && controls.localVideo ? (
                    <ToggleButton
                      icon={controls.cameraOn ? 'videocam' : 'videocam-off'}
                      label={controls.cameraOn ? '카메라 끄기' : '카메라 켜기'}
                      active={!controls.cameraOn}
                      onPress={toggleCamera}
                    />
                  ) : null}
                </View>
              ) : null}
              <RoundButton icon="call" rotate label="종료" color={colors.danger} onPress={hangup} />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function StatusLine({ view }: { view: Exclude<CallView, { phase: 'idle' | 'mic_denied' }> }) {
  switch (view.phase) {
    case 'outgoing':
      return <Text style={styles.status}>{view.call ? '전화 거는 중…' : '연결 준비 중…'}</Text>;
    case 'incoming':
      return <Text style={styles.status}>{view.media === 'video' ? '영상 통화' : '음성 통화'} 수신 중</Text>;
    case 'connecting':
      return <Text style={styles.status}>연결 중…</Text>;
    case 'active':
      return <Elapsed since={view.since} />;
    case 'ended':
      return <Text style={styles.status}>{endReasonText(view.reason)}</Text>;
  }
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return (
    <Text style={styles.status} accessibilityLabel={`통화 시간 ${mm}분 ${ss}초`}>
      {mm}:{ss}
    </Text>
  );
}

type IconName = ComponentProps<typeof Ionicons>['name'];

function RoundButton(props: { icon: IconName; label: string; color: string; onPress: () => void; rotate?: boolean }) {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} style={styles.btnWrap}>
      <View style={[styles.round, { backgroundColor: props.color }]}>
        <Ionicons
          name={props.icon}
          size={34}
          color={colors.onCall}
          style={props.rotate ? { transform: [{ rotate: '135deg' }] } : undefined}
        />
      </View>
      <Text style={styles.btnLabel}>{props.label}</Text>
    </Pressable>
  );
}

function ToggleButton(props: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: props.active }}
      accessibilityLabel={props.label}
      style={styles.btnWrap}
    >
      <View style={[styles.toggle, props.active && styles.toggleActive]}>
        <Ionicons name={props.icon} size={28} color={props.active ? CALL_BG : colors.onCall} />
      </View>
      <Text style={styles.btnLabel}>{props.label}</Text>
    </Pressable>
  );
}

const CALL_BG = '#0B0B0F';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CALL_BG },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  header: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  name: { color: colors.onCall, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  status: { color: '#D4D4D8', fontSize: 17 },
  warn: { color: '#FACC15', fontSize: 14, textAlign: 'center' },
  title: { color: colors.onCall, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: '#D4D4D8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  footer: { alignItems: 'center', gap: 28, paddingBottom: 40 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 36 },
  btnWrap: { alignItems: 'center', gap: 8, minWidth: 80 },
  round: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  toggle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  toggleActive: { backgroundColor: colors.onCall },
  btnLabel: { color: colors.onCall, fontSize: 13 },
  pill: {
    minWidth: 160,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pillText: { color: colors.onCall, fontSize: 16, fontWeight: '700' },
  pip: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 14,
    zIndex: 2,
  },
});
