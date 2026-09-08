// Living Map 마커 데이터 — 순수 계산만 한다. (TASK-GOKOREAMATE-TRAVEL-MEMORY-PRODUCTION-V1)
//
// Living Map 은 navigation 이 아니라 회고다: "어디를 어떤 순서로 다녔고 어떤
// 사진을 남겼는가". 마커 우선순위는 승인 시안(living_map_final) 계약 그대로다.
//
//   1. 그 stop 에 사용자 사진(순간)이 있으면 → 사용자 사진 + 방문 순번
//   2. 없으면 → 카탈로그 대표사진 + 방문 순번
//   3. 둘 다 없으면 → 숫자 마커
//
// 순간 ↔ stop 결합은 Story 와 **같은 규칙 한 벌**(momentBelongsToStop)만 쓴다.
// 장소명 문자열로 추측해 붙이지 않는다 — 잘못 붙은 사진은 없는 사진보다 나쁘다.
//
// 번호는 Day 마다 1부터다. Whole Trip 에서도 Day 별 1..n 을 유지하고, Day 는
// 색으로 가른다 — 누적 순번(1..15)으로 바꾸지 않는다(SSOT §5.3).

import { momentBelongsToStop, type StoryMomentInput, type StoryStopInput } from "../share/private-story-adapter.ts";
import { resolveDisplayImage } from "../place-detail/place-detail-core.ts";

export type LivingMapMarkerKind = "user" | "catalog" | "number";

export interface LivingMapMarker {
  kind:     LivingMapMarkerKind;
  /** 마커에 얹을 사진. number 마커면 null. */
  photoUrl: string | null;
  /** 이 stop 에 결합된 첫 순간의 메모 — STOP 시트의 인용 한 줄. 없으면 "". */
  memo:     string;
}

/**
 * stop 하나의 마커 원천을 정한다.
 *
 * 사용자 사진은 **이 stop 에 결합된 순간**의 첫 사진만 쓴다. 결합되지 않은
 * 자유 순간은 지도가 어느 좌표에 둘지 알 수 없으므로 여기 오지 않는다
 * (Story 에서는 그 Day 의 독립 항목으로 계속 보인다 — 사라지는 것이 아니다).
 */
export function stopMarker(
  stop:       StoryStopInput,
  dayNumber:  number,
  moments:    readonly StoryMomentInput[],
): LivingMapMarker {
  for (const m of moments) {
    if (m.day_number !== dayNumber) continue;
    if (!momentBelongsToStop(m, stop)) continue;
    const memo = typeof m.memo === "string" ? m.memo.trim() : "";
    const first = [m.photo_data, ...(m.photo_data_extra ?? [])]
      .find(p => typeof p === "string" && p.trim() !== "");
    if (first) return { kind: "user", photoUrl: first, memo };
    // 사진 없는 순간이라도 메모는 시트에 실을 수 있다 — 마커는 아래 fallback 으로.
    const catalog = resolveDisplayImage((stop.image ?? "").trim() || null);
    return catalog
      ? { kind: "catalog", photoUrl: catalog, memo }
      : { kind: "number", photoUrl: null, memo };
  }
  const catalog = resolveDisplayImage((stop.image ?? "").trim() || null);
  return catalog
    ? { kind: "catalog", photoUrl: catalog, memo: "" }
    : { kind: "number", photoUrl: null, memo: "" };
}

/**
 * Whole Trip 에서 Day 를 가르는 색. 순번이 아니라 dayNumber 로 정해 Day 전환·
 * 재정렬에도 같은 Day 는 같은 색이다. 8일 초과는 순환한다 — 색이 겹치더라도
 * 번호가 Day 안에서 1..n 이라 의미는 깨지지 않는다.
 *
 * 첫 색은 현재 trip 레이어의 coral(#FF4A2D) — Day 1 이 기존 단일 Day 지도와
 * 같은 언어로 보이게. 이후는 서로 멀리 떨어진 진한 색들이다(흰 테두리 위 숫자
 * 가독 기준).
 */
export const LIVING_MAP_DAY_COLORS = [
  "#FF4A2D", // Day 1 — coral (기존 trip 레이어 색)
  "#0041C9", // Day 2 — product blue
  "#15803D", // Day 3 — green
  "#7E22CE", // Day 4 — purple
  "#B45309", // Day 5 — amber-brown
  "#0E7490", // Day 6 — teal
  "#BE185D", // Day 7 — pink
  "#334155", // Day 8 — slate
] as const;

export function livingMapDayColor(dayNumber: number): string {
  const n = Number.isInteger(dayNumber) && dayNumber >= 1 ? dayNumber : 1;
  return LIVING_MAP_DAY_COLORS[(n - 1) % LIVING_MAP_DAY_COLORS.length]!;
}
