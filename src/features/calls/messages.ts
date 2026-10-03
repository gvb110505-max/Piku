/** 통화가 끝난 이유 → 화면 문구 */
export type EndReason =
  | 'ended'
  | 'declined'
  | 'no_answer'
  | 'missed'
  | 'callee_busy'
  | 'caller_busy'
  | 'not_mutual'
  | 'unavailable'
  | 'failed'
  | 'network'
  | 'no_device';

export function endReasonText(reason: EndReason): string {
  switch (reason) {
    case 'ended':
      return '통화가 종료되었습니다';
    case 'declined':
      return '상대방이 전화를 받을 수 없습니다';
    case 'no_answer':
      return '응답이 없습니다';
    case 'missed':
      return '부재중 전화';
    case 'callee_busy':
      return '상대방이 통화 중입니다';
    case 'caller_busy':
      return '이미 다른 통화가 진행 중입니다';
    case 'not_mutual':
      return '서로 팔로우한 사람에게만 전화할 수 있어요';
    case 'unavailable':
      // 차단 등으로 서버가 거부한 경우. 차단당한 쪽 표시 방식(Q13)은 4단계에서 확정.
      return '연결할 수 없습니다';
    case 'network':
      return '네트워크에 연결할 수 없습니다';
    case 'no_device':
      return '마이크를 찾을 수 없습니다';
    case 'failed':
    default:
      return '통화가 끊어졌습니다';
  }
}

/** call-start / call-action 오류 코드 → 종료 이유 */
export function errorToReason(code: string): EndReason {
  switch (code) {
    case 'callee_busy':
    case 'caller_busy':
    case 'not_mutual':
    case 'unavailable':
    case 'network':
      return code;
    default:
      return 'failed';
  }
}
