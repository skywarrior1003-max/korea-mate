// 다른 기기에서도 내 순간의 사진이 보이게 한다. (TASK-STORY-CROSS-DEVICE-PHOTOS-V1, R1)
//
// 사진은 이미 비공개 Storage 에 저장돼 있고(첫 장 `trip_moments.storage_path`,
// 추가 장 `trip_moment_photos`), 소유자 전용 `GET /api/trip-moments/:id/photos` 가
// 순서대로 서명 URL 을 만들어 준다. 목록 메타(`GET /api/trip-moments`)는
// `has_photo` 하나만 주므로 **사진이 몇 장인지는 `/photos` 를 불러야만 안다.**
//
// 세 가지 출처의 역할
//   LOCAL data URL   = 올린 기기의 즉시 미리보기. 성능 최적화일 뿐 완전성의 근거가 아니다.
//   SERVER photo-set = 저장된 사진 세트의 정본(개수·순서·정체).
//   SIGNED URL       = 다른 기기·재로드에서 그 정본을 보는 방법.
//
// 합치는 규칙 (R1)
//   - 서버 세트가 정본 순서다. 로컬은 같은 사진의 미리보기로만 대신 들어간다.
//   - 첫 장: 서버 isFirst ↔ 로컬 photo_data 는 같은 사진이다(첫 장은 항상 legacy
//     경로 하나). 로컬이 있으면 로컬 미리보기를 쓴다.
//   - 추가 장: 로컬 photo_data_extra 는 올린 순서뿐 id 가 없다. 서버 추가 장 수와
//     로컬 추가 장 수가 **같을 때만** 자리별로 대신 넣는다. 다르면(다른 기기에서
//     지우거나 더했으면) 추측하지 않고 서버 서명 URL 을 그대로 쓴다.
//   - 같은 첫 장이 두 번 보이거나, 서버에 있는 장이 빠지면 안 된다.
//   - 서명 주소는 만료되므로 localStorage 에 넣지 않는다. 메모리에만 두고
//     만료·로드 실패 시 다시 받는다(재시도는 순간당 한 번).

import type { TripMoment } from "./types";

export interface ResolvedPhoto { url: string; isFirst: boolean }

export interface ResolvedPhotos {
  photos:    ResolvedPhoto[];
  /** ISO. 지나면 다시 받아야 한다 */
  expiresAt: string;
}

export type ResolvedPhotoMap = Record<string, ResolvedPhotos>;

/** 서버에 사진이 있는 순간은 전부 대상이다 — 로컬이 한 장 있어도 몇 장인지는 서버만 안다 */
export function needsPhotoResolution(m: Pick<TripMoment, "has_photo">): boolean {
  return m.has_photo === true;
}

/** 만료 60초 전부터는 만료로 본다 — 화면에 그린 직후 깨지는 주소를 피한다 */
export function isResolvedFresh(r: ResolvedPhotos | undefined, nowMs: number): boolean {
  if (!r) return false;
  const t = Date.parse(r.expiresAt);
  return Number.isFinite(t) && t - 60_000 > nowMs;
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 한 순간의 최종 표시 사진 목록. 정본은 서버 순서, 로컬은 같은 사진의 미리보기로만
 * 대신 들어간다. 서버 해석이 아직 없으면 로컬만(있는 대로) 돌려준다.
 */
export function composeDisplayPhotos(
  m:        Pick<TripMoment, "photo_data" | "photo_data_extra">,
  resolved: ResolvedPhotos | undefined,
): string[] {
  const localFirst  = s(m.photo_data);
  const localExtras = (m.photo_data_extra ?? []).map(s).filter(Boolean);
  const server = (resolved?.photos ?? []).filter(p => s(p.url));
  if (server.length === 0) return localFirst ? [localFirst, ...localExtras] : [];

  const serverFirst    = server.find(p => p.isFirst) ?? null;
  const serverChildren = server.filter(p => !p.isFirst);
  const out: string[] = [];
  // 첫 장 — 로컬 미리보기가 있으면 그것, 없으면 서명 주소. 둘 다 같은 사진이다.
  if (serverFirst) out.push(localFirst || serverFirst.url);
  // 추가 장 — 수가 같을 때만 자리별 로컬 대체. 다르면 서버 그대로(추측 금지).
  const sameSize = localExtras.length === serverChildren.length;
  for (let i = 0; i < serverChildren.length; i++) {
    out.push(sameSize ? (localExtras[i] || serverChildren[i]!.url) : serverChildren[i]!.url);
  }
  return out;
}

/**
 * 화면용 복사본. 합친 목록을 `photo_data`/`photo_data_extra` 자리에 넣는다 —
 * Timeline·Story 어댑터가 이미 그 두 필드로 그리므로 화면 코드는 바뀌지 않는다.
 * 원본 배열은 바꾸지 않는다. 이 결과를 로컬 캐시에 저장하면 안 된다.
 */
export function withResolvedPhotos(moments: TripMoment[], resolved: ResolvedPhotoMap): TripMoment[] {
  return moments.map(m => {
    const r = resolved[m.moment_id];
    if (!r || !needsPhotoResolution(m)) return m;
    const list = composeDisplayPhotos(m, r);
    if (list.length === 0) return m;
    const [first, ...rest] = list;
    const copy: TripMoment = { ...m, photo_data: first! };
    if (rest.length > 0) copy.photo_data_extra = rest; else delete copy.photo_data_extra;
    return copy;
  });
}

interface PhotosResponse {
  photos?:    { id?: unknown; isFirst?: unknown; url?: unknown }[];
  expiresAt?: unknown;
}

/**
 * 소유자 전용 사진 목록. 서버가 정한 순서(첫 장 → 추가 장 sort_index 순)를 그대로
 * 쓴다. 실패·비소유·없음은 전부 null — 사유를 화면에 흘리지 않는다.
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
    const photos: ResolvedPhoto[] = (body.photos ?? [])
      .map(p => ({ url: typeof p.url === "string" ? p.url : "", isFirst: p.isFirst === true }))
      .filter(p => p.url.startsWith("https://") || p.url.startsWith("http://"));
    if (photos.length === 0) return null;
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : new Date(Date.now() + 5 * 60_000).toISOString();
    return { photos, expiresAt };
  } catch {
    return null;
  }
}
