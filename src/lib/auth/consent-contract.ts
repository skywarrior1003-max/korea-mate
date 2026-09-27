// 동의 문서 버전 계약 (CONSENT-AND-AUTH-ACTIVATION-V1 §D) — 단일 정의 지점.
//
// 이 파일이 클라이언트와 Cloudflare Functions 양쪽이 공유하는 유일한 버전
// 원장이다(도시 identity.ts 와 같은 공용 모듈 패턴). 다른 파일에 이 문자열을
// 하드코딩하지 않는다 — 가드 테스트가 감시한다.
//
// ⚠ Preview 전용 버전이다. Legal 문서는 아직 DRAFT(effectiveDate null)라서
// 시행일 기반 버전이 존재하지 않는다. Production 출시 전에 반드시:
//   ① Owner 확정 Legal + effectiveDate 로 버전을 교체하고(예: 2026-10-XX-v1)
//   ② Preview 버전으로 기록된 동의는 구버전이 되어 **전원 재동의**가 필요하며
//   ③ Preview/Staging QA 동의 행은 Production 으로 이전하지 않는다.
// (운영 문서 docs/operations/consent-activation-v1.md §4 에 동일 계약 명시)

export const TERMS_VERSION = "preview-legal-v1";
export const PRIVACY_VERSION = "preview-legal-v1";
export const AGE_GATE_VERSION = "preview-age-14-v1";

/** intent cookie 이름 — 의미가 드러나되 PII 없음 */
export const CONSENT_INTENT_COOKIE = "gkm_consent_intent";

/** HMAC domain separation — 기존 actor 해시 입력(gkm-owner-v2|…, gkm-user-v1|…)과
 *  절대 겹치지 않는 별도 네임스페이스다. 단순 연결 금지 계약(§C-2). */
export const CONSENT_INTENT_DOMAIN = "gkm-consent-intent-v1";

/** intent cookie 수명(초) — §C-2: 10분 이내 */
export const CONSENT_INTENT_MAX_AGE_S = 600;

export const CONSENT_LOCALES = ["ko", "en", "ja", "zh"] as const;
export type ConsentLocale = (typeof CONSENT_LOCALES)[number];

export function isConsentLocale(v: unknown): v is ConsentLocale {
  return typeof v === "string" && (CONSENT_LOCALES as readonly string[]).includes(v);
}

/** 현재 3개 버전 묶음 — activate/status/requireActiveUser 가 공유 */
export const CURRENT_CONSENT_VERSIONS = {
  age_gate_version: AGE_GATE_VERSION,
  terms_version: TERMS_VERSION,
  privacy_version: PRIVACY_VERSION,
} as const;
