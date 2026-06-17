// GoKoreaMate / gokoreamate.com — Travel Time Estimator
// TASK-013: Rule-based Scheduler v1
// Estimates travel time between two coordinates using distance thresholds.

import type { Coordinate } from "./types";
import { haversineDistance } from "./utils";
import { TRAVEL_TIME_TABLE } from "./constants";

export function estimateTravelMinutes(from: Coordinate, to: Coordinate): number {
  const distanceMeters = haversineDistance(from, to);

  for (const { maxMeters, minutes } of TRAVEL_TIME_TABLE) {
    if (distanceMeters <= maxMeters) {
      return minutes;
    }
  }

  // Fallback — should not reach here due to Infinity entry in table
  return 40;
}
