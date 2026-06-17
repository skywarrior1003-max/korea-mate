// GoKoreaMate / gokoreamate.com — Slot Allocator
// TASK-013: Rule-based Scheduler v1
// Resolves stay_minutes for a candidate using route_template > category × pace.

import type { NearMeCandidate, SchedulerInput, StaySource } from "./types";
import { CATEGORY_STAY_MINUTES, PACE_MULTIPLIER } from "./constants";

export interface StayResolution {
  stay_minutes: number;
  stay_source: StaySource;
}

export function resolveStayMinutes(
  candidate: NearMeCandidate,
  input: SchedulerInput
): StayResolution {
  // 1. route_template override (highest priority)
  const templateEntry = input.route_template_stays?.find(
    (rt) => rt.place_id === candidate.place_id
  );
  if (templateEntry) {
    return { stay_minutes: templateEntry.stay_minutes, stay_source: "route_template" };
  }

  // 2. candidate-level override (set by NearMeCandidate adapter)
  if (candidate.stay_minutes_override !== undefined) {
    return { stay_minutes: candidate.stay_minutes_override, stay_source: "route_template" };
  }

  // 3. category default × pace multiplier
  const base       = CATEGORY_STAY_MINUTES[candidate.category] ?? 60;
  const multiplier = PACE_MULTIPLIER[input.pace];
  const adjusted   = Math.round(base * multiplier);

  return { stay_minutes: adjusted, stay_source: "pace_adjusted" };
}
