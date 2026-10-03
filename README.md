# CallSNS (가칭) — 상품 소싱이 편한 SNS

전화가 중심인 SNS. 프로필 상단에 상품(사진 + 링크)을 올려 두고, 맞팔로우한 사람과는 바로 전화로 이야기한다.
좋아요 대신 댓글, 텍스트 DM 대신 전화.

앱 이름 · 소개 문구 · 로고는 `src/theme/brand.ts` 한 곳에서 바꾼다 (로고 이미지는 `assets/logo.png` 로 넣고 `LOGO` 연결).

- 앱: React Native + Expo SDK 57 (TypeScript, Expo Router, Development Build)
- 백엔드: Supabase (Auth · Postgres + RLS · Realtime · Edge Functions)
- 통화: LiveKit (WebRTC) · iOS CallKit + PushKit · Android ConnectionService + FCM
- 웹 미리보기: 같은 코드를 `expo export --platform web` 으로 빌드해 Vercel 에 배포
  - 웹에서도 통화는 되지만 **앱(탭)을 열어 둔 상태에서만** 수신된다. 잠금화면/백그라운드 수신은 네이티브 전용.

## 폴더 구조

```
src/app/                 # Expo Router 라우트 (파일 = 화면)
  _layout.tsx            # 로그인 상태별 화면 보호 + CallProvider(전역 통화 상태)
  (auth)/                # 이메일 입력 → OTP 코드 입력
  onboarding.tsx         # 가입 직후 username 설정
  (tabs)/                # 홈 · 검색 · 전화(가운데) · 작성 · 프로필
  in-call.tsx            # 발신 / 수신 / 통화 중 / 종료 / 마이크 권한 안내
  user/[id].tsx          # 다른 사람 프로필 (상품 · 팔로우 · 맞팔이면 전화)
  product/new.tsx        # 상품 추가 (사진 + 링크)
  settings.tsx           # 설정 (로그아웃 · 이후 차단 목록 · 메시지)
src/features/calls/      # 통화: API, CallProvider(상태 머신), LiveKit 룸, CallKit/ConnectionService 연동
src/features/push/       # 기기 토큰 등록, Android 백그라운드 수신 작업
src/features/social/     # 검색 · 팔로우
src/features/products/   # 상품 API · 프로필 상품 줄
src/features/profile/    # 프로필 상단(사진 · 숫자)
src/components/AppHeader.tsx  # 로고 + 앱 이름 + 소개 문구 상단 바
plugins/withVoipPush.js  # iOS PushKit → CallKit 네이티브 코드 주입 (config plugin)
supabase/migrations/     # DB 스키마 · RLS · 서버 함수
supabase/functions/      # Edge Functions: call-start, call-action, livekit-webhook, call-sweep
supabase/tests/          # DB 테스트 (scripts/test-db.sh)
scripts/                 # 테스트 스크립트
```

## 서버 규칙 (클라이언트에서 숨기기만 하지 않고 DB/서버에서 강제)

| 규칙 | 강제 위치 |
|---|---|
| 프로필은 서버 트리거만 생성, 다른 사람 email 비공개 | `profiles` 컬럼 권한 + RLS |
| 팔로우는 본인 명의로만, 차단 관계면 거부 | `follows` RLS (`is_blocked`) |
| 연락처 = 맞팔로우 (Q4) | `list_contacts()` |
| 전화는 맞팔로우끼리만 (Q5), 차단 관계면 거부, 통화 중이면 거부 | `call_start()` (service_role 전용) |
| 통화 상태 변경(수락은 수신자만, 30초 전 타임아웃 불가 등) | `call_update()` (service_role 전용) |
| 통화 기록은 당사자만 조회, 클라이언트는 쓰기 불가 | `calls` RLS + 권한 |
| 상품은 본인만 등록·삭제, http(s) 링크만, 본인 폴더 이미지만 연결 | `products` 제약 + RLS |
| 상품 이미지는 본인 폴더(`<user_id>/`)에만 업로드·삭제, 5MB · 이미지 형식만 | Storage `product-images` 정책 |

