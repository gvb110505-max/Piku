# 청소로 용돈벌이 — 홈케어(청소) 중개 플랫폼

고객(청소가 필요한 사람)과 작업자(부업으로 청소를 하는 일반인)를 연결하는 **통신판매중개** 서비스.
플랫폼은 거래 당사자가 아니며 거래 성사 시 중개 수수료만 수취한다.

## 실행

```bash
npm install                 # 저장소 루트 (express, better-sqlite3)
node cleaning/index.js      # http://localhost:4100
node cleaning/test-cleaning.js   # 전체 플로우 검증 (45개 체크)
```

| 주소 | 설명 |
|---|---|
| `/` , `/app` | 앱 화면 데모 — 온보딩 약관 동의 → 본인인증 → 모집/지원/결제/평가 |
| `/admin` | 관리자 페이지 (기본 토큰 `dev-admin`) |

환경변수: `DATABASE_URL`(Postgres, 없으면 SQLite) · `CLEANING_ADMIN_TOKEN` ·
`CLEANING_ENC_KEY`/`CLEANING_HASH_PEPPER`(운영에서는 반드시 교체) · `PAY_MODE=live`(PG 실연동) ·
`IDENTITY_MODE=live`(PASS 실연동).

## 구성

| 파일 | 역할 |
|---|---|
| `db.js` | Postgres/SQLite 어댑터 + 스키마 + 정책값(settings) |
| `terms.js` | 온보딩 약관 7종(필수 6 + 선택 1) 정의와 본문, 통신판매중개자 고지 문구 |
| `secure.js` | 주소·연락처 AES-256-GCM 암호화, CI/휴대폰 HMAC 해시, 마스킹 |
| `escrow.js` | PG 분할정산(에스크로) 어댑터 — 예치/분할정산/환불. 개발 모드 기본 |
| `sanctions.js` | 별점 기반 자동 제재 엔진(경고·자동 탈퇴·블랙리스트·악용 패턴) |
| `index.js` | API 서버 |
| `app.html` | 앱 화면 데모(모바일 폭). RN 화면과 1:1 대응 |
| `admin.html` | 관리자 페이지 |

## 온보딩 — 약관 동의

`GET /terms`가 항목·필수 여부·본문을 함께 내려주므로 앱은 화면만 그린다.
상단 "전체 동의", 항목별 체크, 각 항목 "보기"로 전문 확인.
필수 6개(이용약관 / 개인정보 / 위치정보 / 만19세 / 통신판매중개자 고지 / 제재 정책)를
모두 체크해야 다음 단계로 넘어간다. 동의 여부·항목·버전·일시는 `consents` 테이블에 행으로 남는다.

가입은 휴대폰 본인인증(PASS)으로 하고, **CI 원본은 저장하지 않는다** — HMAC-SHA256 해시만 보관하며
이 해시가 중복가입·재가입 차단의 유일한 키다.

## 매칭

1. 고객이 모집글 작성 — 청소 종류/일시/지역/평수/희망 금액/요청사항.
   **정확한 주소는 확정 전까지 비공개**이고 목록·상세에는 `시/군/구 + 동`만 나간다.
2. 작업자가 지원 → 서버가 **평균 별점 → 평가 개수 → 완료 건수** 순으로 정렬해 고객에게 전달.
   평가 수가 기준(`new_worker_rating_count`, 기본 3) 미만이면 `is_new` = "신규" 뱃지를 달고
   평균 0점으로 최하위에 묻히지 않도록 별도 구간에 배치한다.
3. 고객이 직접 선택하거나 `{"auto": true}`로 "별점 최고 작업자 자동 배정".
4. 확정 즉시 작업자에게 상세 주소가 공개되고, **작업 완료 후에는 다시 비공개**로 돌아간다.

## 결제 · 정산

PG 분할정산(에스크로)에 예치만 걸고 플랫폼이 고객 대금을 보관하지 않는다.
고객이 작업 완료를 확인하면 예치금이 분할정산된다.

```
지급액 = 결제액 − 중개수수료(fee_rate, 기본 15%) − 원천징수 3.3%(수수료 차감 후 금액 기준)
```

수수료율·원천징수율은 관리자 페이지에서 변경하고, **정산 시점 값이 `settlements` 행에 박제**된다.

## 별점과 자동 제재

- 완료된 거래에 대해 고객이 1회만, 1~5점 + 후기.
- **1점은 사유 선택 필수** (무단 불참 / 파손 / 불친절 / 청소 미흡 / 지각 / 기타).
- 자동 탈퇴 조건 — 최근 유효 평가 **3개 연속 1점** 또는 **누적 1점 5회**.
- 한 단계 전(연속 2회 / 누적 4회)에 경고 알림.
- 조건 충족 시 계정은 즉시 `suspended`(신규 지원 차단)가 되고 **7일 이의신청 기간**이 열린다.
  기간이 지나면 관리자 버튼 또는 `POST /admin/sanctions/run-due`로 확정 → `withdrawn` +
  해시된 CI가 `blacklist`에 올라가 같은 CI로는 재가입할 수 없다.
- 관리자가 악의적 평가로 판단해 평가를 무효 처리하면(`voided=1`) 제재 조건이 다시 계산되고,
  조건이 풀리면 **열려 있던 탈퇴 예정 건이 자동 취소**되며 계정이 복구된다.
- 한 고객이 1점만 반복해서 주는 패턴(1점 3회 이상 & 비중 80% 이상)은 관리자 화면에 표시된다.

## 안전 · 법적 요구사항

- 통신판매중개자 고지 문구를 `/health`·`/terms`·결제/거래 응답과 앱 하단에 상시 노출.
- 작업자·고객 모두 본인인증 필수, 만 19세 미만 가입 차단.
- 주소·휴대폰번호는 암호화 저장하고 조회는 마스킹(`010****4444`). 작업 종료 후 작업자 화면에서 주소 비공개.
- 신고(파손/도난/부적절 행위/무단 불참) 접수 → 관리자 검토중/처리완료 흐름.

## API 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/terms` | 약관 항목 + 전문 |
| POST | `/auth/verify` | 본인인증 가입/로그인 (필수 동의·연령·블랙리스트 검사) |
| GET | `/me`, `/notifications`, `/sanctions/me` | 내 정보 / 알림 / 내 제재 이력 |
| POST | `/job-posts` · GET `/job-posts`, `/job-posts/:id` | 모집글 작성/목록/상세 |
| POST | `/job-posts/:id/apply` · GET `/job-posts/:id/applications` | 지원 / 정렬된 지원자 |
| POST | `/job-posts/:id/select` | 지원자 선택 또는 자동 배정 |
| POST | `/matches/:id/pay` · `/complete` · `/rating` | 에스크로 결제 / 완료 확인+정산 / 별점 |
| GET | `/workers/:id` | 작업자 평점·후기 |
| POST | `/sanctions/:id/appeal` · `/reports` | 이의신청 / 신고 |
| GET/POST | `/admin/users`, `/admin/sanctions`, `/admin/sanctions/:id/resolve`, `/admin/sanctions/run-due`, `/admin/ratings/:id/void`, `/admin/abuse`, `/admin/reports`, `/admin/settlements`, `/admin/settings` | 관리자 |

## 남은 연동 작업

- `escrow.js`의 TODO — PG사 분할정산 예치/확정 API 실호출(`PAY_MODE=live`).
- `/auth/verify`의 PASS 본인인증 콜백 검증(`IDENTITY_MODE=live`이면 `ci`를 반드시 인증기관 응답에서 받아야 한다).
- 푸시 발송(현재는 `notifications` 테이블에만 적재).
