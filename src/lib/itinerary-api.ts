// Client-side fetch wrappers for the itinerary server API routes.
// Replaces direct Supabase table access in browser code.
// All writes go through the server (service_role), never directly to Supabase.

import type { ItineraryRow, PopularTrip } from "@/lib/supabase";

// ── helpers ──────────────────────────────────────────────────────────────────

function deviceHeader(deviceId: string): HeadersInit {
  return { "Content-Type": "application/json", "x-device-id": deviceId };
}

// ── Save: tries PUT (update existing), falls back to POST (insert new) ───────
// This replaces the old upsert pattern:
// - New itinerary: PUT → 404 → POST → 201
// - Existing own itinerary: PUT → 200
// - Foreign itinerary: PUT → 404 → POST → 409 → returns false
export async function apiSaveItinerary(
  row: ItineraryRow & { days: unknown },
  deviceId: string
): Promise<boolean> {
  const body = {
    id:           row.id,
    city:         row.city,
    start_date:   row.start_date,
    end_date:     row.end_date,
    travelers:    row.travelers,
    travel_style: row.travel_style,
    days:         row.days,
    trip_title:   row.trip_title,
  };

  // 1. Try UPDATE (conditional on id + device_id)
  const putRes = await fetch(`/api/itinerary/${row.id}`, {
    method:  "PUT",
    headers: deviceHeader(deviceId),
    body:    JSON.stringify(body),
  }).catch(() => null);

  if (putRes?.ok) return true;

  // 2. If not found (new itinerary), try INSERT
  if (putRes?.status === 404) {
    const postRes = await fetch("/api/itinerary", {
      method:  "POST",
      headers: deviceHeader(deviceId),
      body:    JSON.stringify(body),
    }).catch(() => null);
    return postRes?.status === 201;
  }

  return false;
}

// ── Fetch single itinerary (owner-only) ──────────────────────────────────────
// GET is owner-only — server returns 404 for non-owners.
// Always pass the caller's deviceId; omitting it returns 400.
export async function apiFetchItinerary(
  id: string,
  deviceId: string
): Promise<ItineraryRow | null> {
  const res = await fetch(`/api/itinerary/${id}`, {
    headers: { "x-device-id": deviceId },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as ItineraryRow;
}

// ── Update title ──────────────────────────────────────────────────────────────
export async function apiUpdateItineraryTitle(
  id: string,
  title: string,
  deviceId: string
): Promise<boolean> {
  const res = await fetch(`/api/itinerary/${id}`, {
    method:  "PATCH",
    headers: deviceHeader(deviceId),
    body:    JSON.stringify({ trip_title: title }),
  }).catch(() => null);
  return !!res?.ok;
}

// ── Fetch device's itinerary list ─────────────────────────────────────────────
export async function apiFetchItinerariesByDevice(
  deviceId: string
): Promise<ItineraryRow[]> {
  const res = await fetch("/api/itineraries", {
    headers: { "x-device-id": deviceId },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  return (await res.json()) as ItineraryRow[];
}

// ── Delete itinerary ──────────────────────────────────────────────────────────
export async function apiDeleteItinerary(
  id: string,
  deviceId: string
): Promise<boolean> {
  const res = await fetch(`/api/itinerary/${id}`, {
    method:  "DELETE",
    headers: { "x-device-id": deviceId },
  }).catch(() => null);
  return !!res?.ok;
}

// ── Popular trips ─────────────────────────────────────────────────────────────
export async function apiFetchPopularTrips(limit = 6): Promise<PopularTrip[]> {
  const res = await fetch(`/api/trips/popular?limit=${limit}`).catch(() => null);
  if (!res || !res.ok) return [];
  return (await res.json()) as PopularTrip[];
}
