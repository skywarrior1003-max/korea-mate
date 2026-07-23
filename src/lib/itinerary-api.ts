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
export async function apiFetchPopularTrips(
  limit = 6,
  city?: string,
  travelStyle?: string,
): Promise<PopularTrip[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (city)        params.set("city",         city);
  if (travelStyle) params.set("travel_style", travelStyle);
  const res = await fetch(`/api/trips/popular?${params}`).catch(() => null);
  if (!res || !res.ok) return [];
  return (await res.json()) as PopularTrip[];
}

// ── Copy shared itinerary to caller's device ──────────────────────────────────
// Throws Error("TRIP_NOT_AVAILABLE") on 404, Error("COPY_FAILED") on all other failures.
export async function apiCopyItinerary(
  shareId: string,
  deviceId: string
): Promise<{ id: string }> {
  let res: Response | null = null;
  try {
    res = await fetch("/api/itinerary/copy", {
      method: "POST",
      headers: deviceHeader(deviceId),
      body: JSON.stringify({ share_id: shareId }),
    });
  } catch {
    throw new Error("COPY_FAILED");
  }

  if (res.status === 404) throw new Error("TRIP_NOT_AVAILABLE");
  if (res.status !== 201) throw new Error("COPY_FAILED");

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("COPY_FAILED");
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof (data as Record<string, unknown>).id !== "string"
  ) {
    throw new Error("COPY_FAILED");
  }

  return { id: (data as { id: string }).id };
}

// ── Helpful vote ──────────────────────────────────────────────────────────────
export async function apiHelpfulVote(
  itineraryId: string,
  deviceId:    string,
): Promise<{ added: boolean; helpful_count: number } | null> {
  const res = await fetch(`/api/itinerary/helpful/${itineraryId}`, {
    method:  "PATCH",
    headers: { "x-device-id": deviceId },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as { added: boolean; helpful_count: number };
}
