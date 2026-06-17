// GoKoreaMate / gokoreamate.com — Anchor Placer
// TASK-013: Rule-based Scheduler v1
// Converts TripAnchors and FixedEventItems into ScheduledItems (P1/P2 pipeline steps).

import type {
  SchedulerInput,
  ScheduledItem,
  TripAnchor,
  FixedEventItem,
  ConflictError,
} from "./types";
import { timeToMinutes } from "./utils";
import { hc5NoAnchorConflict } from "./constraint-validator";

// Places all TripAnchors as fixed ScheduledItems.
export function placeAnchors(
  input: SchedulerInput,
  placed: ScheduledItem[]
): { items: ScheduledItem[]; error: ConflictError | null } {
  const anchors = input.anchors ?? [];
  const result: ScheduledItem[] = [];

  for (const anchor of anchors) {
    const startMin = timeToMinutes(anchor.start_time);
    const endMin   = timeToMinutes(anchor.end_time);
    const conflict = hc5NoAnchorConflict(startMin, endMin, [...placed, ...result]);
    if (conflict) return { items: [], error: conflict };

    result.push({
      slot_order:               0,
      item_type:                "place",
      source:                   "anchor",
      place_id:                 anchor.place_id,
      start_time:               anchor.start_time,
      end_time:                 anchor.end_time,
      stay_minutes:             endMin - startMin,
      travel_minutes_from_prev: 0,
      is_fixed:                 true,
      stay_source:              "category_default",
    });
  }

  return { items: result, error: null };
}

// Places all FixedEventItems as fixed ScheduledItems.
export function placeFixedEvents(
  input: SchedulerInput,
  placed: ScheduledItem[]
): { items: ScheduledItem[]; error: ConflictError | null } {
  const events = input.fixed_events ?? [];
  const result: ScheduledItem[] = [];

  for (const ev of events) {
    const startMin = timeToMinutes(ev.start_time);
    const endMin   = timeToMinutes(ev.end_time);
    const conflict = hc5NoAnchorConflict(startMin, endMin, [...placed, ...result]);
    if (conflict) return { items: [], error: conflict };

    result.push({
      slot_order:               0,
      item_type:                "event",
      source:                   "fixed_event",
      event_id:                 ev.event_id,
      start_time:               ev.start_time,
      end_time:                 ev.end_time,
      stay_minutes:             endMin - startMin,
      travel_minutes_from_prev: 0,
      is_fixed:                 true,
      zone_id:                  ev.zone_id,
      stay_source:              "category_default",
    });
  }

  return { items: result, error: null };
}

// Collects anchor place_ids for candidate filtering.
export function collectAnchorPlaceIds(input: SchedulerInput): Set<string> {
  const ids = new Set<string>();
  for (const anchor of input.anchors ?? []) {
    ids.add(anchor.place_id);
  }
  return ids;
}
