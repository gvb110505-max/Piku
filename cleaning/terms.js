// cleaning/terms.js — 온보딩 약관 항목 정의
// code/version은 consents 원장에 그대로 기록된다. 본문을 고치면 version을 올려야
// "어떤 버전에 동의했는지"가 흐려지지 않는다.
const TERMS = [
  { code: "tos", version: "1.0", required: true, title: "서비스 이용약관 동의",
    body: `본 약관은 회사가 제공하는 홈케어(청소) 중개 서비스의 이용 조건을 정합니다.
회원은 모집글 작성·지원·결제·평가 등 서비스 이용 시 본 약관을 준수해야 합니다.
회사는 통신판매중개자로서 거래 당사자가 아니며, 거래의 이행 책임은 각 당사자에게 있습니다.` },
  { code: "privacy", version: "1.0", required: true, title: "개인정보 수집·이용 동의",
    body: `수집 항목: 휴대폰번호, 성명, 생년월일, 본인확인 고유값(CI, 해시 저장), 주소, 거래·평가 이력
이용 목적: 회원 식별, 매칭·결제·정산, 분쟁 처리, 제재 및 재가입 제한
보유 기간: 회원 탈퇴 시 파기. 다만 재가입 제한을 위해 해시된 CI와 제재 사유·일시는 별도 보관합니다.
동의를 거부할 수 있으나, 거부 시 서비스 이용이 제한됩니다.` },
  { code: "location", version: "1.0", required: true, title: "위치정보 이용 동의",
    body: `근처 모집글 조회 및 작업 지역 매칭을 위해 단말의 위치정보를 이용합니다.
정확한 주소는 작업자가 확정된 이후에만 공개되며, 그 전에는 시/군/구·동 단위로만 표시됩니다.` },
  { code: "age19", version: "1.0", required: true, title: "만 19세 이상 확인",
    body: `본 서비스는 만 19세 이상만 이용할 수 있습니다. 본인인증으로 확인된 생년월일을 기준으로 판단합니다.` },
  { code: "broker_notice", version: "1.0", required: true, title: "통신판매중개자 고지 확인",
    body: `회사는 통신판매중개자이며 통신판매의 당사자가 아닙니다.
상품·서비스의 제공, 이행, 하자 및 분쟁에 대한 책임은 거래 당사자(고객·작업자)에게 있습니다.
회사는 거래 성사 시 중개 수수료만을 수취합니다.` },
  { code: "sanction_policy", version: "1.0", required: true, title: "제재 정책 동의",
    body: `별점 기준 자동 제재에 동의합니다.
· 최근 평가 3개가 연속 1점이거나, 누적 1점 평가가 5회에 달하면 자동 탈퇴 처리됩니다.
· 한 단계 전(연속 2회 / 누적 4회)에 경고 알림이 발송됩니다.
· 자동 탈퇴 확정 전 7일간 이의신청을 할 수 있으며, 악의적 평가로 확인되면 해당 평가는 무효 처리됩니다.
· 탈퇴 후 재가입 방지를 위해 해시된 본인확인 고유값(CI)과 제재 사유·일시를 보관합니다.` },
  { code: "marketing", version: "1.0", required: false, title: "마케팅 정보 수신 동의(선택)",
    body: `이벤트·혜택 등 마케팅 정보를 문자/푸시로 받아봅니다. 동의하지 않아도 서비스 이용에 제한이 없습니다.` },
];
const REQUIRED = TERMS.filter((t) => t.required).map((t) => t.code);
const byCode = Object.fromEntries(TERMS.map((t) => [t.code, t]));
// 하단/결제 화면에 상시 노출하는 고지 문구
const BROKER_NOTICE =
  "본 서비스는 통신판매중개자이며 통신판매의 당사자가 아닙니다. 거래의 이행 및 분쟁에 대한 책임은 거래 당사자에게 있습니다.";
module.exports = { TERMS, REQUIRED, byCode, BROKER_NOTICE };
