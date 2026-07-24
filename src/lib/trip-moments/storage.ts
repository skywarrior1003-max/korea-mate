// gokoreamate — Trip Moments Storage
// PHASE 1-B: 서버 text SSOT + localStorage photo/pending fallback
//
// 저장 흐름:
//   addMoment           → POST /api/trip-moments → 성공 synced=true, 실패 pending 유지
//   deleteMoment        → DELETE /api/trip-moments/:id → 성공 서버+로컬 제거, 실패 롤백+throw
//   loadMomentsFromServer → GET /api/trip-moments → 서버+로컬 병합
//
// 병합 규칙:
//   - 서버 moments가 text SSOT (memo, category, GPS)
//   - 로컬에 동일 moment_id가 있으면 photo_data를 서버 항목에 주입
//   - 서버에 없는 로컬 moments (pending 또는 photo-only)는 목록에 보존
//
// photo_data 는 서버에 전송하지 않음 — localStorage에만 보존

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
  try { localStorage.setItem(LS_KEY(itinId), JSON.stringify(moments)); } catch {}
}

// ── 서버 → TripMoment 변환 ───────────────────────────────────────────────────

function rowToMoment(r: Record<string, unknown>, deviceId: string, itinId: string): TripMoment {
  return {
    moment_id:      String(r.moment_id ?? ""),
    itinerary_id:   String(r.itinerary_id ?? itinId),
    device_id:      deviceId,
    photo_data:     null,
    memo:           String(r.memo ?? ""),
    category:       (r.category as TripMoment["category"]) ?? "random",
    lat:            typeof r.lat === "number" ? r.lat : null,
    lng:            typeof r.lng === "number" ? r.lng : null,
    location_label: String(r.location_label ?? ""),
    captured_at:    String(r.captured_at ?? new Date().toISOString()),
    day_number:     typeof r.day_number === "number" ? r.day_number : null,
    synced:         true,
  };
}

// ── 병합: 서버 기준 + 로컬 photo_data 주입 + 로컬 전용 보존 ─────────────────

function mergeMoments(serverMoments: TripMoment[], localMoments: TripMoment[]): TripMoment[] {
  const localMap  = new Map(localMoments.map(m => [m.moment_id, m]));
  const serverIds = new Set(serverMoments.map(m => m.moment_id));

  const merged = serverMoments.map(sm => {
    const local = localMap.get(sm.moment_id);
    return local?.photo_data ? { ...sm, photo_data: local.photo_data } : sm;
  });

  // 서버에 없는 로컬 moments (pending · photo-only) 보존
  const localOnly = localMoments.filter(m => !serverIds.has(m.moment_id));
  return [...localOnly, ...merged];
}

// ── Public API ────────────────────────────────────────────────────────────────

// 재접속 시 서버 로드 후 로컬과 병합. 서버 실패 시 로컬 반환.
export async function loadMomentsFromServer(
  itinId:   string,
  deviceId: string,
): Promise<TripMoment[]> {
  const local = loadMoments(itinId);
  try {
    const res = await fetch(
      `/api/trip-moments?itinerary_id=${encodeURIComponent(itinId)}`,
      { headers: { "x-device-id": deviceId } },
    );
    if (!res.ok) return local;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const serverMoments = rows.map(r => rowToMoment(r, deviceId, itinId));
    const merged = mergeMoments(serverMoments, local);
    saveMomentsLocal(itinId, merged);
    return merged;
  } catch { return local; }
}

// moment 추가: 로컬 우선 저장 후 서버 POST. 중복 moment_id 방지.
export async function addMoment(
  itinId:   string,
  moment:   TripMoment,
  deviceId: string,
): Promise<TripMoment[]> {
  const existing = loadMoments(itinId);
  if (existing.some(m => m.moment_id === moment.moment_id)) return existing;

  const withPending = [moment, ...existing];
  saveMomentsLocal(itinId, withPending);

  try {
    const res = await fetch("/api/trip-moments", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body: JSON.stringify({
        moment_id:      moment.moment_id,
        itinerary_id:   moment.itinerary_id,
        memo:           moment.memo,
        category:       moment.category,
        lat:            moment.lat,
        lng:            moment.lng,
        location_label: moment.location_label,
        captured_at:    moment.captured_at,
        day_number:     moment.day_number,
        // photo_data 전송 금지
      }),
    });
    if (res.ok) {
      const synced = loadMoments(itinId).map(m =>
        m.moment_id === moment.moment_id ? { ...m, synced: true } : m,
      );
      saveMomentsLocal(itinId, synced);
      return synced;
    }
  } catch { /* 서버 실패 — pending 상태 유지 */ }

  return loadMoments(itinId);
}

