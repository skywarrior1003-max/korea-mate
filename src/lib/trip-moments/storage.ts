// gokoreamate — Trip Moments Storage
// TASK-022: localStorage primary + Supabase best-effort sync
// Supabase trip_moments 테이블이 없으면 graceful fallback (localStorage만 사용)

import { supabase } from "../supabase";
import type { TripMoment } from "./types";

const LS_KEY = (itinId: string) => `koreamate_moments_${itinId}`;

// ── localStorage ─────────────────────────────────────────────────────────────

export function loadMoments(itinId: string): TripMoment[] {
  try {
    const raw = localStorage.getItem(LS_KEY(itinId));
    return raw ? (JSON.parse(raw) as TripMoment[]) : [];
  } catch { return []; }
}

function saveMomentsLocal(itinId: string, moments: TripMoment[]): void {
  try { localStorage.setItem(LS_KEY(itinId), JSON.stringify(moments)); } catch { /* quota exceeded 방어 */ }
}

// ── Supabase sync (best-effort) ───────────────────────────────────────────────

async function syncToSupabase(moment: TripMoment): Promise<boolean> {
  try {
    const { error } = await supabase.from("trip_moments").upsert(
      {
        moment_id:      moment.moment_id,
        itinerary_id:   moment.itinerary_id,
        device_id:      moment.device_id,
        memo:           moment.memo,
        category:       moment.category,
        lat:            moment.lat,
        lng:            moment.lng,
        location_label: moment.location_label,
        captured_at:    moment.captured_at,
        day_number:     moment.day_number,
        // photo_data는 크기 제한 방어를 위해 제외 — Supabase Storage 미구성 시 localStorage만 사용
      },
      { onConflict: "moment_id" },
    );
    return !error;
  } catch { return false; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function addMoment(
  itinId:  string,
  moment:  TripMoment,
): Promise<TripMoment[]> {
  const existing = loadMoments(itinId);
  const updated  = [moment, ...existing];
  saveMomentsLocal(itinId, updated);

  // Supabase 비동기 sync (실패해도 localStorage는 이미 저장됨)
  syncToSupabase(moment).then(ok => {
    if (ok) {
      const fresh = loadMoments(itinId).map(m =>
        m.moment_id === moment.moment_id ? { ...m, synced: true } : m,
      );
      saveMomentsLocal(itinId, fresh);
    }
  });

  return updated;
}

export async function deleteMoment(
  itinId:   string,
  momentId: string,
): Promise<TripMoment[]> {
  const updated = loadMoments(itinId).filter(m => m.moment_id !== momentId);
  saveMomentsLocal(itinId, updated);

  try {
    await supabase.from("trip_moments").delete().eq("moment_id", momentId);
  } catch { /* best-effort */ }

  return updated;
}

// ── 사진 canvas 압축 ─────────────────────────────────────────────────────────
// 패키지 추가 없이 브라우저 canvas API로 max 600px JPEG 75% 압축

export function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

// ── GPS 좌표 → 가독 레이블 ────────────────────────────────────────────────────

export function formatCoord(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "위치 정보 없음";
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lng).toFixed(2)}°${lngDir}`;
}
