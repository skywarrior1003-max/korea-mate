// 일정 장소(stop)에서 순간을 남길 때 어떤 안정 열쇠를 Moment 에 실을지 정한다.
// (TASK-TRIP-MOMENT-STOP-BINDING-V1 → TASK-STORY-GENERIC-STOP-IDENTITY-CLOSEOUT-V1)
//
// 관계는 Moment 단위 하나다 — 사진이 몇 장이든 열쇠 하나, Day 하나.
// 장소명 문자열로 추측하지 않는다.
//
// 열쇠는 일정 항목이 이미 들고 있는 출처 열쇠(`sourceKey`, place-identity.ts)다.
//   city_spot:<숫자>  ·  user_spot:<uuid>  ·  event:<city>:<id>  ·  local_info:<city>:<id>
// 항목에 sourceKey 가 없으면 출처+id 로 같은 문법을 만든다(공식 장소·내 장소).
// 숙소(isAccommodation)나 출처 id 가 없는 항목은 열쇠가 없다 → null. 가짜 id 를
// 만들지 않는다. 그런 항목의 기록은 자유 순간으로 남는다.
//
// 공식 장소는 `city_spot_id` 도 함께 싣는다(검증된 기존 결합 경로). 읽는 쪽은
// stop_key 가 없는 옛 행을 city_spot_id 로 결합한다.

import { citySpotSourceKey, userSpotSourceKey } from "../place-identity.ts";
import { UUID_RE } from "../itinerary-validate.ts";

export interface StopIdentityInput {
  place_id?:  string | null;
  source?:    string | null;
  sourceKey?: string | null;
}

/** 서버·클라이언트가 같이 쓰는 열쇠 문법. 접두사 고정, 본문은 안전한 문자만. */
export const STOP_KEY_RE = /^(city_spot|user_spot|event|local_info):[A-Za-z0-9][A-Za-z0-9_.:-]{0,150}$/;
export const STOP_KEY_MAX = 160;

/** city_spots 정본 id. 공식 장소가 아니거나 숫자 id 가 아니면 null. */
export function stopCitySpotId(stop: StopIdentityInput): number | null {
  if (stop.source !== "city_spot") return null;
  const id = typeof stop.place_id === "string" ? stop.place_id.trim() : "";
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * 이 일정 항목의 일반 열쇠. 있는 sourceKey 를 우선하고, 없으면 출처+id 로 만든다.
 * 만들 수 없으면 null — 그 항목에서는 결합 Capture 를 열지 않는다.
 */
export function stopKeyOf(stop: StopIdentityInput): string | null {
  const sk = typeof stop.sourceKey === "string" ? stop.sourceKey.trim() : "";
  if (sk && STOP_KEY_RE.test(sk) && sk.length <= STOP_KEY_MAX) return sk;
  const cs = stopCitySpotId(stop);
  if (cs !== null) return citySpotSourceKey(cs);
  if (stop.source === "user_spot") {
    const id = typeof stop.place_id === "string" ? stop.place_id.trim() : "";
    if (UUID_RE.test(id)) return userSpotSourceKey(id);
  }
  return null;
}

export type StopKeyResult = { ok: true; stopKey: string | null } | { ok: false; error: string };

/** 서버 입력 검증. null/빈 값은 "없음"(자유 순간), 형식이 틀리면 400 감이다. */
export function normalizeStopKey(raw: unknown): StopKeyResult {
  if (raw === null || raw === undefined) return { ok: true, stopKey: null };
  if (typeof raw !== "string") return { ok: false, error: "Invalid stop_key" };
  const t = raw.trim();
  if (t === "") return { ok: true, stopKey: null };
  if (t.length > STOP_KEY_MAX || !STOP_KEY_RE.test(t)) return { ok: false, error: "Invalid stop_key" };
  return { ok: true, stopKey: t };
}

/**
 * migration 055 가 아직 적용되지 않은 환경에서 PostgREST 가 돌려주는 "그런 컬럼
 * 없음" 오류인가. 이때 서버는 stop_key 없이 한 번 더 시도한다 — 배포와 migration
 * 의 순서가 어긋나도 순간 저장·조회가 깨지지 않게.
 */
export function isMissingColumnError(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("stop_key") && (msg.includes("column") || msg.includes("schema cache"));
}
