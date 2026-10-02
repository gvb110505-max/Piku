import { isAuthApiError, isAuthError } from '@supabase/supabase-js';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 이메일 인증(OTP) 관련 에러를 사용자에게 보여줄 한국어 메시지로 변환 */
export function authErrorMessage(error: unknown): string {
  if (isAuthApiError(error) || isAuthError(error)) {
    switch (error.code) {
      case 'email_address_invalid':
      case 'validation_failed':
        return '이메일 형식이 올바르지 않습니다.';
      case 'otp_expired':
        return '인증 코드가 만료되었거나 올바르지 않습니다. 코드를 다시 확인하거나 새 코드를 받아 주세요.';
      case 'over_email_send_rate_limit':
        return '인증 메일 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
      case 'over_request_rate_limit':
        return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
      case 'signup_disabled':
      case 'email_provider_disabled':
        return '현재 이메일 가입이 비활성화되어 있습니다.';
      case 'email_address_not_authorized':
        return '이 이메일 주소로는 메일을 보낼 수 없습니다.';
    }
    if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
      return '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.';
    }
  }
  return '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

/** profiles 업데이트(Postgrest) 에러 → 메시지 */
export function profileErrorMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case '23505':
      return '이미 사용 중인 사용자 이름입니다.';
    case '23514':
      return '사용자 이름은 영문 소문자, 숫자, 밑줄(_)로 3~20자여야 합니다.';
    default:
      return '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
