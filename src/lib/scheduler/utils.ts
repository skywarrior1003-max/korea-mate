// GoKoreaMate / gokoreamate.com — Scheduler Utility Functions
// TASK-013: Rule-based Scheduler v1

import type { Coordinate } from "./types";

// ─── Haversine Distance ───────────────────────────────────────────────────────

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

// ─── Time Conversion ──────────────────────────────────────────────────────────

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Gap Calculation ──────────────────────────────────────────────────────────

export function gapMinutes(endTime: string, startTime: string): number {
  return timeToMinutes(startTime) - timeToMinutes(endTime);
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

export function roundUp5(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}
