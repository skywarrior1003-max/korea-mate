// GoKoreaMate / gokoreamate.com — Timeline Builder
// TASK-013: Rule-based Scheduler v1
// Builds the ordered ScheduledItem list from placed items and resolves slot_order.

import type { ScheduledItem, SchedulerInput } from "./types";
import { timeToMinutes, minutesToTime } from "./utils";

export interface TimelineGap {
  start_minutes: number;
  end_minutes: number;
  duration_minutes: number;
}

// Returns free gaps between placed items (sorted by start_time).
export function findFreeGaps(
  placed: ScheduledItem[],
  input: SchedulerInput
): TimelineGap[] {
  const dayStart = timeToMinutes(input.start_time);
  const dayEnd   = timeToMinutes(input.end_time);

  const sorted = [...placed].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  );

  const gaps: TimelineGap[] = [];
  let cursor = dayStart;

  for (const item of sorted) {
    const itemStart = timeToMinutes(item.start_time);
    if (itemStart > cursor) {
      gaps.push({
        start_minutes:    cursor,
        end_minutes:      itemStart,
        duration_minutes: itemStart - cursor,
      });
    }
    cursor = Math.max(cursor, timeToMinutes(item.end_time));
  }

  if (cursor < dayEnd) {
    gaps.push({
      start_minutes:    cursor,
      end_minutes:      dayEnd,
      duration_minutes: dayEnd - cursor,
    });
  }

  return gaps;
}

// Assigns slot_order and returns a sorted final list.
export function buildTimeline(placed: ScheduledItem[]): ScheduledItem[] {
  const sorted = [...placed].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  );
  return sorted.map((item, idx) => ({ ...item, slot_order: idx + 1 }));
}

// Creates a ScheduledItem shell for a candidate placed at a given time.
export function makeScheduledItem(
  partial: Omit<ScheduledItem, "slot_order">
): ScheduledItem {
  return { slot_order: 0, ...partial };
}

// Returns "HH:MM" end time given a start (HH:MM) and stay duration.
export function calcEndTime(startTime: string, stayMinutes: number): string {
  return minutesToTime(timeToMinutes(startTime) + stayMinutes);
}
