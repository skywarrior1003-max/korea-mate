// GoKoreaMate / gokoreamate.com — Hard Constraint Validator
// TASK-013: Rule-based Scheduler v1
// HC-1 ~ HC-7: each constraint is a named predicate returning ConflictError | null

import type {
  ScheduledItem,
  SchedulerInput,
  ConflictError,
  NearMeCandidate,
} from "./types.ts";
import { timeToMinutes } from "./utils.ts";
import { HC7_MAX_ITEMS } from "./constants.ts";

// HC-1: No duplicate place_id in the day
export function hc1NoDuplicate(
  candidate: NearMeCandidate,
  placed: ScheduledItem[]
): ConflictError | null {
  const dup = placed.find(
    (it) => it.item_type === "place" && it.place_id === candidate.place_id
  );
  if (dup) {
    return {
      code: "HC-1",
      message: `Place ${candidate.place_id} is already in the schedule.`,
      conflicting_item: dup,
    };
  }
  return null;
}

// HC-2: Operating hours (stub — opening_hours field not yet in DB per TASK-011 note)
// Always passes until opening_hours is available.
export function hc2OperatingHours(
  _candidate: NearMeCandidate,
  _proposedStartMinutes: number
): ConflictError | null {
  return null;
}

// HC-3: Travel time must fit within the available gap
export function hc3TravelFits(
  travelMinutes: number,
  availableGapMinutes: number
): ConflictError | null {
  if (travelMinutes > availableGapMinutes) {
    return {
      code: "HC-3",
      message: `Travel time ${travelMinutes}min exceeds available gap ${availableGapMinutes}min.`,
    };
  }
  return null;
}

// HC-4: Stay + travel must fit within the available gap
export function hc4StayFits(
  travelMinutes: number,
  stayMinutes: number,
  availableGapMinutes: number
): ConflictError | null {
  if (travelMinutes + stayMinutes > availableGapMinutes) {
    return {
      code: "HC-4",
      message: `Travel ${travelMinutes}min + Stay ${stayMinutes}min exceeds gap ${availableGapMinutes}min.`,
    };
  }
  return null;
}

// HC-5: Proposed time must not overlap with any fixed anchor or event
export function hc5NoAnchorConflict(
  proposedStart: number,
  proposedEnd: number,
  placed: ScheduledItem[]
): ConflictError | null {
  for (const item of placed) {
    if (!item.is_fixed) continue;
    const itemStart = timeToMinutes(item.start_time);
    const itemEnd   = timeToMinutes(item.end_time);
    const overlaps  = proposedStart < itemEnd && proposedEnd > itemStart;
    if (overlaps) {
      return {
        code: "HC-5",
        message: `Proposed slot ${proposedStart}-${proposedEnd} conflicts with fixed item at ${item.start_time}-${item.end_time}.`,
        conflicting_item: item,
      };
    }
  }
  return null;
}

// HC-6: Proposed end time must not exceed the day's end_time
export function hc6WithinDayWindow(
  proposedEndMinutes: number,
  input: SchedulerInput
): ConflictError | null {
  const dayEnd = timeToMinutes(input.end_time);
  if (proposedEndMinutes > dayEnd) {
    return {
      code: "HC-6",
      message: `Proposed end ${proposedEndMinutes}min exceeds day window end ${dayEnd}min.`,
    };
  }
  return null;
}

// HC-8: 다음 배치 항목까지 이동할 시간이 남아야 한다.
//
// HC-3/HC-4 는 **들어오는** 이동만 본다. gap 의 끝은 다음 항목의 시작 시각에
// 그대로 붙어 있으므로, 체류가 gap 을 꽉 채우면 이동시간이 0 분이 된다.
// 19:00 공연인데 18:59 까지 다른 동네에 있는 일정이 그렇게 만들어진다.
//
// 처음에는 고정 항목에만 걸었지만, 같은 일이 일반 항목 앞에서도 일어난다 —
// 식사 이연이 항목 앞에 구멍을 만들고 그 구멍에 후보가 들어가는 경로다.
// 고정이든 아니든 사람은 순간이동하지 못하므로 구분하지 않는다.
export function hc8InsertionEgressFits(
  candidateEndMinutes: number,
  egressMinutes: number,
  nextItemStartMinutes: number
): ConflictError | null {
  if (candidateEndMinutes + egressMinutes > nextItemStartMinutes) {
    return {
      code: "HC-8",
      message:
        `Candidate ends at ${candidateEndMinutes} and needs ${egressMinutes}min to reach ` +
        `the next placed item starting at ${nextItemStartMinutes}.`,
    };
  }
  return null;
}

// HC-9: 시간순으로 연속한 두 고정 일정 사이를 실제로 이동할 수 있어야 한다.
//
// HC-5 는 시간이 겹치는지만 본다. 10:45 에 끝나고 11:00 에 18km 떨어진 곳에서
// 시작하는 일정은 시계상으로는 겹치지 않지만 사람이 갈 수 없다.
//
// 고정 일정은 사용자가 정한 사실이다. 앞당기거나 늦추거나 줄이거나 지우지
// 않는다 — 대신 일정 생성을 실패시켜 사용자가 직접 고르게 한다.
export function hc9FixedPairReachable(
  earlierEndMinutes: number,
  travelMinutes:     number,
  laterStartMinutes: number
): ConflictError | null {
  if (earlierEndMinutes + travelMinutes > laterStartMinutes) {
    return {
      code: "HC-9",
      message:
        `Fixed item ends at ${earlierEndMinutes} and needs ${travelMinutes}min to reach ` +
        `the next fixed item starting at ${laterStartMinutes}.`,
    };
  }
  return null;
}

// HC-7: Total placed items (places + events) must not exceed max
export function hc7MaxItems(placed: ScheduledItem[]): ConflictError | null {
  const nonAffiliate = placed.filter((it) => it.item_type !== "affiliate");
  if (nonAffiliate.length >= HC7_MAX_ITEMS) {
    return {
      code: "HC-7",
      message: `Maximum items (${HC7_MAX_ITEMS}) reached.`,
    };
  }
  return null;
}
