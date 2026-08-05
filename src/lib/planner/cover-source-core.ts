// Planner 상세 헤더에 무엇을 띄울지 정하는 순수 로직.
//
// 우선순위를 컴포넌트 안에 흩어 놓으면 "공개 전환하니 사진이 바뀐다" 같은 문제를
// 재현·검증할 수 없다. 여기 한 함수로 모으고 테스트로 고정한다.
//
// ── 개인 사진을 언제 쓸 수 있나 ──────────────────────────────────────────────
// 개인 커버는 `/img/trip-cover/:id` 로만 받을 수 있는데, 그 엔드포인트는
// is_public 이 아니면 404 다(resolveEffectiveCover). 이 보안 게이트는 건드리지
// 않는다. 그래서 개인 사진은 **공개 일정에서만** 헤더에 나온다. 비공개 일정은
// 도시 대표 비주얼로 내려간다.
//
// ── 관광(tourism) 커버를 쓰지 않는 이유 ─────────────────────────────────────
// 같은 엔드포인트는 개인 사진이 없으면 KTO 관광 자산으로 떨어진다. 그 자산 풀은
// 부산 전용이라, 공개된 서울 일정 헤더에 부산 사진이 뜬다. 도시 교차 노출은
// 허용하지 않으므로 개인 사진이 확실할 때만 그 엔드포인트를 쓴다.
//
// ── 저장 전후로 사진이 바뀌지 않는 이유 ─────────────────────────────────────
// 도시 대표 비주얼은 도시 키만으로 정해진다. itineraryId 해시를 쓰지 않으므로
// 저장 전(id 없음)과 저장 후가 같은 이미지다.

export type PlannerCoverSource =
  /** 사용자가 고른 개인 사진 — 공개 일정에서만 */
  | { kind: "personal"; src: string }
  /** gokoreamate 서비스용 기본 도시 대표 비주얼 */
  | { kind: "city"; src: string; width: number; height: number; objectPosition: string }
  /** 도시 자산이 없거나 이미지 로드 실패 */
  | { kind: "gradient" };

export interface CityVisualLike {
  src: string;
  w: number;
  h: number;
  objectPosition: string;
}

export interface CoverInput {
  /** itineraries.cover_kind — "moment" 만 개인 사진이다 */
  coverKind?: string | null;
  coverMomentId?: string | null;
  itineraryId?: string | null;
  isPublic?: boolean;
  city?: string | null;
  /** 이미지 onError 뒤 재시도하지 않기 위한 플래그 */
  imageFailed?: boolean;
}

/** 개인 사진을 헤더에 띄울 수 있는 조건 — 하나라도 빠지면 안 된다 */
export function canUsePersonalCover(input: CoverInput): boolean {
  return (
    input.coverKind === "moment" &&
    typeof input.coverMomentId === "string" && input.coverMomentId.length > 0 &&
    typeof input.itineraryId === "string" && input.itineraryId.length > 0 &&
    input.isPublic === true
  );
}

export function personalCoverPath(itineraryId: string): string {
  return `/img/trip-cover/${encodeURIComponent(itineraryId)}`;
}

/**
 * 헤더 이미지 결정.
 * @param resolveCity 도시 slug → 대표 비주얼 (없으면 null). 주입해서 테스트한다.
 */
export function resolvePlannerCover(
  input: CoverInput,
  resolveCity: (slug: string | null | undefined) => CityVisualLike | null,
): PlannerCoverSource {
  if (input.imageFailed) return { kind: "gradient" };

  if (canUsePersonalCover(input)) {
    return { kind: "personal", src: personalCoverPath(input.itineraryId as string) };
  }

  const v = resolveCity(input.city);
  if (v) {
    return { kind: "city", src: v.src, width: v.w, height: v.h, objectPosition: v.objectPosition };
  }

  return { kind: "gradient" };
}
