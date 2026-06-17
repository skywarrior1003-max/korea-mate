// GoKoreaMate / gokoreamate.com — Zone Tracker
// TASK-013: Rule-based Scheduler v1
// Stateful class tracking zone continuity bonuses and penalties.

import type { ZoneId } from "./types";
import { ZONE_SAME_BONUS, ZONE_REVERSE_PENALTY } from "./constants";

export class ZoneTracker {
  private lastZoneId: ZoneId | null = null;
  private visitedZones: Set<ZoneId> = new Set();

  // Returns the continuity score adjustment for placing a candidate in zoneId.
  calculateBonus(zoneId: ZoneId): number {
    if (this.lastZoneId === null) return 0;

    if (this.lastZoneId === zoneId) {
      return ZONE_SAME_BONUS;
    }

    // Reverse penalty: moving back to a zone already visited (not just the last one)
    if (this.visitedZones.has(zoneId)) {
      return ZONE_REVERSE_PENALTY;
    }

    return 0;
  }

  // Call after committing a placement in zoneId.
  update(zoneId: ZoneId): void {
    if (this.lastZoneId !== null) {
      this.visitedZones.add(this.lastZoneId);
    }
    this.lastZoneId = zoneId;
  }

  reset(): void {
    this.lastZoneId = null;
    this.visitedZones.clear();
  }

  get currentZone(): ZoneId | null {
    return this.lastZoneId;
  }
}
