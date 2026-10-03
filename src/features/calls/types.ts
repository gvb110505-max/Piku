export type CallMedia = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | 'failed';
export type CallAction = 'accept' | 'decline' | 'hangup' | 'timeout' | 'fail';

export type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  media: CallMedia;
  status: CallStatus;
  room_name: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/** 응답 없음 타임아웃 (Q5: 30초). DB 함수 public.call_ring_timeout() 과 같은 값 */
export const CALL_RING_TIMEOUT_SEC = 30;

export function profileName(p: Pick<PublicProfile, 'username' | 'display_name'> | null | undefined): string {
  if (!p) return '알 수 없음';
  return p.display_name || (p.username ? `@${p.username}` : '알 수 없음');
}
