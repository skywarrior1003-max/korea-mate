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
  /**
   * 그 경로에 파일이 있는가.
   *
   * Supabase SDK 는 400/404 를 `{ data: false }` 로 돌려주고(그때 `error` 가
   * 차 있어도 "없다" 는 확정이다), 그 밖의 실패는 **던진다**. 그래서 판단은
   * `data` 로 하고, 던지는 것은 "모른다" 로 다룬다.
   *
   * 없을 수도 있는 이유 — 이 helper 를 쓰는 테스트 스텁이 이미 여럿 있고,
   * 그것들은 remove 만 흉내 낸다. 없으면 아래에서 예전 판정으로 되돌아간다.
   */
  exists?(path: string): Promise<{ data: unknown; error: unknown }>;
};

type InjectableStorage = {
  from(bucket: string): StorageBucket;
};

/**
 * 지운 개수가 모자랄 때, 정말 남아 있는지 확인한다.
 *
 * 왜 필요한가
 *   Storage 를 먼저 지우고 DB 를 지운다. 그 사이에 DB 삭제가 실패하면 파일은
 *   사라졌는데 행은 남는다. 사용자가 다시 지우려 하면 같은 경로를 또 넘기게
 *   되고, 그 파일들은 이미 없다. `remove` 는 실제로 지운 것만 돌려주므로 개수가
 *   모자라고, 그것을 그대로 실패로 보면 **그 여행은 영원히 지울 수 없다.**
 *
 *   그렇다고 개수 부족을 전부 성공으로 넘길 수는 없다. 정말 남아 있는 파일까지
 *   지운 셈이 되어 DB 만 사라지고 사진은 추적할 수 없게 된다. 그래서 부족할
 *   때만, 부족한 경로만 실제로 확인한다.
 *
 * 왜 반환값을 세 갈래로 두나
 *   "없다" 와 "모른다" 는 다르다. 확인 자체가 실패한 것을 없는 것으로 처리하면
 *   지금 고치려는 문제를 반대 방향으로 다시 만든다.
 */
async function verifyAbsent(
  bucket: StorageBucket,
  paths: readonly string[],
): Promise<"absent" | "present" | "unknown"> {
  if (typeof bucket.exists !== "function") return "unknown";
  for (const path of paths) {
    try {
      const { data } = await bucket.exists(path);
      if (data === true) return "present";
      if (data !== false) return "unknown";   // 예상 못 한 모양은 넘기지 않는다
    } catch {
      return "unknown";                       // network·권한 등 — 안전하게 실패
    }
  }
  return "absent";
}

/** `remove` 가 돌려준 것에서 경로 이름을 꺼낸다. 모양을 모르면 비운다. */
function removedNames(data: ReadonlyArray<unknown>): Set<string> {
  const out = new Set<string>();
  for (const row of data) {
    const name = (row as { name?: unknown })?.name;
    if (typeof name === "string" && name !== "") out.add(name);
  }
  return out;
}

/**
 * 요청한 경로가 모두 없어졌는지 판정한다.
 *
 * 전부 지워졌으면 추가 왕복이 없다 — 평소 삭제에는 비용이 붙지 않는다.
 * 모자랄 때만 그 경로들을 확인한다.
 */
async function settleRemoval(
  bucket: StorageBucket,
  paths: string[],
  data: ReadonlyArray<unknown> | null,
  error: unknown,
): Promise<string | null> {
  const direct = checkRemoveResult(paths.length, data, error);
  if (direct === null) return null;
  // 진짜 오류(권한·네트워크)는 여기서 끝낸다 — 존재 확인으로 넘어가지 않는다
  if (error || data === null) return direct;

  const removed = removedNames(data);
  // 이름을 못 읽었으면 어느 것이 남았는지 모른다 — 전부 확인한다
  const missing = removed.size === 0 ? paths : paths.filter(p => !removed.has(p));
  if (missing.length === 0) return null;

  const verdict = await verifyAbsent(bucket, missing);
  if (verdict === "absent") return null;
  if (verdict === "present") return direct;
  return `Storage remove partial: could not verify ${missing.length} path(s)`;
}

/**
 * Removes a single photo from Storage.
 * Returns null on success, error string on failure.
 */
export async function removeMomentStorage(
  storage: InjectableStorage,
  storagePath: string,
): Promise<string | null> {
  const bucket = storage.from(PHOTO_BUCKET_NAME);
  const { data, error } = await bucket.remove([storagePath]);
  return settleRemoval(bucket, [storagePath], data, error);
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
  const bucket = storage.from(PHOTO_BUCKET_NAME);
  const { data, error } = await bucket.remove(paths);
  return settleRemoval(bucket, paths, data, error);
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
