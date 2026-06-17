// GoKoreaMate / gokoreamate.com — Candidate Filter
// TASK-013: Rule-based Scheduler v1
// Filters and deduplicates candidates against already-placed items.

import type { NearMeCandidate, ScheduledItem } from "./types";

// Removes candidates already placed in the schedule.
export function filterPlaced(
  candidates: NearMeCandidate[],
  placed: ScheduledItem[]
): NearMeCandidate[] {
  const placedIds = new Set(
    placed
      .filter((it) => it.item_type === "place")
      .map((it) => it.place_id)
  );
  return candidates.filter((c) => !placedIds.has(c.place_id));
}

// Removes candidates whose anchor place_ids are already covered by anchors.
export function filterAnchorPlaces(
  candidates: NearMeCandidate[],
  anchorPlaceIds: Set<string>
): NearMeCandidate[] {
  return candidates.filter((c) => !anchorPlaceIds.has(c.place_id));
}

// Returns candidates sorted by score descending (highest priority first).
export function sortByScore(candidates: NearMeCandidate[]): NearMeCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}

// Combined: filter placed + anchor + sort.
export function prepareGreedyCandidates(
  candidates: NearMeCandidate[],
  placed: ScheduledItem[],
  anchorPlaceIds: Set<string>
): NearMeCandidate[] {
  const withoutPlaced  = filterPlaced(candidates, placed);
  const withoutAnchors = filterAnchorPlaces(withoutPlaced, anchorPlaceIds);
  return sortByScore(withoutAnchors);
}
