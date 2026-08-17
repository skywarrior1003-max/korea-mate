// 한 Memory 의 사진 목록을 계산한다.
//
// 사진은 두 곳에 나뉘어 있다.
//   `trip_moments.storage_path` — 예전부터 있던 한 장. 운영 데이터가 여기 있고
//                                 표지(`cover_moment_id`)와 `has_photo` 가 이
//                                 값을 본다. 그래서 옮기지 않는다.
//   `trip_moment_photos`        — 두 번째 이후 사진들 (migration 052)
//
// 화면과 삭제는 이 둘을 하나의 목록처럼 다뤄야 한다. 그 계산을 여기 모은다 —
// 순수 함수라 DB 없이 검증할 수 있고, 서버 라우트 세 곳이 같은 규칙을 쓴다.

/** `trip_moment_photos` 한 행에서 이 모듈이 쓰는 것만 */
export interface ChildPhotoRow {
  photo_id:     string;
  storage_path: string;
  sort_index?:  number | null;
  created_at?:  string | null;
}

/** 화면에 보여줄 사진 하나 */
export interface PhotoSlot {
  /** 삭제할 때 가리키는 값. 첫 장(legacy)은 `photo_id` 가 없어 이 이름을 쓴다. */
  id:       string;
  path:     string;
  isLegacy: boolean;
}

/** legacy 첫 장을 가리키는 이름. 실제 uuid 와 겹치지 않는 문자열이어야 한다. */
export const LEGACY_PHOTO_ID = "legacy";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 올린 순서대로 정렬한다. `sort_index` 가 같거나 없으면 `created_at`,
 * 그것도 같으면 id 로 가른다 — 같은 초에 두 장이 들어와도 순서가 흔들리지 않게.
 */
export function sortChildPhotos(rows: ChildPhotoRow[]): ChildPhotoRow[] {
  return [...rows].sort((a, b) => {
    const ai = typeof a.sort_index === "number" ? a.sort_index : 0;
    const bi = typeof b.sort_index === "number" ? b.sort_index : 0;
    if (ai !== bi) return ai - bi;
    const at = clean(a.created_at), bt = clean(b.created_at);
    if (at !== bt) return at < bt ? -1 : 1;
    return a.photo_id < b.photo_id ? -1 : a.photo_id > b.photo_id ? 1 : 0;
  });
}

/**
 * 한 Memory 의 사진 목록.
 *
 * legacy 한 장이 언제나 맨 앞이다 — 그게 지금 표지로 쓰이는 사진이고,
 * 사진이 한 장뿐인 Memory 는 예전 화면과 똑같이 보여야 한다.
 *
 * 같은 경로가 두 번 나오지 않는다. child 행이 어쩌다 legacy 와 같은 경로를
 * 들고 있어도(예: 승격 도중 중단) 화면에 두 번 뜨지 않는다.
 */
export function mergePhotoSet(
  legacyPath: string | null | undefined,
  childRows:  ChildPhotoRow[],
): PhotoSlot[] {
  const out: PhotoSlot[] = [];
  const seen = new Set<string>();

  const legacy = clean(legacyPath);
  if (legacy) {
    out.push({ id: LEGACY_PHOTO_ID, path: legacy, isLegacy: true });
    seen.add(legacy);
  }
  for (const r of sortChildPhotos(childRows)) {
    const p = clean(r.storage_path);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push({ id: r.photo_id, path: p, isLegacy: false });
  }
  return out;
}

/** Memory 를 지울 때 Storage 에서 함께 치워야 하는 것 전부 */
export function photoPathsToRemove(
  legacyPath: string | null | undefined,
  childRows:  ChildPhotoRow[],
): string[] {
  return mergePhotoSet(legacyPath, childRows).map(s => s.path);
}

/** 다음 사진이 받을 순서 값 */
export function nextSortIndex(childRows: ChildPhotoRow[]): number {
  let max = 0;
  for (const r of childRows) {
    const i = typeof r.sort_index === "number" ? r.sort_index : 0;
    if (i > max) max = i;
  }
  return max + 1;
}

// ── 첫 장을 지울 때 ──────────────────────────────────────────────────────────
/**
 * legacy 첫 장을 지우면 `storage_path` 가 빈다. 그대로 두면 사진이 아직 두 장
 * 남아 있어도 표지가 사라지고(`resolveEffectiveCover` 가 이 값을 본다) 목록
 * API 의 `has_photo` 도 false 가 된다 — 남은 사진이 없는 것처럼 보인다.
 *
 * 그래서 다음 사진을 첫 장 자리로 올린다. 올라간 child 행은 지운다 — 같은
 * 사진이 두 자리에 등록돼 있으면 개수가 하나 더 세어진다.
 *
 * 남은 사진이 없으면 `storage_path` 를 비우는 수밖에 없다.
 */
export interface LegacyDeletePlan {
  /** Storage 에서 지울 파일 */
  removePath:    string;
  /** `trip_moments.storage_path` 에 넣을 값 */
  nextLegacy:    string | null;
  /** 첫 장 자리로 올라가 child 목록에서 빠질 행. 없으면 null */
  promotedId:    string | null;
}

export function planLegacyPhotoDelete(
  legacyPath: string | null | undefined,
  childRows:  ChildPhotoRow[],
): LegacyDeletePlan | null {
  const legacy = clean(legacyPath);
  if (!legacy) return null;

  const rest = sortChildPhotos(childRows).filter(r => clean(r.storage_path) && clean(r.storage_path) !== legacy);
  const next = rest[0];
  return {
    removePath: legacy,
    nextLegacy: next ? clean(next.storage_path) : null,
    promotedId: next ? next.photo_id : null,
  };
}

// ── 한도 ─────────────────────────────────────────────────────────────────────
/**
 * 실제 사진 개수.
 *
 * 예전에는 `storage_path` 가 있는 moment 행 수를 셌다. moment 당 사진이 한
 * 장뿐이던 시절에는 그게 곧 사진 수였다. 지금은 아니다 — 그대로 두면 한
 * Memory 에 스무 장을 넣어도 카운터는 1 이다.
 *
 * 두 곳을 더한다: 첫 장을 가진 moment 수 + child 사진 행 수.
 */
export function totalPhotoCount(momentsWithLegacy: number, childPhotos: number): number {
  const a = Number.isFinite(momentsWithLegacy) ? Math.max(0, momentsWithLegacy) : 0;
  const b = Number.isFinite(childPhotos)       ? Math.max(0, childPhotos)       : 0;
  return a + b;
}

/** 이번 업로드를 받아도 되는가 */
export function withinPhotoLimit(current: number, limit: number): boolean {
  return current < limit;
}

/** 이번 요청에서 아직 몇 장을 더 받을 수 있는가 (클라이언트 안내용) */
export function remainingSlots(current: number, limit: number): number {
  return Math.max(0, limit - Math.max(0, current));
}
