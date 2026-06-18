// GoKoreaMate / gokoreamate.com — Trip Plan Engine (Orchestrator)
// TASK-017: Trip Plan Combo API (Facade Pattern)
// Pipeline: runNearMe → adaptToSchedulerCandidates → runScheduler | personalize
//
// 실행 분기:
//   with_ai: false → runScheduler()  → "scheduled" | "conflict"
//   with_ai: true  → personalize()   → "personalized" | "fallback" | "conflict"
//                    (personalize() 내부에서 runScheduler() 호출 — 중복 연산 없음)

import { runNearMe } from "../near-me/near-me-engine";
import { runScheduler } from "../scheduler/engine";
import { personalize } from "../scheduler/ai/personalizer";
import { adaptToSchedulerCandidates } from "./near-me-adapter";
import type { TripPlanInput, TripPlanResponse } from "./types";
import type { NearMeInput } from "../near-me/types";
import type { SchedulerInput } from "../scheduler/types";

const DEFAULT_NEAR_ME_LIMIT = 12;

export async function runTripPlan(input: TripPlanInput): Promise<TripPlanResponse> {
  // ── Step 1: NearMeInput 조립 ──────────────────────────────────────────────

  const nearMeInput: NearMeInput = {
    coordinate:       input.coordinate,
    timestamp:        input.timestamp,
    categories:       input.categories,
    liked_place_ids:  input.liked_place_ids,
    itinerary_coords: input.itinerary_coords,
    event_coords:     input.event_coords,
    limit:            input.near_me_limit ?? DEFAULT_NEAR_ME_LIMIT,
  };

  // ── Step 2: Near Me 실행 (NEXT_PUBLIC_USE_MOCK_NEAR_ME 플래그 자동 적용) ──

  const nearMeResponse  = await runNearMe(nearMeInput);
  const nearMeCount     = nearMeResponse.results.length;

  // ── Step 3: NearMeResult[] → NearMeCandidate[] (무오버헤드 1:1 매핑) ─────

  const candidates = adaptToSchedulerCandidates(nearMeResponse.results);

  // ── Step 4: SchedulerInput 조립 ──────────────────────────────────────────

  const schedulerInput: SchedulerInput = {
    trip_date:            input.trip_date,
    start_time:           input.start_time,
    end_time:             input.end_time,
    base_coordinate:      input.coordinate,
    pace:                 input.pace,
    anchors:              input.anchors,
    fixed_events:         input.fixed_events,
    preferred_items:      input.preferred_items,
    route_template_stays: input.route_template_stays,
    affiliate_context:    input.affiliate_context,
    candidates,
  };

  // ── Step 5: 실행 분기 ────────────────────────────────────────────────────

  if (!input.with_ai) {
    // 규칙 기반 단독 실행 (동기)
    const result = runScheduler(schedulerInput);

    if (!result.success) {
      return { kind: "conflict", error: result.error };
    }
    return { kind: "scheduled", plan: result.data, near_me_count: nearMeCount };
  }

  // AI 개인화 레이어 실행 (비동기)
  // personalize() 내부에서 runScheduler()를 직접 호출하므로 중복 실행 방지됨
  const personalizationResult = await personalize(schedulerInput);

  if (personalizationResult.kind === "personalized") {
    return {
      kind:          "personalized",
      plan:          personalizationResult.data,
      near_me_count: nearMeCount,
    };
  }

  if (personalizationResult.kind === "fallback") {
    return {
      kind:            "fallback",
      plan:            personalizationResult.data,
      near_me_count:   nearMeCount,
      fallback_reason: personalizationResult.reason,
    };
  }

  // conflict (personalize 내부 runScheduler HC 위반)
  return { kind: "conflict", error: personalizationResult.error };
}
