// 운영시간 정규화 — 의존성 없는 순수 모듈 (node --experimental-strip-types 로 단독 검증 가능)
//
// DB city_spots.opening_hours(jsonb) 는 구조화 값 {open, close} 또는 구조화 불가 원문
// fallback {raw}(Final deferred 원문 그대로 — 요약/번역/재작성 금지) 를 담는다.
// 일정·플래너·카트가 쓰는 openingHours 계약은 {open, close} | null 그대로다:
// raw 는 Place Detail 표시 전용이며, 어댑터 경계에서 걸러져 하위 계층(고정 일정 변환·
// visit-time 가드 등)에 부분 객체로 흘러가지 않는다.

export type OpeningHoursDb = { open?: string; close?: string; raw?: string } | null;

/** 완전한 구조화 값일 때만 {open, close} 를 반환한다 (structured 우선 규칙의 판별자) */
export function structuredOpeningHours(v: OpeningHoursDb | undefined): { open: string; close: string } | null {
  if (v && typeof v.open === "string" && v.open.trim() && typeof v.close === "string" && v.close.trim()) {
    return { open: v.open, close: v.close };
  }
  return null;
}

/** 구조화 불가 원문 fallback (표시 전용 — 내용 그대로, 번역·요약 금지) */
export function rawOpeningHours(v: OpeningHoursDb | undefined): string | null {
  if (v && typeof v.raw === "string" && v.raw.trim()) return v.raw;
  return null;
}
