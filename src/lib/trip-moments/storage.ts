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
    // 서버는 storage_path 원문 대신 has_photo boolean 만 준다
    has_photo:      r.has_photo === true,
    // 공개 여부의 정본은 서버다. 이 값을 버리면 화면이 "지금 무엇이 공개인가"
    // 를 알 수 없어, 이미 공개인 Memory 에도 계속 "공개하기" 를 그리고
    // 재공개 정리(reconciliation)도 지난 상태를 볼 수 없게 된다.
    is_public:      r.is_public === true,
    // 사람이 읽는 장소 이름. 이것도 서버가 주는데 버리고 있었다 — 그래서 공개
    // 선택 화면의 모든 줄이 "Day 1" 로만 보였다. 좌표 문자열(`location_label`)
    // 과 다른 값이고, 없는 Memory 가 더 흔하므로 없으면 없는 대로 둔다.
    place_name:     typeof r.place_name === "string" && r.place_name.trim() !== "" ? r.place_name : null,
    city_spot_id:   typeof r.city_spot_id === "number" ? r.city_spot_id : null,
    stop_key:       typeof r.stop_key === "string" && r.stop_key.trim() !== "" ? r.stop_key : null,
  };
}

// ── 병합: 서버 기준 + 로컬 photo_data 주입 + 로컬 전용 보존 ─────────────────

