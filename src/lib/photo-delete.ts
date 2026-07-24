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
