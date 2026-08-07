// 장소 좋아요 — 순수 로직.
//
// 왜 Saved 와 따로 두나
//   Saved 는 "내가 나중에 보려고 담아둔 것" 이다. 남에게 보이지 않고 기기에만 있다.
//   Like 는 "이 장소 좋다" 는 공개 신호다. 두 개는 사용자에게도 다른 행동이고
//   운영에서도 다른 뜻이다. 하나로 합치면 둘 다 의미를 잃는다.
//
// 왜 spot_reactions 를 재사용하지 않나
//   그 테이블은 dislike 전용이고 운영 화면이 "신뢰도 이슈 스팟" 판정에 쓴다.
//   거기에 긍정 신호를 섞으면 그 집계가 무슨 뜻인지 아무도 말할 수 없게 된다.
//   게다가 raw device_id 를 저장한다 — 새 기능이 따라갈 방식이 아니다.
//
// 이 파일이 지키는 계약
//   · Like 와 Report 를 한 점수로 합치지 않는다. 서로 다른 축이다.
//   · Like 를 눌러도 Saved 가 변하지 않는다. 그 반대도 마찬가지다.
//   · 사람을 식별할 수 있는 값을 그대로 저장하지 않는다.

export const LIKE_TARGET_TYPES = ["city_spot"] as const;
export type LikeTargetType = typeof LIKE_TARGET_TYPES[number];

const CITY_SPOT_KEY_RE = /^[0-9]{1,12}$/;

export function isValidLikeTargetType(v: unknown): v is LikeTargetType {
  return typeof v === "string" && (LIKE_TARGET_TYPES as readonly string[]).includes(v);
}

export function isValidLikeTargetKey(type: LikeTargetType, key: unknown): boolean {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (!k) return false;
  if (type === "city_spot") return CITY_SPOT_KEY_RE.test(k);
  return false;
}

export const LIKE_ACTIONS = ["like", "unlike"] as const;
export type LikeAction = typeof LIKE_ACTIONS[number];

export function isValidLikeAction(v: unknown): v is LikeAction {
  return typeof v === "string" && (LIKE_ACTIONS as readonly string[]).includes(v);
}

export const DEVICE_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isValidDeviceId(v: unknown): boolean {
  return typeof v === "string" && DEVICE_ID_RE.test(v.trim());
}

/**
 * 좋아요 누른 사람의 가명 키.
 *
 * 신고와 같은 방식이다 — device_id 를 그대로 저장하지 않고, 대상을 해시 입력에
 * 넣어 **대상마다 값이 달라지게** 한다. 같은 사람이 여러 장소를 좋아해도 그
 * 기록들을 이어 붙여 한 사람의 취향 전체를 재구성할 수 없다.
 *
 * 같은 대상 안에서는 안정적이므로 "이미 눌렀는가" 판정과 중복 방지는 그대로 된다.
 * 새 비밀키를 만들지 않는다.
 */
export function likerKeyInput(
  deviceId: string, targetType: LikeTargetType, targetKey: string,
): string {
  return `${deviceId.trim().toLowerCase()}|like:${targetType}:${targetKey.trim()}`;
}

export async function likerKey(
  deviceId: string, targetType: LikeTargetType, targetKey: string,
): Promise<string> {
  const data = new TextEncoder().encode(likerKeyInput(deviceId, targetType, targetKey));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const MAX_BODY_BYTES = 1024;
/** 한 기기가 짧은 시간에 여러 장소를 쏟아붓는 것만 막는다. */
export const LIKE_RATE_MAX = 60;
export const LIKE_RATE_WINDOW_MS = 60 * 60 * 1000;

export type LikeErrorCode =
  | "invalid_target" | "invalid_action" | "invalid_device" | "rate_limited" | "server_error";

export interface ValidLikeRequest {
  target_type: LikeTargetType;
  target_key:  string;
  action:      LikeAction;
  device_id:   string;
}

export function validateLikeRequest(
  body: unknown, deviceId: unknown,
): { ok: true; value: ValidLikeRequest } | { ok: false; error: LikeErrorCode } {
  if (!isValidDeviceId(deviceId)) return { ok: false, error: "invalid_device" };
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_target" };
  const b = body as Record<string, unknown>;
  if (!isValidLikeTargetType(b.target_type)) return { ok: false, error: "invalid_target" };
  if (!isValidLikeTargetKey(b.target_type, b.target_key)) return { ok: false, error: "invalid_target" };
  if (!isValidLikeAction(b.action)) return { ok: false, error: "invalid_action" };
  return {
    ok: true,
    value: {
      target_type: b.target_type,
      target_key:  String(b.target_key).trim(),
      action:      b.action,
      device_id:   String(deviceId).trim(),
    },
  };
}

/**
 * 사용자에게 돌려줄 값.
 * 다른 사람이 누구인지, 어떤 키를 쓰는지는 절대 나가지 않는다. 숫자와 내 상태뿐이다.
 */
export interface LikeStateResponse { count: number; liked: boolean }
export function likeState(count: number, liked: boolean): LikeStateResponse {
  return { count: Math.max(0, count), liked };
}
