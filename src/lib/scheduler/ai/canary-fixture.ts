// Production AI canary — 게이트 상수와 합성 fixture. 순수 로직만 있다.
//
// 이 파일이 존재하는 이유
//   canary 는 "우리 Worker 가 provider 까지 실제로 닿는가" 를 확인하는 배관
//   점검이다. 프로필 품질은 이미 staging live 에서 Food/Nature/Neutral 로
//   확인했다. 그래서 여기서는 시나리오를 늘리지 않고 Neutral 하나만 둔다.
//
// 이 파일이 지키는 계약
//   · provider 로 나가는 입력은 **서버가 정한 것뿐이다.** 요청 본문에 무엇이
//     들어오든 이 fixture 를 대신하지 못한다. 관리자가 실수로 실제 사용자
//     일정을 붙여 넣어도 그 값이 provider 로 나가지 않는다.
//   · fixture 에 개인 데이터가 없다. 아래 장소는 전부 공개 관광 정보이고
//     실제로 공개 사이트에 노출돼 있는 것들이다.
//   · 좌표·기기 식별자·메모·이메일·결제 정보가 여기 없다. 넣을 자리도 없다.

/** 켜져 있어야만 provider 로 갈 수 있다. secret 이 아니라 운영 스위치다. */
export const CANARY_ENABLE_ENV = "AI_PRODUCTION_CANARY_ENABLED";

/**
 * 기본값은 꺼짐이다. 값이 없거나, 모르는 값이거나, "1"·"yes" 같은 비슷한
 * 말이어도 꺼진 것으로 본다. 켜는 방향으로 실수할 수 없어야 한다.
 */
export function canaryEnabled(raw: string | undefined | null): boolean {
  return (raw ?? "").trim().toLowerCase() === "true";
}

/**
 * 손이 미끄러져 호출되는 일을 막는 문구.
 * 인증만으로 Gemini 를 부르지 않는 이유는, 관리자 도구를 열어 둔 상태에서
 * 브라우저가 요청을 재전송하는 것만으로 과금이 발생하면 안 되기 때문이다.
 */
export const CANARY_CONFIRM_PHRASE = "PRODUCTION-AI-CANARY-ONE-CALL";

export function confirmMatches(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return (body as Record<string, unknown>).confirm === CANARY_CONFIRM_PHRASE;
}

/** 요청 1건당 provider 호출 상한. 재시도 없음, 루프 없음. */
export const MAX_PROVIDER_CALLS = 1;

/** 이 호스트로 나가는 요청만 provider 호출로 센다. */
export const PROVIDER_HOST = "generativelanguage.googleapis.com";

/**
 * canary 요청 안에서만 쓰는 모드.
 *
 * 전역 AI_PERSONALIZATION_MODE 를 바꾸지 않는다. 이 값은 복사한 env 객체에만
 * 얹으므로 같은 순간 들어온 일반 사용자 요청은 여전히 off 를 본다.
 */
export const CANARY_PROVIDER_MODE = "production-live";

// ── 합성 fixture ────────────────────────────────────────────────────────────
//
// 공개 city_spot 이다. 이름·분류 모두 공개 사이트에 이미 나와 있는 값이다.
// Neutral 이라 특정 취향으로 기울지 않는다 — 배관 점검에 적합하다.

export interface CanaryPlace { place_id: string; name: string; category: string }

const FIXTURE_PLACES: readonly CanaryPlace[] = Object.freeze([
  { place_id: "1",   name: "Haeundae Beach",           category: "attraction" },
  { place_id: "2",   name: "Gamcheon Culture Village", category: "attraction" },
  { place_id: "16",  name: "Gwangalli Beach",          category: "nature" },
  { place_id: "17",  name: "Songjeong Beach",          category: "nature" },
  { place_id: "100", name: "Manho-galmi Shabu Shabu",  category: "restaurant" },
  { place_id: "101", name: "MinmulGarden",             category: "restaurant" },
]);

/** Saved 신호도 합성이다. 실제 사용자가 저장한 목록이 아니다. */
const FIXTURE_LIKED: readonly CanaryPlace[] = Object.freeze([
  { place_id: "16", name: "Gwangalli Beach", category: "nature" },
]);

export const CANARY_ALLOWED_PLACE_IDS: readonly string[] = Object.freeze(
  [...new Set([...FIXTURE_PLACES, ...FIXTURE_LIKED].map(p => p.place_id))],
);

/**
 * provider 로 보낼 본문. 호출할 때마다 새 객체를 만든다.
 *
 * 인자를 받지 않는 것이 핵심이다 — 바깥에서 끼워 넣을 구멍이 없다.
 */
export function buildCanaryBody(): Record<string, unknown> {
  return {
    city:        "Busan",
    locale:      "en",
    // 고정 날짜다. 오늘 날짜를 쓰면 실행할 때마다 prompt 가 달라져
    // 결과를 비교할 수 없다.
    start_date:  "2026-09-01",
    end_date:    "2026-09-03",
    travel_style: "balanced",
    travelers:   "2",
    pace:        "normal",
    interests:   [],
    selected_place_ids: FIXTURE_PLACES.map(p => p.place_id),
    selected_places:    FIXTURE_PLACES.map(p => ({ ...p })),
    liked_place_ids:    FIXTURE_LIKED.map(p => p.place_id),
    liked_places:       FIXTURE_LIKED.map(p => ({ ...p })),
    request_id:  "ai-canary-neutral-v1",
  };
}

/**
 * provider 가 우리가 준 적 없는 장소를 가리켰는가.
 * validateProfile 이 이미 걸러 내지만, 운영자가 직접 확인할 수 있도록
 * 위반 목록을 따로 센다.
 */
export function allowedIdViolations(preferredIds: readonly string[] | undefined): string[] {
  if (!Array.isArray(preferredIds)) return [];
  const allowed = new Set(CANARY_ALLOWED_PLACE_IDS);
  return preferredIds.filter(id => !allowed.has(String(id)));
}
