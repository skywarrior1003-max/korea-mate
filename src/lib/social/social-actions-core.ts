// Social Actions Foundation — 순수 로직 (content like · save signal · share event).
//
// 의미 계약 (최종 Social Design)
//   Heart = Like       — 공개 반응. count 공개.
//   Bookmark = Save    — 개인 보관. count 비공개(서버에는 ranking raw signal 만).
//   Share = Share      — count 비공개. 행동 기록만.
//   Helpful ≠ Like     — 기존 helpful 데이터는 변환·삭제하지 않는다.
//
// 식별 방식은 place-like-core(043) 그대로: raw device_id 를 저장하지 않고
// 대상별 SHA-256 가명 키만 쓴다. 행동(prefix)마다 해시 입력이 달라 서로 다른
// 행동 기록을 이어 붙여 사람을 재구성할 수 없다.

import { DEVICE_ID_RE } from "../likes/place-like-core.ts";

export { DEVICE_ID_RE };

export function isValidDeviceId(v: unknown): boolean {
  return typeof v === "string" && DEVICE_ID_RE.test(v.trim());
}

const UUID_KEY_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CITY_SPOT_KEY_RE = /^[0-9]{1,12}$/;

// ── content like (공개 Trip · 공개 Story) ───────────────────────────────
export const CONTENT_LIKE_TARGET_TYPES = ["itinerary", "story"] as const;
export type ContentLikeTargetType = typeof CONTENT_LIKE_TARGET_TYPES[number];

export function isValidContentLikeTargetType(v: unknown): v is ContentLikeTargetType {
  return typeof v === "string" && (CONTENT_LIKE_TARGET_TYPES as readonly string[]).includes(v);
}

/** 두 타입 모두 target_key = itineraries.id (UUID) — Story 는 그 여행의 공개 Story 표면 */
export function isValidContentLikeTargetKey(key: unknown): boolean {
  return typeof key === "string" && UUID_KEY_RE.test(key.trim());
}

export const LIKE_ACTIONS = ["like", "unlike"] as const;
export type LikeAction = typeof LIKE_ACTIONS[number];
export function isValidLikeAction(v: unknown): v is LikeAction {
  return typeof v === "string" && (LIKE_ACTIONS as readonly string[]).includes(v);
}

export type SocialErrorCode =
  | "invalid_target" | "invalid_action" | "invalid_device" | "not_public" | "server_error";

export interface ValidContentLikeRequest {
  target_type: ContentLikeTargetType;
  target_key:  string;
  action:      LikeAction;
  device_id:   string;
}

export function validateContentLikeRequest(
  body: unknown, deviceId: unknown,
): { ok: true; value: ValidContentLikeRequest } | { ok: false; error: SocialErrorCode } {
  if (!isValidDeviceId(deviceId)) return { ok: false, error: "invalid_device" };
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_target" };
  const b = body as Record<string, unknown>;
  if (!isValidContentLikeTargetType(b.target_type)) return { ok: false, error: "invalid_target" };
  if (!isValidContentLikeTargetKey(b.target_key)) return { ok: false, error: "invalid_target" };
  if (!isValidLikeAction(b.action)) return { ok: false, error: "invalid_action" };
  return {
    ok: true,
    value: {
      target_type: b.target_type,
      target_key:  String(b.target_key).trim().toLowerCase(),
      action:      b.action,
      device_id:   String(deviceId).trim(),
    },
  };
}

// ── save signal (Save 는 비공개 — ranking raw signal 만) ─────────────────
export const SAVE_TARGET_TYPES = ["city_spot"] as const;
export type SaveTargetType = typeof SAVE_TARGET_TYPES[number];
export const SAVE_ACTIONS = ["save", "unsave"] as const;
export type SaveAction = typeof SAVE_ACTIONS[number];

export interface ValidSaveSignalRequest {
  target_type: SaveTargetType;
  target_key:  string;
  action:      SaveAction;
  device_id:   string;
}

export function validateSaveSignalRequest(
  body: unknown, deviceId: unknown,
): { ok: true; value: ValidSaveSignalRequest } | { ok: false; error: SocialErrorCode } {
  if (!isValidDeviceId(deviceId)) return { ok: false, error: "invalid_device" };
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_target" };
  const b = body as Record<string, unknown>;
  if (b.target_type !== "city_spot") return { ok: false, error: "invalid_target" };
  if (typeof b.target_key !== "string" || !CITY_SPOT_KEY_RE.test(b.target_key.trim()))
    return { ok: false, error: "invalid_target" };
  if (b.action !== "save" && b.action !== "unsave") return { ok: false, error: "invalid_action" };
  return {
    ok: true,
    value: {
      target_type: "city_spot",
      target_key:  b.target_key.trim(),
      action:      b.action,
      device_id:   String(deviceId).trim(),
    },
  };
}

// ── share event (count 비공개 · 일 단위 dedup) ───────────────────────────
export const SHARE_TARGET_TYPES = ["itinerary", "story", "city_spot"] as const;
export type ShareTargetType = typeof SHARE_TARGET_TYPES[number];
export const SHARE_METHODS = ["web_share", "copy_link"] as const;
export type ShareMethod = typeof SHARE_METHODS[number];

export function isValidShareTargetKey(type: ShareTargetType, key: unknown): boolean {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (type === "city_spot") return CITY_SPOT_KEY_RE.test(k);
  return UUID_KEY_RE.test(k);
}

export interface ValidShareEventRequest {
  target_type: ShareTargetType;
  target_key:  string;
  method:      ShareMethod;
  device_id:   string;
}

export function validateShareEventRequest(
  body: unknown, deviceId: unknown,
): { ok: true; value: ValidShareEventRequest } | { ok: false; error: SocialErrorCode } {
  if (!isValidDeviceId(deviceId)) return { ok: false, error: "invalid_device" };
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_target" };
  const b = body as Record<string, unknown>;
  if (typeof b.target_type !== "string" ||
      !(SHARE_TARGET_TYPES as readonly string[]).includes(b.target_type))
    return { ok: false, error: "invalid_target" };
  const type = b.target_type as ShareTargetType;
  if (!isValidShareTargetKey(type, b.target_key)) return { ok: false, error: "invalid_target" };
  if (typeof b.method !== "string" || !(SHARE_METHODS as readonly string[]).includes(b.method))
    return { ok: false, error: "invalid_action" };
  return {
    ok: true,
    value: {
      target_type: type,
      target_key:  type === "city_spot" ? String(b.target_key).trim() : String(b.target_key).trim().toLowerCase(),
      method:      b.method as ShareMethod,
      device_id:   String(deviceId).trim(),
    },
  };
}

// ── 가명 키 — 행동(prefix)·대상별 SHA-256. raw device 저장 금지 ──────────
export function actorKeyInput(
  prefix: "like" | "save" | "share", deviceId: string, targetType: string, targetKey: string,
): string {
  return `${deviceId.trim().toLowerCase()}|${prefix}:${targetType}:${targetKey.trim()}`;
}

export async function actorKey(
  prefix: "like" | "save" | "share", deviceId: string, targetType: string, targetKey: string,
): Promise<string> {
  const data = new TextEncoder().encode(actorKeyInput(prefix, deviceId, targetType, targetKey));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** 공개 응답 — 숫자와 내 상태뿐. 다른 사람의 키·정체는 절대 내보내지 않는다 */
export interface LikeStateResponse { count: number; liked: boolean }
export function likeState(count: number, liked: boolean): LikeStateResponse {
  return { count: Math.max(0, count), liked };
}