function mergeMoments(serverMoments: TripMoment[], localMoments: TripMoment[]): TripMoment[] {
  const localMap  = new Map(localMoments.map(m => [m.moment_id, m]));
  const serverIds = new Set(serverMoments.map(m => m.moment_id));

  const merged = serverMoments.map(sm => {
    const local = localMap.get(sm.moment_id);
    // 서버 has_photo=true 를 우선 보존한다 (재업로드 방지의 근거)
    const base = { ...sm, has_photo: sm.has_photo === true || local?.has_photo === true };
    // 사진은 로컬에만 있다 — 서버 응답에는 없으므로 덮어쓰지 않고 얹는다.
    const withFirst = local?.photo_data ? { ...base, photo_data: local.photo_data } : base;
    return local?.photo_data_extra?.length
      ? { ...withFirst, photo_data_extra: local.photo_data_extra }
      : withFirst;
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
// ── 사진 업로드 ───────────────────────────────────────────────────────────────
//
// 메타데이터 POST 는 photo_data 를 보내지 않는다(전송 금지). 사진은 별도
// multipart 엔드포인트로만 올린다.
//   POST /api/trip-moments/:momentId/photo  ·  field "photo"  ·  x-device-id 필수
//   JPEG 전용 · 1MB (서버가 MIME·SOI·구조를 재검증하고 EXIF 를 제거한다)
//
// 응답은 {ok:true} 뿐이므로 storage_path 를 받지 않는다. 2xx 면 has_photo=true
// 로 표시하고, 다음 서버 로드에서 GET 의 has_photo 가 이를 확인해 준다.

/** data:image/jpeg data URL → Blob. 형식이 아니면 null (임의 URL 업로드 차단) */
export function jpegDataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m || !m[1]) return null;
  try {
    const bin = atob(m[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    if (buf.length === 0 || buf.length > COMPRESS_MAX_BYTES) return null;
    return new Blob([buf], { type: "image/jpeg" });
  } catch { return null; }
}

/** 사진 1장을 서버에 올린다. 성공 여부만 반환하고 서버 원문 오류를 노출하지 않는다. */
export async function uploadMomentPhoto(
  momentId: string,
  photoData: string,
  deviceId: string,
): Promise<boolean> {
  const blob = jpegDataUrlToBlob(photoData);
  if (!blob) return false;
  try {
    const fd = new FormData();
    fd.append("photo", blob, `${momentId}.jpg`);
    const res = await fetch(`/api/trip-moments/${encodeURIComponent(momentId)}/photo`, {
      method:  "POST",
      headers: { "x-device-id": deviceId },
      body:    fd,
    });
    return res.ok;
  } catch {
    // 오프라인·네트워크 오류 — 로컬 photo_data 는 유지되므로 다음 큐에서 재시도된다
    return false;
  }
}

/**
 * 두 번째 이후 사진 한 장을 올린다 (migration 052).
 *
 * 첫 장과 자리가 다르다 — 첫 장은 `POST .../photo` 가 `trip_moments.storage_path`
 * 에 넣고, 여기는 `POST .../photos` 가 자식 행을 만든다. 서버가 첫 장이 비어
 * 있으면 알아서 첫 장 자리에 넣으므로 클라이언트가 순서를 따질 필요는 없다.
 */
export async function uploadMomentExtraPhoto(
  momentId:  string,
  photoData: string,
  deviceId:  string,
): Promise<boolean> {
  const blob = jpegDataUrlToBlob(photoData);
  if (!blob) return false;
  try {
    const fd = new FormData();
    fd.append("photo", blob, `${momentId}.jpg`);
    const res = await fetch(`/api/trip-moments/${encodeURIComponent(momentId)}/photos`, {
      method:  "POST",
      headers: { "x-device-id": deviceId },
      body:    fd,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 장소 표시명을 고친다. 비우면 null 이 된다.
 *
 * 서버가 좌표 문자열을 거절하므로("35.1°N 129.0°E" 같은 값) 사용자가 실수로
 * 그런 값을 넣어도 저장되지 않는다.
 */
export async function updateMomentPlace(
  momentId: string,
  placeName: string | null,
  deviceId:  string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/trip-moments/${encodeURIComponent(momentId)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body:    JSON.stringify({ place_name: placeName }),
    });
    return res.ok;
  } catch { return false; }
}

/**
 * 이 Memory 를 공개 Story 에 포함할지 정한다.
 *
 * 켤 때는 동의가 필요하다 — 서버가 판본을 확인하고 시각을 적는다. 끌 때는
 * 묻지 않는다. 이 값만으로 공개되지 않는다(일정도 공개여야 하고, 공개 경로는
 * 아직 없다).
 */
export async function setMomentPublic(
  momentId: string,
  isPublic:  boolean,
  deviceId:  string,
  consentVersion?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/trip-moments/${encodeURIComponent(momentId)}/public`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body:    JSON.stringify(isPublic
        ? { is_public: true, consent: true, consentVersion }
        : { is_public: false }),
    });
    return res.ok;
  } catch { return false; }
}

/** 로컬 목록에서 한 moment 의 필드를 갱신하고 저장한다 */
function patchLocal(itinId: string, momentId: string, patch: Partial<TripMoment>): TripMoment[] {
  const next = loadMoments(itinId).map(m =>
    m.moment_id === momentId ? { ...m, ...patch } : m,
  );
  saveMomentsLocal(itinId, next);
  return next;
}

export interface AddMomentResult {
  moments:     TripMoment[];
  /** 로컬 저장 성공 여부 — false 일 때만 "저장 실패"다 */
  localSaved:  boolean;
  metaSynced:  boolean;
  photoSynced: boolean;
}

/** 메타데이터 upsert 1건. moment_id 고정이라 재시도해도 행이 중복되지 않는다. */
async function postMomentMeta(m: TripMoment, deviceId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/trip-moments", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body: JSON.stringify({
        moment_id:      m.moment_id,
        itinerary_id:   m.itinerary_id,
        memo:           m.memo,
        category:       m.category,
        // 장소 표시명 — 없으면 보내지 않는다(서버가 null 로 둔다)
        ...(m.place_name   ? { place_name:   m.place_name }   : {}),
        ...(m.city_spot_id ? { city_spot_id: m.city_spot_id } : {}),
        ...(m.stop_key     ? { stop_key:     m.stop_key }     : {}),
        lat:            m.lat,
        lng:            m.lng,
        location_label: m.location_label,
        captured_at:    m.captured_at,
        day_number:     m.day_number,
        // photo_data 전송 금지 — 사진은 multipart 엔드포인트로만 올린다
      }),
    });
    return res.ok;
  } catch { return false; }
}

/**
 * 로컬 우선 저장 → 메타데이터 upsert → (성공 시) 사진 업로드.
 *
 * 로컬 저장이 되면 사용자의 Memory 는 이미 안전하다. 서버 동기화 실패는
 * "저장 실패"가 아니라 "동기화 대기"이며, 로컬 데이터를 지우지 않는다.
 */
export async function addMomentDetailed(
  itinId:   string,
  moment:   TripMoment,
  deviceId: string,
): Promise<AddMomentResult> {
  const existing = loadMoments(itinId);
  if (existing.some(m => m.moment_id === moment.moment_id)) {
    const cur = existing.find(m => m.moment_id === moment.moment_id)!;
    return { moments: existing, localSaved: true,
             metaSynced: cur.synced, photoSynced: cur.has_photo === true };
  }

  // ① 로컬 저장 (실패하면 이때만 진짜 저장 실패다)
  let moments = [moment, ...existing];
  try {
    saveMomentsLocal(itinId, moments);
  } catch {
    return { moments: existing, localSaved: false, metaSynced: false, photoSynced: false };
  }
  if (loadMoments(itinId).every(m => m.moment_id !== moment.moment_id)) {
    return { moments: existing, localSaved: false, metaSynced: false, photoSynced: false };
  }

  // ② 메타데이터
  const metaSynced = await postMomentMeta(moment, deviceId);
  if (!metaSynced) {
    return { moments: loadMoments(itinId), localSaved: true, metaSynced: false, photoSynced: false };
  }
  moments = patchLocal(itinId, moment.moment_id, { synced: true });

  // ③ 사진 (메타데이터 성공 시에만)
  if (!moment.photo_data) {
    return { moments, localSaved: true, metaSynced: true, photoSynced: false };
  }
  const photoSynced = await uploadMomentPhoto(moment.moment_id, moment.photo_data, deviceId);
  moments = patchLocal(itinId, moment.moment_id, { has_photo: photoSynced });

  return { moments, localSaved: true, metaSynced: true, photoSynced };
}

/** 기존 호출부 호환 — 목록만 필요할 때 */
export async function addMoment(
  itinId:   string,
  moment:   TripMoment,
  deviceId: string,
): Promise<TripMoment[]> {
  return (await addMomentDetailed(itinId, moment, deviceId)).moments;
}

// ── 순차 재동기화 큐 ──────────────────────────────────────────────────────────
//
// A. synced=false            → 메타데이터부터, 성공하면 사진까지
// B. synced=true + 사진 대기 → 사진만
// has_photo=true 는 건너뛴다(재업로드 금지). 한 건씩 순차 처리하며 한 항목의
// 실패가 다음 항목을 막지 않는다. single-flight 로 중복 실행을 막는다.

const resyncInFlight = new Set<string>();

export interface ResyncResult { metaSynced: number; photoSynced: number; skipped: number; }

export async function resyncPendingMoments(
  itinId:   string,
  deviceId: string,
): Promise<ResyncResult> {
  const out: ResyncResult = { metaSynced: 0, photoSynced: 0, skipped: 0 };
  if (resyncInFlight.has(itinId)) { out.skipped = 1; return out; }
  resyncInFlight.add(itinId);

  try {
    // 스냅샷을 떠서 순회한다. 각 단계는 patchLocal 로 즉시 반영된다.
    for (const snap of loadMoments(itinId)) {
      const cur = loadMoments(itinId).find(m => m.moment_id === snap.moment_id);
      if (!cur) continue;

      let meta = cur.synced;
      if (!meta) {
        meta = await postMomentMeta(cur, deviceId);
        if (meta) { patchLocal(itinId, cur.moment_id, { synced: true }); out.metaSynced++; }
      }
      if (!meta) continue;                       // 다음 항목으로 (전체 중단 아님)
      if (!cur.photo_data) continue;             // 텍스트 Memory
      if (cur.has_photo === true) continue;      // 이미 서버에 있음 — 재업로드 금지

      const ok = await uploadMomentPhoto(cur.moment_id, cur.photo_data, deviceId);
      if (ok) { patchLocal(itinId, cur.moment_id, { has_photo: true }); out.photoSynced++; }
      if (!ok) continue;                         // 첫 장이 안 올라갔으면 나머지도 미룬다

      // 추가 사진 — 한 장씩 올리고 성공한 것만 목록에서 뺀다. 중간에 끊겨도
      // 올라간 사진이 다시 올라가지 않고, 못 올린 사진은 다음 큐에 남는다.
      for (const extra of cur.photo_data_extra ?? []) {
        const done = await uploadMomentExtraPhoto(cur.moment_id, extra, deviceId);
        if (!done) break;
        const now  = loadMoments(itinId).find(m => m.moment_id === cur.moment_id);
        const rest = (now?.photo_data_extra ?? []).filter(x => x !== extra);
        patchLocal(itinId, cur.moment_id, { photo_data_extra: rest });
        out.photoSynced++;
      }
    }
  } finally {
    resyncInFlight.delete(itinId);
  }
  return out;
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

// ── memo 수정: PATCH 성공 시 서버 응답 기준으로 로컬 갱신 ────────────────────
// 서버에 저장된 적 없는 로컬 전용 moment 는 서버 호출 없이 로컬만 갱신한다.
// 실패 시 로컬을 건드리지 않고 throw — 호출부가 원본을 유지한다.
export async function updateMomentMemo(
  itinId:   string,
  momentId: string,
  memo:     string,
  deviceId: string,
): Promise<TripMoment[]> {
  const before = loadMoments(itinId);
  const target = before.find(m => m.moment_id === momentId);
  const trimmed = memo.trim();

  if (target && !target.synced) {
    const localOnly = before.map(m => m.moment_id === momentId ? { ...m, memo: trimmed } : m);
    saveMomentsLocal(itinId, localOnly);
    return localOnly;
  }

  let res: Response;
  try {
    res = await fetch(`/api/trip-moments/${encodeURIComponent(momentId)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body:    JSON.stringify({ memo: trimmed }),
    });
  } catch {
    throw new Error("PATCH_FAILED");
  }
  if (!res.ok) throw new Error("PATCH_FAILED");

  // 서버 응답의 memo 를 정본으로 삼는다 (서버 측 정규화 결과 반영)
  let serverMemo = trimmed;
  try {
    const row = (await res.json()) as { memo?: unknown };
    if (typeof row.memo === "string") serverMemo = row.memo;
  } catch { /* 응답 파싱 실패 시 요청값 유지 */ }

  const updated = before.map(m => m.moment_id === momentId ? { ...m, memo: serverMemo } : m);
  saveMomentsLocal(itinId, updated);
  return updated;
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
