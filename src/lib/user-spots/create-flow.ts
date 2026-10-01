// My Place 를 만드는 흐름 한 곳.
//
// Picks 와 일정 편집 화면 두 곳에서 같은 결정을 내려야 한다. 두 번 적으면
// 한쪽만 고치고 다른 쪽을 잊는 날이 온다.
//
// 의존성을 주입받는 이유는 테스트 때문이다 — 브라우저 canvas 와 네트워크 없이
// "사진만 실패했을 때 장소를 지우지 않는가" 를 확인할 수 있어야 한다.

import { decideCreateRoute } from "./anchor-core.ts";

export interface CreateFlowInput {
  name?:     string;
  category?: string;
  address?:  string;
  note?:     string;
  lat:       number | null;
  lng:       number | null;
}

export interface CreateFlowDeps {
  /** File → 업로드용 JPEG Blob. 실패하면 throw. */
  compress:       (file: File) => Promise<Blob>;
  /** 좌표 기반 생성. 만들어진 id 를 준다. */
  createJson:     (input: CreateFlowInput) => Promise<string>;
  /** 사진이 유일한 근거일 때의 단일 요청 생성. */
  createWithPhoto:(input: CreateFlowInput, photo: Blob) => Promise<{ ok: boolean; id?: string }>;
  /** 이미 만들어진 장소에 사진 붙이기. */
  uploadPhoto:    (id: string, photo: Blob) => Promise<{ ok: boolean }>;
  /**
   * 2·3번째 사진 덧붙이기(088 user_spot_photos). 없으면 첫 사진만 올린다 —
   * 예전 호출부(한 장)와 같은 동작이다.
   */
  appendPhoto?:   (id: string, photo: Blob) => Promise<{ ok: boolean }>;
}

export type CreateFlowNotice =
  /** 사진을 읽지 못했다 (형식·손상) */
  | "photoUnreadable"
  /** 장소는 저장됐고 사진만 실패했다 */
  | "savedPhotoFailed"
  /** 장소는 저장됐고 사진 일부만 올라갔다 — 몇 장인지는 photosSaved/photosFailed */
  | "savedPhotosPartial";

export interface CreateFlowResult {
  /** 장소가 만들어졌는가. 사진만 실패한 경우에도 true 다. */
  created:  boolean;
  spotId?:  string;
  /** 화면에 보여줄 안내 (i18n 키). */
  notice?:  CreateFlowNotice;
  /** 만들지 못한 이유 (i18n 키). */
  errorKey?: "needAnchor" | "saveFailed";
  /** 실제로 저장된 사진 수. 성공처럼 보이지 않게 화면이 그대로 알린다. */
  photosSaved?:  number;
  /** 저장하지 못한 사진 수(읽지 못함·업로드 실패). */
  photosFailed?: number;
}

/**
 * 근거에 따라 경로를 고르고 실행한다.
 *
 * 핵심은 하나다 — 좌표가 있으면 장소는 사진 없이도 성립하므로, 사진 업로드가
 * 실패해도 방금 저장한 장소를 되돌리지 않는다. 사용자는 장소를 저장했고 그
 * 사실은 사진과 무관하다.
 *
 * 좌표가 없으면 사진이 유일한 근거다. 그때는 사진이 실패하면 남길 것이 없어
 * 서버가 한 요청 안에서 전부 되돌린다.
 */
export async function runCreateFlow(
  input:  CreateFlowInput,
  photos: File | File[] | null,
  deps:   CreateFlowDeps,
): Promise<CreateFlowResult> {
  // 한 장(예전 호출부)과 여러 장(최대 3장)을 같은 흐름으로 받는다. 첫 장이 대표 사진이다.
  const list  = Array.isArray(photos) ? photos.slice(0, 3) : photos ? [photos] : [];
  const photo = list[0] ?? null;
  const rest  = list.slice(1);
  const first = await runFirst(input, photo, deps);
  if (!first.created || !first.spotId || rest.length === 0 || !deps.appendPhoto) {
    if (first.created && photo) {
      const ok = first.notice ? 0 : 1;
      return { ...first, photosSaved: ok, photosFailed: list.length - ok };
    }
    return first;
  }
  // 나머지 사진은 하나씩 — 하나가 실패해도 다음 사진과 장소는 남는다.
  let saved  = first.notice ? 0 : 1;
  let failed = first.notice ? 1 : 0;
  for (const f of rest) {
    try {
      const blob = await deps.compress(f);
      const r = await deps.appendPhoto(first.spotId, blob);
      if (r.ok) saved++; else failed++;
    } catch {
      failed++;
    }
  }
  if (failed === 0) return { created: true, spotId: first.spotId, photosSaved: saved, photosFailed: 0 };
  return {
    created: true, spotId: first.spotId,
    notice: saved === 0 ? "savedPhotoFailed" : "savedPhotosPartial",
    photosSaved: saved, photosFailed: failed,
  };
}

/** 첫 사진(대표)까지의 예전 흐름. */
async function runFirst(
  input:  CreateFlowInput,
  photo:  File | null,
  deps:   CreateFlowDeps,
): Promise<CreateFlowResult> {
  const route = decideCreateRoute({ lat: input.lat, lng: input.lng, hasPhoto: photo !== null, name: input.name });

  if (route === "blocked") return { created: false, errorKey: "needAnchor" };

  // 좌표만 — 예전과 같은 경로다.
  if (route === "json") {
    try {
      const id = await deps.createJson(input);
      return { created: true, spotId: id };
    } catch {
      return { created: false, errorKey: "saveFailed" };
    }
  }

  // 사진이 끼는 두 경로는 압축을 먼저 한다. 읽을 수 없는 파일이면 네트워크를
  // 쓰기 전에 멈춘다 — 장소만 만들어 두고 사진이 안 되는 상태를 굳이 만들 이유가 없다.
  let blob: Blob;
  try {
    blob = await deps.compress(photo as File);
  } catch {
    return { created: false, notice: "photoUnreadable", errorKey: undefined };
  }

  if (route === "with-photo") {
    try {
      const r = await deps.createWithPhoto(input, blob);
      if (!r.ok) return { created: false, errorKey: "saveFailed" };
      return { created: true, spotId: r.id };
    } catch {
      return { created: false, errorKey: "saveFailed" };
    }
  }

  // json-then-photo: 장소를 먼저, 사진을 나중에.
  let id: string;
  try {
    id = await deps.createJson(input);
  } catch {
    return { created: false, errorKey: "saveFailed" };
  }

  try {
    const up = await deps.uploadPhoto(id, blob);
    if (!up.ok) return { created: true, spotId: id, notice: "savedPhotoFailed" };
  } catch {
    return { created: true, spotId: id, notice: "savedPhotoFailed" };
  }

  return { created: true, spotId: id };
}