// moment 삭제: 낙관적 로컬 제거 후 서버 DELETE. 실패 시 롤백 + throw.
// 호출자가 사용자에게 실패를 알려야 함 (조용한 데이터 손실 방지).
export async function deleteMoment(
  itinId:   string,
  momentId: string,
  deviceId: string,
): Promise<TripMoment[]> {
  const before = loadMoments(itinId);
  const target = before.find(m => m.moment_id === momentId);
  const optimistic = before.filter(m => m.moment_id !== momentId);
  saveMomentsLocal(itinId, optimistic);

  // 서버에 저장된 적 없는 로컬 전용 moment는 서버 호출 없이 제거
  if (target && !target.synced) return optimistic;

  try {
    const res = await fetch(`/api/trip-moments/${encodeURIComponent(momentId)}`, {
      method:  "DELETE",
      headers: { "x-device-id": deviceId },
    });
    if (res.ok) return optimistic;
    saveMomentsLocal(itinId, before);
    throw new Error("DELETE_FAILED");
  } catch (e) {
    if ((e as Error).message !== "DELETE_FAILED") {
      saveMomentsLocal(itinId, before);
    }
    throw new Error("DELETE_FAILED");
  }
}

// ── 사진 canvas 압축 (미리보기용: base64 반환, localStorage 저장) ────────────
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

// ── Upload-grade 압축 (서버 전송용: Blob 반환, multipart 전용) ──────────────
// base64는 임시 미리보기 외 서버 전송 금지. 이 함수는 Blob만 반환.

export const COMPRESS_MAX_LONG_PX   = 1920;
export const COMPRESS_MAX_BYTES     = 1_048_576; // 1 MB (서버 하드 한도)
export const COMPRESS_QUALITY_STEPS = [0.82, 0.77, 0.72] as const;
export const COMPRESS_FALLBACK_LONG = 1600;

export function calcResizeDimensions(
  srcW:    number,
  srcH:    number,
  maxLong = COMPRESS_MAX_LONG_PX,
): { w: number; h: number } {
  const long = Math.max(srcW, srcH);
  if (long <= maxLong) return { w: srcW, h: srcH }; // 확대 없음
  const scale = maxLong / long;
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

// encoder를 주입받아 Canvas 없이 단위 테스트 가능한 핵심 로직
export async function runCompressSteps(
  srcW:   number,
  srcH:   number,
  encode: (w: number, h: number, quality: number) => Promise<Blob>,
): Promise<Blob> {
  for (const maxLong of [COMPRESS_MAX_LONG_PX, COMPRESS_FALLBACK_LONG]) {
    const { w, h } = calcResizeDimensions(srcW, srcH, maxLong);
    for (const quality of COMPRESS_QUALITY_STEPS) {
      const blob = await encode(w, h, quality);
      if (blob.size <= COMPRESS_MAX_BYTES) return blob;
    }
  }
  throw new Error("Cannot compress photo below 1 MB limit");
}

// 서버 업로드 전용 압축. Canvas 재생성으로 EXIF 자동 제거 (서버 stripJpegApp1 이중 보호).
export async function compressPhotoBlob(file: File): Promise<Blob> {
  const objUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload  = () => { URL.revokeObjectURL(objUrl); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("image load failed")); };
    el.src = objUrl;
  });
  return runCompressSteps(img.naturalWidth, img.naturalHeight, (w, h, quality) => {
    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        quality,
      ),
    );
  });
}

// ── GPS 좌표 → 가독 레이블 ────────────────────────────────────────────────────

export function formatCoord(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "위치 정보 없음";
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lng).toFixed(2)}°${lngDir}`;
}
