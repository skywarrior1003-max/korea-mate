// 다른 기기에서도 내 순간의 사진이 보이게 한다. (TASK-STORY-CROSS-DEVICE-PHOTOS-V1)
//
// 사진은 이미 비공개 Storage 에 저장돼 있고(첫 장 `trip_moments.storage_path`,
// 추가 장 `trip_moment_photos`), 소유자 전용 `GET /api/trip-moments/:id/photos` 가
// 순서대로 서명 URL 을 만들어 준다. 그동안 화면은 **업로드한 기기의 로컬
// data URL** 만 그렸기 때문에 다른 기기에서는 사진이 없는 것처럼 보였다.
//
// 원칙
//   - 로컬 data URL 은 방금 올린 기기의 즉시 미리보기다. 있으면 그대로 쓴다.
//   - 없으면 서버가 서명한 주소를 쓴다 — 이것이 기기에 상관없는 원본이다.
//   - 서명 주소는 만료되므로 **localStorage 에 저장하지 않는다.** 메모리에만
//     두고 만료되면 다시 받는다. 저장 경로 원문·device id 는 응답에 없다.
//   - 한 순간의 사진을 못 받아도 다른 순간은 그대로 그린다.

import type { TripMoment } from "./types";

export interface ResolvedPhotos {
  urls:      string[];
  /** ISO. 지나면 다시 받아야 한다 */
  expiresAt: string;
}

export type ResolvedPhotoMap = Record<string, ResolvedPhotos>;

/** 서버에 사진이 있는데 이 기기에 로컬 미리보기가 없는 순간만 대상이다 */
export function needsPhotoResolution(m: Pick<TripMoment, "has_photo" | "photo_data">): boolean {
  return m.has_photo === true && !m.photo_data;
}

/** 만료 60초 전부터는 만료로 본다 — 화면에 그린 직후 깨지는 주소를 피한다 */
export function isResolvedFresh(r: ResolvedPhotos | undefined, nowMs: number): boolean {
  if (!r) return false;
  const t = Date.parse(r.expiresAt);
  return Number.isFinite(t) && t - 60_000 > nowMs;
}

/**
 * 화면용 복사본. 로컬 미리보기가 있으면 손대지 않고, 없으면 서명 주소를
 * `photo_data`/`photo_data_extra` 자리에 넣는다 — Timeline·Story 어댑터가 이미
 * 그 두 필드로 그리므로 화면 코드는 바뀌지 않는다. 원본 배열은 바꾸지 않는다.
 * 이 결과를 로컬 캐시에 저장하면 안 된다(만료되는 주소가 영구 저장된다).
 */
export function withResolvedPhotos(moments: TripMoment[], resolved: ResolvedPhotoMap): TripMoment[] {
  return moments.map(m => {
    if (!needsPhotoResolution(m)) return m;
    const urls = resolved[m.moment_id]?.urls ?? [];
    if (urls.length === 0) return m;
    const [first, ...rest] = urls;
    return { ...m, photo_data: first!, ...(rest.length > 0 ? { photo_data_extra: rest } : {}) };
  });
}

interface PhotosResponse {
  photos?:    { id?: unknown; isFirst?: unknown; url?: unknown }[];
  expiresAt?: unknown;
}

/**
 * 소유자 전용 사진 목록을 받아 주소만 돌려준다. 서버가 정한 순서(첫 장 → 추가 장
 * sort_index 순)를 그대로 쓴다. 실패·비소유·없음은 전부 빈 목록 — 사유를
 * 화면에 흘리지 않는다.
 */
export async function fetchMomentPhotoUrls(
  momentId:  string,
  deviceId:  string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedPhotos | null> {
  try {
    const res = await fetchImpl(`/api/trip-moments/${encodeURIComponent(momentId)}/photos`, {
      headers: { "x-device-id": deviceId },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PhotosResponse;
    const urls = (body.photos ?? [])
      .map(p => (typeof p.url === "string" ? p.url : ""))
      .filter(u => u.startsWith("https://") || u.startsWith("http://"));
    if (urls.length === 0) return null;
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : new Date(Date.now() + 5 * 60_000).toISOString();
    return { urls, expiresAt };
  } catch {
    return null;
  }
}
