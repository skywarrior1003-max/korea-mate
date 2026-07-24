// Pure validation helpers for the photo upload CF Function.
// No external dependencies — pure TypeScript only.

export const MAX_PHOTO_BYTES        = 1_048_576; // 1 MB
export const DEVICE_PHOTO_LIMIT     = 100;
export const ITINERARY_PHOTO_LIMIT  = 30;
export const PHOTO_BUCKET           = "moments";

export type ValidationOk    = { ok: true };
export type ValidationError = { ok: false; status: 400 | 413; error: string };
export type ValidationResult = ValidationOk | ValidationError;

export function validateMimeType(mimeType: string): ValidationResult {
  if (mimeType !== "image/jpeg") {
    return { ok: false, status: 400, error: "Only image/jpeg is accepted" };
  }
  return { ok: true };
}

export function validatePhotoSize(byteLength: number): ValidationResult {
  if (byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, status: 413, error: "File too large (max 1 MB)" };
  }
  return { ok: true };
}

// Fast pre-check before full structural parse by stripJpegApp1.
export function hasJpegSoi(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

// Canonical storage path for a moment photo.
export function makeStoragePath(
  itineraryId: string,
  momentId:    string,
  versionUuid: string,
): string {
  return `${itineraryId}/${momentId}/${versionUuid}.jpg`;
}
