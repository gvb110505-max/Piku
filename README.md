# Piku 서버

포켓몬 카드 랜덤팩 앱 Piku의 API 서버. Vercel 서버리스로 배포.

## Vercel 배포 순서

1. **이 폴더 전체**를 GitHub 저장소에 올린다 (이 README가 저장소 최상단에 오게 — `server` 같은 하위 폴더로 감싸지 말 것)
2. Vercel → Add New → Project → 이 저장소 Import
   - Framework Preset: **Other** (자동 감지되면 그대로 둬도 됨)
   - Root Directory: 그대로 (`./`)
3. Storage → **Neon** 생성 후 이 프로젝트에 연결
4. Settings → Environment Variables에 `ADMIN_TOKEN` 추가 (긴 랜덤 문자열)
5. Deployments → Redeploy

`/health`에서 `"persistent": true`가 나오면 정상.

### DB 환경변수

Neon을 연결하면 변수명이 `DATABASE_URL`이 아니라 `POSTGRES_URL` 등으로 들어올 수 있다.
서버가 `DATABASE_URL`, `POSTGRES_URL`, `DATABASE_URL_UNPOOLED` 등을 자동으로 찾고,
그 목록에 없어도 `postgresql://`로 시작하는 값이 있으면 사용하므로 **따로 맞춰줄 필요 없다.**

Postgres가 하나도 없으면 서버는 크래시하지 않고 `/health`가 503으로 원인을 알려준다.
(로컬에서는 `npm i better-sqlite3` 하면 SQLite로 동작)

## 엔드포인트

| 경로 | 설명 |
|---|---|
| `GET /health` | DB 연결 상태 확인 |
| `GET /packs`, `GET /packs/:id` | 팩 목록 / 상세(실시간 확률·잔여·GUARANTEED) |
| `POST /auth/request-code`, `/auth/verify` | 전화번호 인증 (가입 시 1,000P) |
| `POST /purchase`, `/purchase/welcome` | 결제·개봉 / 웰컴팩(계정당 1회) |
| `POST /cards/:id/exchange` | 포인트 변환 |
| `POST /shipments` | 합배송 신청 |
| `GET /me` | 마이페이지(보유 카드·포인트·주문·결제 한도) |
| `GET /admin` | 관리자 페이지 |

## 로컬 실행 / 테스트

```bash
npm install
npm i better-sqlite3     # 로컬 개발용 (배포에는 불필요)
npm start                # :4000

node test-e2e.js         # 유저 플로우 13항목
node test-admin.js       # 관리자 API 8항목
DATABASE_URL=postgresql://... node test-e2e.js   # Postgres 경로 검증
```

## 핵심 로직

**슬롯 소진 방식 확률** — 팩마다 `total_slots`개의 슬롯이 있고 HIT은 재고 수량만큼 슬롯을 점유한다.
특정 HIT 확률 = `남은 수량 / 남은 슬롯`이라 재고가 줄면 확률이 자동 재계산되고,
**표시 확률과 실제 추첨 확률이 구조적으로 항상 일치**한다(확률형 상품 표시 의무 대응).
HIT 전량 소진 시 판매가 자동 중단된다.

원가 설계: `총 슬롯 ≈ HIT 원가 합 ÷ (판매가 × 0.35)`로 잡으면 기대 지급 원가 35%가 된다.

**GUARANTEED** — `guaranteed` 테이블의 N번째 개봉자에게 확률과 무관하게 보장 상품을 추가 지급.

**미성년자 결제 한도** — 만 19세 미만은 하루 100,000원. PG 승인 *전에* 서버에서 차단하므로
승인 후 환불하는 상황이 생기지 않는다. 매일 자정(UTC 기준) 초기화.

## 운영 전환 전 필수 작업

- **본인인증**: `/auth/request-code`, `/auth/verify`를 PASS 등 실제 본인인증으로 교체.
  현재는 생년월일을 클라이언트에서 받으므로 우회가 가능하다 — 반드시 인증 결과에서 받아야 한다.
- **결제**: `TOSS_SECRET_KEY` 설정 시 승인 검증이 자동으로 켜진다. 앱에서는 결제위젯 연결 필요.
- **환불**: 품절 경합 시 자동 환불 호출 추가 (`/purchase`의 TODO 참고)
- **세션**: 현재 tokens 테이블 방식 → 만료 처리 추가 권장
- **관리자 보호**: `ADMIN_TOKEN`을 반드시 변경. 가능하면 `/admin` 경로에 IP 제한 추가.
