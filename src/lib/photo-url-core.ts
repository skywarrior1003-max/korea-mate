// Route business logic — injectable for unit testing

import { createMomentSignedUrl } from "./photo-url.ts";

// Injectable interface for route-level unit testing
interface QueryChain {
  select(fields: string): QueryChain;
  eq(col: string, val: unknown): QueryChain;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
}

export interface AdminLike {
  from(table: string): QueryChain;
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, exp: number): Promise<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>;
    };
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handlePhotoUrlCore(
  momentId: string,
  deviceId: string,
  admin: AdminLike,
): Promise<Response> {
  // 1단계: moment 존재 + device_id 확인 → itinerary_id, storage_path 취득
  const { data: moment, error: momentErr } = (await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id, storage_path")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle()) as {
    data: { moment_id: string; itinerary_id: string; storage_path: string | null } | null;
    error: { message?: string; code?: string } | null;
  };

  if (momentErr) {
    console.error("[trip-moments/:momentId/photo-url GET] db error (moment):", momentErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (!moment) return json({ error: "Not found" }, 404);

  // 2단계: itinerary 소유권 재확인 (FK 부재 보완)
  const { data: itinerary, error: itinErr } = (await admin
    .from("itineraries")
    .select("id")
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle()) as {
    data: { id: string } | null;
    error: { message?: string; code?: string } | null;
  };

  if (itinErr) {
    console.error("[trip-moments/:momentId/photo-url GET] db error (itinerary):", itinErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (!itinerary) return json({ error: "Not found" }, 404);

  // 3단계: storage_path 없으면 404
  if (!moment.storage_path) return json({ error: "Not found" }, 404);

  // 4단계: signed URL 생성
  const result = await createMomentSignedUrl(admin.storage, moment.storage_path);
  if (typeof result === "string") {
    console.error("[trip-moments/:momentId/photo-url GET] signed URL failed:", result);
    return json({ error: "Failed to generate photo URL" }, 500);
  }

  return json(result);
}
