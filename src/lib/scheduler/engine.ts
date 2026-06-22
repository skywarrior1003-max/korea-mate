// GoKoreaMate / gokoreamate.com — Scheduler Engine
// TASK-013: Rule-based Scheduler v1
// 7-module pipeline orchestrator: Anchor → Event → Greedy → Affiliate → Timeline

import type {
  SchedulerInput,
  SchedulerResult,
  ScheduledItem,
  NearMeCandidate,
} from "./types";
import { SCHEDULER_VERSION } from "./constants";
import { timeToMinutes, minutesToTime } from "./utils";
import { placeAnchors, placeFixedEvents, collectAnchorPlaceIds } from "./anchor-placer";
import { prepareGreedyCandidates } from "./candidate-filter";
import { ZoneTracker } from "./zone-tracker";
import { estimateTravelMinutes } from "./travel-time-estimator";
import { resolveStayMinutes } from "./slot-allocator";
import { PriorityQueue } from "./priority-queue";
import { injectAffiliates } from "./affiliate-injector";
import { buildTimeline, findFreeGaps } from "./timeline-builder";
import {
  hc1NoDuplicate,
  hc3TravelFits,
  hc4StayFits,
  hc6WithinDayWindow,
  hc7MaxItems,
} from "./constraint-validator";

// ─── Greedy Candidate with adjusted score ────────────────────────────────────

interface ScoredCandidate extends NearMeCandidate {
  adjusted_score: number;
  travel_minutes: number;
  stay_minutes_resolved: number;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runScheduler(input: SchedulerInput): SchedulerResult {
  const placed: ScheduledItem[] = [];

  // ── P1: Place Anchors ──────────────────────────────────────────────────────

  const { items: anchorItems, error: anchorError } = placeAnchors(input, placed);
  if (anchorError) return { success: false, error: anchorError };
  placed.push(...anchorItems);

  // ── P2: Place Fixed Events ─────────────────────────────────────────────────

  const { items: eventItems, error: eventError } = placeFixedEvents(input, placed);
  if (eventError) return { success: false, error: eventError };
  placed.push(...eventItems);

  // ── P3: Greedy Slot Fill ───────────────────────────────────────────────────

  const anchorPlaceIds = collectAnchorPlaceIds(input);
  const zoneTracker    = new ZoneTracker();

  // Seed zone tracker with the first placed item's zone (if any)
  const firstWithZone = placed.find((it) => it.zone_id !== undefined);
  if (firstWithZone?.zone_id) zoneTracker.update(firstWithZone.zone_id);

  const pq = new PriorityQueue<NearMeCandidate & { score: number }>();
  for (const c of prepareGreedyCandidates(input.candidates, placed, anchorPlaceIds)) {
    pq.enqueue(c);
  }

  // Iterate over free gaps, greedily filling each one
  const greedyLoop = () => {
    const gaps = findFreeGaps(placed, input);

    for (const gap of gaps) {
      if (pq.isEmpty()) break;

      const hc7 = hc7MaxItems(placed);
      if (hc7) break;

      // Score candidates with zone bonus applied, then pick best fit for this gap
      const candidates = pq.toArray();
      const scored: ScoredCandidate[] = [];

      for (const c of candidates) {
        const zoneBonus = c.zone_id !== undefined ? zoneTracker.calculateBonus(c.zone_id) : 0;

        // Estimate travel from the last placed item to this candidate
        const lastItem = [...placed].sort(
          (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        ).at(-1);

        // We need coordinates of the last item — anchors don't carry coords,
        // so fall back to base_coordinate when no candidate coord is available.
        const fromCoord =
          lastItem?.item_type === "place"
            ? (input.candidates.find((c2) => c2.place_id === lastItem.place_id)?.coordinate ??
               input.base_coordinate)
            : input.base_coordinate;

        const travelMin = estimateTravelMinutes(fromCoord, c.coordinate);
        const { stay_minutes: stayMin } = resolveStayMinutes(c, input);

        const needed = travelMin + stayMin;
        if (needed > gap.duration_minutes) continue;

        // HC-3 / HC-4
        if (hc3TravelFits(travelMin, gap.duration_minutes) !== null) continue;
        if (hc4StayFits(travelMin, stayMin, gap.duration_minutes) !== null) continue;

        // Cart preferred_time_slot 제약 (소프트 — 슬롯 미부합 시 건너뜀)
        const preferredItem = input.preferred_items?.find(p => p.place_id === c.place_id);
        if (preferredItem?.preferred_time_slot) {
          const gapHour = Math.floor(gap.start_minutes / 60);
          const slotOk =
            (preferredItem.preferred_time_slot === "morning"   && gapHour < 12) ||
            (preferredItem.preferred_time_slot === "afternoon" && gapHour >= 12 && gapHour < 17) ||
            (preferredItem.preferred_time_slot === "evening"   && gapHour >= 17);
          if (!slotOk) continue;
        }

        scored.push({
          ...c,
          adjusted_score:       c.score + zoneBonus,
          travel_minutes:       travelMin,
          stay_minutes_resolved: stayMin,
        });
      }

      if (scored.length === 0) continue;

      // Pick the highest adjusted_score candidate
      scored.sort((a, b) => b.adjusted_score - a.adjusted_score);
      const best = scored[0];

      // HC-1: no duplicate
      const hc1 = hc1NoDuplicate(best, placed);
      if (hc1) continue;

      // Compute start/end times
      const slotStart = minutesToTime(gap.start_minutes + best.travel_minutes);
      const slotEnd   = minutesToTime(
        gap.start_minutes + best.travel_minutes + best.stay_minutes_resolved
      );

      // HC-6: within day window
      if (
        hc6WithinDayWindow(
          gap.start_minutes + best.travel_minutes + best.stay_minutes_resolved,
          input
        ) !== null
      ) continue;

      const newItem: ScheduledItem = {
        slot_order:               0,
        item_type:                "place",
        source:                   "greedy",
        place_id:                 best.place_id,
        start_time:               slotStart,
        end_time:                 slotEnd,
        stay_minutes:             best.stay_minutes_resolved,
        travel_minutes_from_prev: best.travel_minutes,
        is_fixed:                 false,
        zone_id:                  best.zone_id,
        stay_source:              resolveStayMinutes(best, input).stay_source,
      };

      placed.push(newItem);
      if (best.zone_id !== undefined) zoneTracker.update(best.zone_id);

      // Remove placed candidate from the queue
      pq.rebuild(
        pq.toArray().filter((c) => c.place_id !== best.place_id)
      );
    }
  };

  // Run greedy fill (multiple passes to fill gaps left by previous placements)
  greedyLoop();

  // ── P4: Affiliate Injection ────────────────────────────────────────────────

  const affiliateItems = injectAffiliates(placed, input);
  placed.push(...affiliateItems);

  // ── P5: Build Final Timeline ───────────────────────────────────────────────

  const finalItems = buildTimeline(placed);

  return {
    success: true,
    data: {
      trip_date:         input.trip_date,
      items:             finalItems,
      ai_used:           false,
      scheduler_version: SCHEDULER_VERSION,
      generated_at:      new Date().toISOString(),
    },
  };
}
