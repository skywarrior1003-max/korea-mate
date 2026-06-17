// GoKoreaMate / gokoreamate.com — Hard Constraint Validator
// TASK-013: Rule-based Scheduler v1
// HC-1 ~ HC-7: each constraint is a named predicate returning ConflictError | null

import type {
  ScheduledItem,
  SchedulerInput,
  ConflictError,
  NearMeCandidate,
} from "./types";
import { timeToMinutes } from "./utils";
import { HC7_MAX_ITEMS } from "./constants";

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
