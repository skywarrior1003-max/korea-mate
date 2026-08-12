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
}

export type CreateFlowNotice =
  /** 사진을 읽지 못했다 (형식·손상) */
  | "photoUnreadable"
  /** 장소는 저장됐고 사진만 실패했다 */
  | "savedPhotoFailed";

export interface CreateFlowResult {
  /** 장소가 만들어졌는가. 사진만 실패한 경우에도 true 다. */
  created:  boolean;
  spotId?:  string;
  /** 화면에 보여줄 안내 (i18n 키). */
  notice?:  CreateFlowNotice;
  /** 만들지 못한 이유 (i18n 키). */
  errorKey?: "needAnchor" | "saveFailed";
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
  photo:  File | null,
  deps:   CreateFlowDeps,
): Promise<CreateFlowResult> {
  const route = decideCreateRoute({ lat: input.lat, lng: input.lng, hasPhoto: photo !== null });

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
