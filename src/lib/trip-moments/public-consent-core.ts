// Memory 를 공개 Story 에 포함할지 정하는 규칙.
//
// 기본은 비공개다. 여행을 공개해도 사진과 메모는 따라 나가지 않는다 —
// 사용자가 Memory 하나하나를 골라야 한다(Model B).
//
// 동의를 왜 서버가 찍나
//   시각과 판본을 클라이언트가 정하게 하면 "언제 무엇에 동의했는가" 를 우리가
//   증명할 수 없다. 커버가 이미 같은 방식을 쓴다(`trip-cover-v1`) — 클라이언트는
//   "동의했고 이 판본을 읽었다" 만 말하고, 값은 서버가 적는다.
//
// 공개 해제는 동의를 묻지 않는다
//   공개를 줄이는 방향이라 확인을 요구할 이유가 없다. 대신 동의 기록을 지운다 —
//   커버와 같다. 다시 공개하면 그때의 최신 판본을 새로 적는다.
//
// 이 파일이 하지 않는 것
//   실제 공개(egress)는 아직 없다. `is_public=true` 는 "공개 대상으로 골랐다"
//   는 소유자 쪽 표시일 뿐이다. 바깥으로 나가는 조건은 앞으로도
//   **itinerary.is_public === true AND moment.is_public === true** 두 개가
//   모두 참일 때다. 한쪽만으로는 나가지 않는다.

/**
 * 지금 동의 문구의 판본. 문구가 실질적으로 바뀌면 올린다 —
 * 옛 판본에 동의한 기록과 구분되어야 한다.
 */
export const MEMORY_PUBLIC_CONSENT_VERSION = "memory-public-v1";

/**
 * 장소 표시명 최대 길이.
 *
 * user_spots 의 이름 입력이 200 자를 쓰고(`str(body.location_label, 200)` 도
 * 같다) 그보다 길 이유가 없다. 사람이 부르는 이름이지 설명이 아니다.
 */
export const PLACE_NAME_MAX = 200 as const;

/** 좌표 문자열이 장소명 자리에 들어오는 것을 막는다 — 그건 location_label 의 몫이다 */
const COORD_LIKE = /^\s*\d{1,3}(\.\d+)?\s*°\s*[NS]\s+\d{1,3}(\.\d+)?\s*°\s*[EW]\s*$/;

export type PlaceNameResult =
  | { ok: true; placeName: string | null }
  | { ok: false; error: string };

/**
 * 장소 표시명 정규화.
 *
 * 비우는 것은 정상이다 — 장소를 적지 않은 Memory 가 오히려 흔하다.
 * 길이를 넘으면 조용히 자르지 않고 거절한다(메모와 같은 정책).
 */
export function normalizePlaceName(raw: unknown): PlaceNameResult {
  if (raw === null) return { ok: true, placeName: null };
  if (typeof raw !== "string") return { ok: false, error: "Invalid place_name" };
  const t = raw.trim();
  if (t === "") return { ok: true, placeName: null };
  if (t.length > PLACE_NAME_MAX) return { ok: false, error: "place_name too long" };
  if (COORD_LIKE.test(t)) return { ok: false, error: "place_name must not be a coordinate" };
  return { ok: true, placeName: t };
}

export type CitySpotIdResult =
  | { ok: true; citySpotId: number | null }
  | { ok: false; error: string };

/**
 * 공식 장소 id.
 *
 * 없어도 저장을 막지 않는다 — 공식 장소가 아닌 Memory 가 대부분이다.
 * 실제로 그 장소가 있는지는 서버가 DB 에서 확인한다(여기서는 형식만 본다).
 */
export function normalizeCitySpotId(raw: unknown): CitySpotIdResult {
  if (raw === null || raw === undefined) return { ok: true, citySpotId: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Invalid city_spot_id" };
  return { ok: true, citySpotId: n };
}

// ── 공개 켜기/끄기 ───────────────────────────────────────────────────────────
export type PublicRequest =
  | { ok: true; isPublic: false }
  | { ok: true; isPublic: true }
  | { ok: false; status: 400; error: string };

/**
 * 켤 때만 동의를 요구한다.
 *
 * `consent: true` 와 **서버가 아는 판본**을 함께 보내야 한다. 판본이 다르면
 * 사용자가 읽은 문구가 지금 문구와 다르다는 뜻이라 거절한다.
 */
export function parsePublicRequest(body: unknown): PublicRequest {
  if (body === null || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;
  if (b.is_public === false) return { ok: true, isPublic: false };
  if (b.is_public !== true)  return { ok: false, status: 400, error: "is_public must be boolean" };

  if (b.consent !== true) {
    return { ok: false, status: 400, error: "Consent required" };
  }
  if (b.consentVersion !== MEMORY_PUBLIC_CONSENT_VERSION) {
    return { ok: false, status: 400, error: "Invalid consent version" };
  }
  return { ok: true, isPublic: true };
}

export interface PublicPatch {
  is_public:              boolean;
  public_consent_at:      string | null;
  public_consent_version: string | null;
}

/**
 * 저장할 값. 한 번에 셋을 함께 쓴다 — 부분 갱신을 허용하면
 * "공개인데 동의 기록이 없는" 상태가 만들어질 수 있다(053 의 CHECK 가 막는 것).
 */
export function buildPublicPatch(isPublic: boolean, now: string): PublicPatch {
  return isPublic
    ? { is_public: true,  public_consent_at: now,  public_consent_version: MEMORY_PUBLIC_CONSENT_VERSION }
    : { is_public: false, public_consent_at: null, public_consent_version: null };
}

/**
 * 동의 화면이 무엇을 공개한다고 말해야 하는가.
 *
 * 사진이 0 장인데 "사진 0장이 공개됩니다" 라고 하거나, 메모가 없는데 메모가
 * 공개된다고 말하지 않기 위해 실제 상태를 그대로 돌려준다.
 */
export type ConsentScope = "photos_and_memo" | "photos_only" | "memo_only" | "nothing_yet";

export function consentScope(photoCount: number, hasMemo: boolean): ConsentScope {
  const p = Number.isFinite(photoCount) && photoCount > 0;
  if (p && hasMemo) return "photos_and_memo";
  if (p)            return "photos_only";
  if (hasMemo)      return "memo_only";
  return "nothing_yet";
}