차단 방향(Q12)은 `public.block_hides()` 한 곳에서만 결정한다 (4단계에서 확정).

## 1. Supabase 설정

1. supabase.com 프로젝트 생성 → Project Settings → API 의 URL / anon key 를 `.env` 에 (`cp .env.example .env`)
2. DB 마이그레이션: `npx supabase link --project-ref <ref>` → `npx supabase db push`
   (또는 SQL Editor 에 `supabase/migrations/*.sql` 을 번호 순서대로 실행)
3. **이메일 OTP 템플릿**: Authentication → Emails → Templates 의 **Magic Link** 와 **Confirm signup** 본문을
   `supabase/templates/otp.html` 내용(`{{ .Token }}` 포함)으로 바꾼다. 안 바꾸면 코드 대신 링크가 발송된다.
4. 메일 발송 한도: 기본 메일 서버는 시간당 발송이 매우 적다 → Authentication → SMTP Settings 에 자체 SMTP 연결
5. Edge Functions 배포:
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # 값 채우기 (커밋 금지)
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy
   ```
6. **응답 없음 정리 작업**(발신 앱이 꺼진 경우 대비) — SQL Editor 에서 1분마다 실행 등록:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('call-sweep', '* * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/call-sweep',
       headers := jsonb_build_object('x-cron-secret', '<CALL_SWEEP_SECRET 값>', 'content-type', 'application/json'),
       body := '{}'::jsonb)
   $$);
   ```

## 2. LiveKit 설정

1. LiveKit Cloud(cloud.livekit.io) 프로젝트 생성 → Settings → Keys 에서 URL(`wss://...`), API Key, Secret 을
   `supabase/functions/.env` 의 `LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET` 에 넣는다.
2. Settings → Webhooks 에 `https://<project-ref>.supabase.co/functions/v1/livekit-webhook` 등록
   (통화 중 네트워크 끊김 · 발신자 앱 종료를 서버가 감지하는 데 필요)

## 3. 네이티브 수신 전화 설정 (실기기용)

| 항목 | 방법 |
|---|---|
| EAS 프로젝트 | `npx eas-cli@latest init` → 생성된 projectId 를 `.env` 의 `EAS_PROJECT_ID` 로 (부재중 알림용 Expo 푸시) |
| iOS VoIP 푸시 | Apple Developer → Keys → APNs 키(.p8) 생성 → `APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID` 를 함수 시크릿에. Dev Build 는 `APNS_ENV=sandbox` |
| iOS 기능 | App ID 에 Push Notifications 활성화 (EAS 빌드 시 자동 설정됨) |
| Android FCM | Firebase 프로젝트에 Android 앱(`com.callsns.app`) 추가 → `google-services.json` 을 프로젝트 루트에 (커밋 금지). 서비스 계정 키 JSON 을 한 줄로 `FCM_SERVICE_ACCOUNT` 시크릿에 |

앱은 로그인하면 자동으로 이 기기의 토큰(Expo 푸시 / VoIP·FCM)을 `device_tokens` 에 등록하고, 로그아웃 시 삭제한다.

## 실행

| 목적 | 명령 |
|---|---|
| 웹 미리보기 | `npm run web` |
| iOS Dev Build (Mac + Xcode) | `npm run ios -- --device` |
| Android Dev Build | `npm run android -- --device` |
| 클라우드 Dev Build (EAS) | `npx eas-cli@latest build --profile development --platform ios\|android` |
| Dev Build 설치 후 개발 서버 | `npm start` |
| 타입 검사 | `npm run typecheck` |
| 웹 정적 빌드 | `npm run build:web` → `dist/` |

통화/VoIP 네이티브 모듈을 쓰므로 **Expo Go 는 사용할 수 없다.** 시뮬레이터에서는 VoIP 푸시·CallKit 수신을 테스트할 수 없다.

## 실기기 2대로 통화 테스트

