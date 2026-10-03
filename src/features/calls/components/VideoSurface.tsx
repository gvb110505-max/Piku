// 웹: livekit 트랙을 <video> 요소에 붙인다. 네이티브는 VideoSurface.native.tsx
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { createElement, useEffect, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

type Props = { track: LocalVideoTrack | RemoteVideoTrack; mirror?: boolean; style?: ViewStyle };

export function VideoSurface({ track, mirror, style }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <View style={[styles.box, style]}>
      {createElement('video', {
        ref,
        autoPlay: true,
        playsInline: true,
        muted: true, // 소리는 오디오 트랙으로 따로 재생
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mirror ? 'scaleX(-1)' : undefined,
          backgroundColor: '#000',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: 'hidden', backgroundColor: '#000' } });
