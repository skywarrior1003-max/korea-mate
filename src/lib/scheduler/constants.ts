// GoKoreaMate / gokoreamate.com — Scheduler Engine Constants
// TASK-013: Rule-based Scheduler v1

import type { PlaceCategory, TripPace } from "./types";

// ─── Category Stay Minutes (base, before pace multiplier) ────────────────────

export const CATEGORY_STAY_MINUTES: Record<PlaceCategory, number> = {
  attraction:  75,
  food:        60,
  cafe:        40,
  temple:      60,
  walking:     45,
  nightview:   40,
  kpop:        60,
  shopping:    60,
  event:       60,
  rainy_day:   60,
};

// ─── Pace Multiplier ──────────────────────────────────────────────────────────

export const PACE_MULTIPLIER: Record<TripPace, number> = {
  relaxed: 1.3,
  normal:  1.0,
  packed:  0.8,
};

// ─── Travel Time Thresholds (meters → minutes) ───────────────────────────────

export const TRAVEL_TIME_TABLE: Array<{ maxMeters: number; minutes: number }> = [
  { maxMeters:   500, minutes:  8 },
  { maxMeters:  1000, minutes: 15 },
  { maxMeters:  3000, minutes: 20 },
  { maxMeters:  7000, minutes: 30 },
  { maxMeters: Infinity, minutes: 40 },
];

// ─── Zone Continuity Scoring ──────────────────────────────────────────────────

export const ZONE_SAME_BONUS     =  15;
export const ZONE_REVERSE_PENALTY = -10;

// ─── Affiliate Injection Rules ────────────────────────────────────────────────

export const AFFILIATE_MIN_GAP_MINUTES    = 15;
export const AFFILIATE_ANCHOR_BUFFER_MIN  = 30;  // minutes before/after anchor
export const AFFILIATE_STAY_MINUTES       = 5;   // display time only

// ─── Hard Constraint Limits ───────────────────────────────────────────────────

export const HC7_MAX_ITEMS = 20;

// ─── Scheduler Meta ───────────────────────────────────────────────────────────

export const SCHEDULER_VERSION = "rule-based-v1" as const;
