// Storage-first deletion helpers — injectable for unit testing

export const PHOTO_BUCKET_NAME = "moments" as const;

/**
 * Collects and deduplicates non-null, non-empty storage paths from rows.
 */
export function collectStoragePaths(
  rows: ReadonlyArray<{ storage_path: string | null | undefined }>,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const p = row.storage_path;
    if (typeof p === "string" && p.length > 0) seen.add(p);
  }
  return [...seen];
}

/**
 * Validates that storage.remove() removed all requested items.
 * Returns null on full success, error message on failure or partial removal.
 */
export function checkRemoveResult(
  requestedCount: number,
  data: ReadonlyArray<unknown> | null,
  error: unknown,
): string | null {
  if (error) {
    const msg = (error as { message?: string })?.message;
    return msg ?? "Storage remove error";
  }
  if (data === null) return "Storage remove returned null data";
  if (data.length < requestedCount) {
    return `Storage remove partial: expected ${requestedCount}, removed ${data.length}`;
  }
  return null;
}

type StorageBucket = {
  remove(paths: string[]): Promise<{ data: ReadonlyArray<unknown> | null; error: unknown }>;
};

type InjectableStorage = {
  from(bucket: string): StorageBucket;
};

/**
 * Removes a single photo from Storage.
 * Returns null on success, error string on failure.
 */
export async function removeMomentStorage(
  storage: InjectableStorage,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await storage.from(PHOTO_BUCKET_NAME).remove([storagePath]);
  return checkRemoveResult(1, data, error);
}

/**
 * Removes multiple photos from Storage.
 * No-ops and returns null if paths is empty.
 * Returns null on full success, error string on any failure or partial removal.
 */
export async function removeItineraryStorage(
  storage: InjectableStorage,
  paths: string[],
): Promise<string | null> {
  if (paths.length === 0) return null;
  const { data, error } = await storage.from(PHOTO_BUCKET_NAME).remove(paths);
  return checkRemoveResult(paths.length, data, error);
}

// ── 여행 하나에 딸린 사진 경로 전부 ──────────────────────────────────────────
//
// 왜 필요한가
//   사진은 두 곳에 나뉘어 있다. 첫 장은 `trip_moments.storage_path` 에,
//   두 번째부터는 `trip_moment_photos` 에 들어간다(052). 여행을 통째로 지울 때
//   앞의 것만 모으면 두 번째 이후 파일이 Storage 에 남는다 — 그리고 자식 행은
//   FK CASCADE 로 함께 사라지므로 **누가 그 파일을 가리켰는지조차 없어진다.**
//   Memory 하나를 지우는 경로는 이미 둘 다 모은다. 같은 일을 여기서도 한다.
//
// 못 읽으면 지우지 않는다
//   둘 중 하나라도 조회에 실패하면 경로 목록이 불완전해진다. 그 상태로 진행하면
//   "지운 줄 알았는데 남은" 파일이 생기고, 그때는 추적할 방법이 없다.
//   그래서 실패를 조용히 넘기지 않고 그대로 알린다.

/** 여행에 딸린 사진 행을 읽어 온다. 소유권은 부르는 쪽에서 이미 확인한다. */
export interface ItineraryPhotoReader {
  /** trip_moments 의 첫 장 slot */
  legacy: (itineraryId: string) => Promise<{
    ok: boolean; rows: ReadonlyArray<{ storage_path: string | null | undefined }>;
  }>;
  /** trip_moment_photos 의 두 번째 이후 */
  child: (itineraryId: string) => Promise<{
    ok: boolean; rows: ReadonlyArray<{ storage_path: string | null | undefined }>;
  }>;
}

export type ItineraryPhotoPaths =
  | { ok: true;  paths: string[] }
  | { ok: false; stage: "legacy" | "child" };

/**
 * 지워야 할 Storage 경로 전부. 중복은 한 번만 담는다.
 *
 * 두 조회를 함께 보낸다 — 서로 기다릴 이유가 없다.
 */
export async function collectItineraryPhotoPaths(
  read:        ItineraryPhotoReader,
  itineraryId: string,
): Promise<ItineraryPhotoPaths> {
  const [legacy, child] = await Promise.all([read.legacy(itineraryId), read.child(itineraryId)]);
  if (!legacy.ok) return { ok: false, stage: "legacy" };
  if (!child.ok)  return { ok: false, stage: "child" };
  return { ok: true, paths: collectStoragePaths([...legacy.rows, ...child.rows]) };
}
