// 전체 여행 AI 글쓰기 계약 (V2-AI-HARDCAP…-V1 §10) — 타입·순수 판정만.
// provider 연결·schema·사용자 차감은 후속 로그인·원장 TASK 로 이관.
// 목적: 재작업 방지 — 이 계약을 벗어난 구현이 들어오면 가드 테스트가 잡는다.

/** 값의 출처. provenance 가 없으면 사용자 작성으로 간주한다(보호 우선) */
export type FieldProvenance = "user" | "system" | "ai" | "ai_then_user_edited";

export function provenanceOrUser(p: unknown): FieldProvenance {
  return p === "system" || p === "ai" || p === "ai_then_user_edited" ? p : "user";
}

/** 사용 전 한 번 선택하는 범위 */
export type WritingScope =
  | "empty_and_system_only"   // 빈 값·기본 생성값만
  | "include_ai"              // AI 가 만든 값 포함
  | "include_user_authored";  // 사용자 작성값 포함 — 명시 동의 필수

/** 이 필드를 이번 제안 대상으로 삼아도 되는가(자동 덮어쓰기 금지 — 대상 선정만) */
export function fieldEligible(scope: WritingScope, p: FieldProvenance, isEmpty: boolean): boolean {
  if (isEmpty) return true;
  const prov = provenanceOrUser(p);
  if (prov === "system") return true;
  if (prov === "ai") return scope === "include_ai" || scope === "include_user_authored";
  // user · ai_then_user_edited = 사용자 작성 — 명시 동의 범위에서만
  return scope === "include_user_authored";
}

/**
 * 한 번의 요청이 제안하는 전체 묶음 — 제안일 뿐 적용이 아니다.
 * 적용은 전체 preview/diff 후 항목별 선택으로만 한다.
 * 완성 제안 1건 = 사용권 1회. 장소별 각각 차감 금지.
 */
export interface FullTripWritingProposal {
  tripTitle?: string;
  tripIntro?: string;
  storyTitle?: string;
  storyIntro?: string;
  items: { targetId: string; kind: "moment" | "place"; title?: string; memo?: string }[];
}

/** 사용권 차감 판정 — 완성 제안이 실제로 도착했을 때만 1 */
export function creditUnitsForProposal(p: FullTripWritingProposal | null): 0 | 1 {
  if (!p) return 0;
  const hasAny = Boolean(p.tripTitle || p.tripIntro || p.storyTitle || p.storyIntro || p.items.length > 0);
  return hasAny ? 1 : 0;
}
