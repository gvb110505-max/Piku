import { VideoView } from '@livekit/react-native';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import type { ViewStyle } from 'react-native';

type Props = { track: LocalVideoTrack | RemoteVideoTrack; mirror?: boolean; style?: ViewStyle };

export function VideoSurface({ track, mirror, style }: Props) {
  return <VideoView videoTrack={track} mirror={mirror} objectFit="cover" style={style} />;
}
