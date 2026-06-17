// GoKoreaMate / gokoreamate.com — Affiliate Injector
// TASK-013: Rule-based Scheduler v1
// Injects affiliate cards into free gaps after greedy placement.

import type { ScheduledItem, SchedulerInput, AffiliateContext } from "./types";
import { timeToMinutes, minutesToTime } from "./utils";
import {
  AFFILIATE_MIN_GAP_MINUTES,
  AFFILIATE_ANCHOR_BUFFER_MIN,
  AFFILIATE_STAY_MINUTES,
} from "./constants";
import { findFreeGaps } from "./timeline-builder";

export function injectAffiliates(
  placed: ScheduledItem[],
  input: SchedulerInput
): ScheduledItem[] {
  const ctx: AffiliateContext | undefined = input.affiliate_context;
  if (!ctx || ctx.affiliate_link_ids.length === 0) return [];

  const anchorTimes = (input.anchors ?? []).flatMap((a) => [
    timeToMinutes(a.start_time),
    timeToMinutes(a.end_time),
  ]);

  const gaps = findFreeGaps(placed, input);
  const injected: ScheduledItem[] = [];
  let linkIndex = 0;

  for (const gap of gaps) {
    if (linkIndex >= ctx.max_cards) break;
    if (linkIndex >= ctx.affiliate_link_ids.length) break;
    if (gap.duration_minutes < AFFILIATE_MIN_GAP_MINUTES) continue;

    // Skip if gap is within AFFILIATE_ANCHOR_BUFFER_MIN of any anchor
    const tooCloseToAnchor = anchorTimes.some(
      (at) =>
        Math.abs(gap.start_minutes - at) < AFFILIATE_ANCHOR_BUFFER_MIN ||
        Math.abs(gap.end_minutes   - at) < AFFILIATE_ANCHOR_BUFFER_MIN
    );
    if (tooCloseToAnchor) continue;

    const startTime = minutesToTime(gap.start_minutes);
    const endTime   = minutesToTime(gap.start_minutes + AFFILIATE_STAY_MINUTES);

    injected.push({
      slot_order:               0,
      item_type:                "affiliate",
      source:                   "affiliate",
      affiliate_link_id:        ctx.affiliate_link_ids[linkIndex],
      start_time:               startTime,
      end_time:                 endTime,
      stay_minutes:             AFFILIATE_STAY_MINUTES,
      travel_minutes_from_prev: 0,
      is_fixed:                 false,
      stay_source:              "category_default",
    });

    linkIndex++;
  }

  return injected;
}
