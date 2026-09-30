# CallSNS (가칭) — 전화 중심 SNS 앱

좋아요 대신 댓글, 텍스트 DM 대신 전화로 소통하는 SNS.

- 앱: React Native + Expo SDK 57 (TypeScript, Expo Router, Development Build)
- 백엔드: Supabase (Auth · Postgres + RLS · Realtime · Storage · Edge Functions)
- 통화: LiveKit (2단계에서 연동)
- 웹 미리보기: 같은 코드를 `expo export --platform web` 으로 빌드해 Vercel에 배포
  - 웹에서는 CallKit/ConnectionService 수신 화면·VoIP 푸시가 동작하지 않는다. 통화 테스트는 실기기로 한다.

## 폴더 구조

```
src/app/            # Expo Router 라우트 (파일 = 화면)
  _layout.tsx       # 루트: GestureHandler, SafeArea, Stack
  index.tsx         # 첫 화면 → /call 리다이렉트
  (tabs)/           # 하단 탭 5개: home · search · call(가운데 강조) · compose · profile
src/components/     # 공용 컴포넌트 (TabBar 등)
src/lib/            # env, supabase 클라이언트
src/theme/          # 색상
supabase/migrations # DB 스키마 · RLS (1단계부터 추가)
supabase/functions  # Edge Functions (2단계부터 추가)
```

## 준비

```bash
npm install
cp .env.example .env   # Supabase URL / anon key 입력
```

`.env` 에는 공개 가능한 값(`EXPO_PUBLIC_*`)만 둔다. service_role 키·LiveKit secret 은
Supabase Edge Function 시크릿(`supabase secrets set ...`)으로만 관리한다.

## 실행

| 목적 | 명령 |
|---|---|
| 웹 미리보기 (브라우저) | `npm run web` |
| iOS Dev Build (Mac + Xcode) | `npm run ios` |
| Android Dev Build (Android Studio) | `npm run android` |
| 클라우드 Dev Build (EAS) | `npx eas-cli@latest build --profile development --platform ios\|android` |
| Dev Build 설치 후 개발 서버 | `npm start` |
| 타입 검사 | `npm run typecheck` |
| 웹 정적 빌드 | `npm run build:web` → `dist/` |

통화/VoIP 네이티브 모듈을 쓰므로 **Expo Go 는 사용하지 않는다.** 실기기에 Dev Build 를 설치해 테스트한다.

## Vercel 배포 (웹 미리보기)

`vercel.json` 이 빌드 설정을 갖고 있다 (`expo export --platform web` → `dist`, SPA rewrite).
Vercel 프로젝트 Environment Variables 에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 를 넣고 재배포한다
(빌드 시점에 번들에 들어가므로 값을 바꾸면 재배포 필요).

## 개발 단계

- [x] 0단계: 프로젝트 세팅 · 탭바 골격
- [ ] 1단계: 이메일 회원가입/로그인
- [ ] 2단계: 전화 기능
- [ ] 3단계: 피드 / 댓글 / 스토리형 게시물
- [ ] 4단계: 차단
- [ ] 5단계: DM
