// GoKoreaMate / gokoreamate.com — NearMe → Scheduler Candidate Adapter
// TASK-017: Trip Plan Combo API
// NearMeResult[]과 NearMeCandidate[]는 TASK-013/015 설계 시 동일 Shape로 설계됨.
// 어댑터 역할: distance_m 드롭 + stay_minutes_override = undefined (카테고리/페이스 기반 계산 위임)

import type { NearMeResult } from "../near-me/types";
import type { NearMeCandidate } from "../scheduler/types";

export function adaptToSchedulerCandidates(
  results: NearMeResult[],
): NearMeCandidate[] {
  return results.map((r) => ({
    place_id:   r.place_id,
    category:   r.category,
    coordinate: r.coordinate,
    zone_id:    r.zone_id,
    score:      r.score,
    // stay_minutes_override: Near Me 스코어러에서 제공 불가
    //   → 스케줄러의 slot-allocator가 카테고리/페이스 기반으로 자동 계산
  }));
}