준비: 위 1~3 설정, 두 기기에 Dev Build 설치, 두 계정(A, B) 가입 후 **서로 팔로우**(검색 탭).

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 둘 다 앱을 연 상태에서 A 가 전화 탭의 B 를 한 번 탭 | A: "전화 거는 중", B: 앱 수신 화면 (iOS 는 CallKit 배너도) |
| 2 | B 가 받기 | 양쪽 통화 시간 표시, 서로 음성 들림 |
| 3 | 통화 중 음소거 · 스피커 · 종료 | 상대에게 소리 안 감 / 스피커 전환 / 양쪽 "통화가 종료되었습니다" |
| 4 | A 가 B 의 영상 버튼(📹) | 양쪽 카메라 영상, 카메라 끄기 동작 |
| 5 | **B 앱을 완전히 종료**(스와이프로 닫기) 후 A 가 전화 | B 잠금화면/홈에 시스템 수신 화면 (iOS CallKit / Android 수신 화면) → 받으면 앱이 열리며 통화 연결 |
| 6 | B 화면을 잠근 상태에서 전화 | 5 와 동일 |
| 7 | B 가 받지 않음 | 30초 후 A "응답이 없습니다", B 에 "부재중 전화" 알림, 양쪽 최근 통화에 기록 |
| 8 | B 가 거절 | A "상대방이 전화를 받을 수 없습니다" |
| 9 | 통화 중 B 비행기 모드 | A 에 "통화가 끊어졌습니다" (LiveKit 웹훅 → 서버 failed) |
| 10 | B 가 다른 사람과 통화 중일 때 A 가 전화 | A "상대방이 통화 중입니다" |
| 11 | 설정에서 마이크 권한을 끄고 전화 | "마이크 권한이 필요합니다" 안내 + 설정 열기, 상대는 울리지 않음 |
| 12 | 서로 팔로우가 아닌 사람에게 (서버 직접 호출 포함) | 거부 ("서로 팔로우한 사람에게만…") |

문제 확인: Supabase 대시보드 → Edge Functions → Logs (푸시 발송 실패 원인이 기록됨), LiveKit Cloud → Sessions.

## 로컬 테스트

```bash
# DB 마이그레이션 + RLS/서버 함수 테스트 (Postgres 15+ 만 있으면 됨)
PGHOST=localhost PGUSER=postgres scripts/test-db.sh

# 로컬 Supabase 전체 + LiveKit 로 통화 API / 웹 2브라우저 E2E
npx supabase start                                  # Docker 필요
docker run -d --name livekit --network supabase_network_<폴더명> -p 7880:7880 -p 7881:7881 \
  -p 50000-50020:50000-50020/udp -v $PWD/livekit.yaml:/livekit.yaml livekit/livekit-server --config /livekit.yaml
npx supabase functions serve --env-file supabase/functions/.env
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... CALL_SWEEP_SECRET=... node scripts/test-calls-api.mjs
npm run build:web && npx serve -s dist -l 4173 &
APP_URL=http://localhost:4173 node scripts/e2e/call.mjs          # 통화 (playwright 필요)
APP_URL=http://localhost:4173 node scripts/e2e/products.mjs      # 상품 소싱
```

`livekit.yaml` 예시 (로컬 전용 키):
```yaml
port: 7880
rtc: { tcp_port: 7881, port_range_start: 50000, port_range_end: 50020, use_external_ip: false, node_ip: 127.0.0.1 }
keys: { devkey: secret-secret-secret-secret-secret-0123 }
webhook: { api_key: devkey, urls: [http://supabase_kong_<폴더명>:8000/functions/v1/livekit-webhook] }
```

## 개발 단계

- [x] 0단계: 프로젝트 세팅 · 탭바 골격
- [x] 1단계: 이메일 회원가입/로그인 (이메일 OTP, 가입·로그인 통합, username 온보딩)
- [x] 2단계: 전화 (검색·팔로우, 맞팔로우 연락처, 1:1 음성/영상, 30초 응답 없음, 네이티브 수신)
- [x] 2.5단계: 상품 소싱 (프로필 상단 상품 줄, 사진 업로드 + 링크, 남의 프로필) · 상단 로고 바 · 아이콘 탭바 · 여백 정리
- [ ] 3단계: 피드 / 댓글 / 스토리형 게시물
- [ ] 4단계: 차단
- [ ] 5단계: DM
