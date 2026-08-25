# Piku 앱

Expo (React Native) 앱. 서버는 저장소 최상단의 Node/Express API를 사용한다.

## 실행

```
cd app
npm install
npm start
```

터미널에 뜨는 QR을 Expo Go 앱으로 찍으면 폰에서 바로 실행된다.
웹으로 확인하려면 `npm run web`.

## 서버 주소

기본값은 배포 서버(`https://piku-ry77.vercel.app`)다. 로컬 서버로 붙이려면:

```
EXPO_PUBLIC_API_URL=http://<내 PC의 IP>:4000 npm start
```

폰에서 접속할 때는 `localhost`가 아니라 PC의 실제 IP를 써야 한다.

## 구조

```
src/app/          expo-router 화면 (파일 = 경로)
  (tabs)/         홈 · 마켓 · 컬렉션 · 마이
  pack/[id]       팩 상세 · 구매 · 개봉
  market/[id]     상품 상세 · 구매(에스크로)
  market/sell     판매 등록
  market/orders   내 거래 · 수거 신청
src/lib/api.ts    API 클라이언트 + 타입
src/lib/auth.tsx  로그인 상태 (토큰은 SecureStore)
src/components/   UI 공통 조각 · 슬랩 카드 · 개봉 연출
```

## 검증

```
npm run typecheck        # 타입체크
npx expo export -p web   # 번들 확인
```
