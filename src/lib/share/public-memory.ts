// 공개 Story 로 내보낼 Memory 를 만든다.
//
// 나가는 조건은 둘이 아니라 셋이다
//   ① 여행이 공개일 것            (itineraries.is_public)
//   ② 그 Memory 를 골랐을 것       (trip_moments.is_public)
//   ③ 그때 동의한 판본이 지금 판본과 같을 것
//   셋 중 하나라도 아니면 그 Memory 는 없는 것처럼 다룬다. 커버가 읽기 시점에도
//   판본을 대조하는 것과 같은 방식이다(`verifyPersonalCover`).
//
// 사진 주소를 어떻게 내보내나
//   저장 경로도, moment id 도, photo id 도 내보내지 않는다. 대신 그 셋을 섞어
//   만든 되돌릴 수 없는 값 하나를 준다. 프록시는 그 여행의 공개 사진들을 훑어
//   같은 값을 다시 계산해 맞춰 본다 — 맞는 것이 없으면 없는 사진이다.
//   입력이 전부 UUID 라 값을 거꾸로 맞혀 볼 수 없고, 다른 여행의 사진은 애초에
//   비교 대상에 들어오지 않는다.
//
// 장소 이름
//   `place_name` 만 쓴다. 없으면 없는 채로 내보낸다. `location_label` 로
//   떨어지지 않는다 — 그건 좌표 문자열이라 내보내면 위치를 흘리는 것이다.
//
// 장소 결합(2026-09-30)
//   소유자 Story 와 같은 규칙(stop_key → 옛 행은 city_spot_id)으로 **서버에서** 결합하고,
//   밖으로는 그 Day 안의 자리(stopIndex)만 내보낸다. stop_key·stopId·user_spot id 는 나가지 않는다.
//   추천 코스에만 있는 장소·사용자가 새로 넣은 장소도 공개 링크에서 제자리에 붙는다.

import { stopKeysOf } from "../trip-moments/stop-binding.ts";

/** 서버가 읽어야 하는 Memory 컬럼. 이 목록 밖의 값은 가져오지 않는다. */
export const PUBLIC_MEMORY_SELECT_COLUMNS =
  "moment_id, memo, place_name, city_spot_id, stop_key, day_number, captured_at, storage_path, is_public, public_consent_at, public_consent_version";
/** 061(title) 적용 환경용 — 미적용이면 호출부가 위 목록으로 fallback 한다. */
export const PUBLIC_MEMORY_SELECT_COLUMNS_061 = `${PUBLIC_MEMORY_SELECT_COLUMNS}, title`;

/** DB 에서 읽은 Memory 한 행 중 이 모듈이 쓰는 것 */
export interface InternalMemoryRow {
  moment_id:              string;
  memo:                   string | null;
  /** 순간 제목(061). 미적용 환경 행에는 없다. */
  title?:                 string | null;
  place_name:             string | null;
  city_spot_id:           number | null;
  /** 일정 항목 열쇠(055). 서버 안에서 결합에만 쓰고 밖으로 내보내지 않는다 */
  stop_key?:              string | null;
  day_number:             number | null;
  captured_at:            string | null;
  storage_path:           string | null;
  is_public:              boolean | null;
  public_consent_at:      string | null;
  public_consent_version: string | null;
}

/** `trip_moment_photos` 한 행 중 이 모듈이 쓰는 것 */
export interface InternalPhotoRow {
  photo_id:     string;
  moment_id:    string;
  storage_path: string;
  sort_index?:  number | null;
  created_at?:  string | null;
}

/** 밖으로 나가는 사진. 저장 경로도 id 도 없다. */
export interface PublicMemoryPhoto {
  /** 프록시가 알아보는 되돌릴 수 없는 값 */
  ref: string;
}

/** 밖으로 나가는 Memory. 금지 필드는 자리 자체가 없다. */
export interface PublicMemory {
  dayNumber: number | null;
  memo:      string | null;
  /** 저장된 순간 제목 그대로 — 공개로 고른 Memory 의 일부다(별도 동의 아님). */
  title:     string | null;
  placeName: string | null;
  /** 공식 장소일 때만. 나중에 "내 Saved 로" 를 붙일 때 쓴다. */
  placeId:   string | null;
  /** 결합된 일정 장소의 그 Day 안 자리(0부터). 서버가 소유자 Story 와 같은 규칙으로 정한다. 없으면 null */
  stopIndex: number | null;
  photos:    PublicMemoryPhoto[];
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 이 Memory 를 내보내도 되는가.
 *
 * 여행이 공개인지는 호출하는 쪽이 이미 확인했다(공개 아니면 여기까지 오지
 * 않는다). 여기서는 Memory 쪽 두 조건만 본다.
 */
export function isMemoryPublic(
  row: Pick<InternalMemoryRow, "is_public" | "public_consent_at" | "public_consent_version">,
  currentConsentVersion: string,
): boolean {
  if (row.is_public !== true)   return false;
  if (!clean(row.public_consent_at)) return false;
  // 옛 판본에 동의한 것을 지금 문구에 동의한 것으로 치지 않는다
  if (row.public_consent_version !== currentConsentVersion) return false;
  return true;
}

// ── 사진 주소 ────────────────────────────────────────────────────────────────
/** 되돌릴 수 없는 값의 길이. 128비트면 맞혀 볼 수 없다. */
const REF_HEX_LEN = 32;

/**
 * 사진 하나를 가리키는 값.
 *
 * 여행·Memory·저장경로를 함께 섞는다. 여행이 다르면 값도 달라서, 어떤 여행의
 * 값을 다른 여행에 들고 가도 맞지 않는다. 프록시가 같은 식으로 다시 계산해
 * 대조하므로 이 값만으로는 아무 경로도 복원되지 않는다.
 */
export async function photoRef(
  itineraryId: string,
  momentId:    string,
  storagePath: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${itineraryId}\n${momentId}\n${storagePath}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, REF_HEX_LEN);
}

/** 값이 우리가 만든 모양인가 — 프록시가 DB 를 건드리기 전에 먼저 본다 */
export function isPhotoRef(v: unknown): v is string {
  return typeof v === "string" && new RegExp(`^[0-9a-f]{${REF_HEX_LEN}}$`).test(v);
}

// ── 순서 ─────────────────────────────────────────────────────────────────────
/**
 * Memory 순서. 매 요청 흔들리면 안 된다.
 *
 * day 가 먼저다. day 가 없는 기록은 **맨 뒤**로 보낸다 — 버리지 않고 자리를
 * 정해 준다. 같은 day 안에서는 찍은 시각, 그것도 같으면 id 로 가른다.
 * 정렬에 쓴 시각과 id 는 밖으로 나가지 않는다.
 */
export function orderMemories<T extends { day_number: number | null; captured_at: string | null; moment_id: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ad = a.day_number ?? Number.MAX_SAFE_INTEGER;
    const bd = b.day_number ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    const at = clean(a.captured_at), bt = clean(b.captured_at);
    if (at !== bt) return at < bt ? -1 : 1;
    return a.moment_id < b.moment_id ? -1 : a.moment_id > b.moment_id ? 1 : 0;
  });
}

// ── 정제 ─────────────────────────────────────────────────────────────────────
export interface SerializeInput {
  itineraryId: string;
  rows:        InternalMemoryRow[];
  /** moment_id → 그 Memory 의 사진들 (owner 와 같은 순서로 이미 정렬된 경로 목록) */
  photoPathsByMoment: Map<string, string[]>;
  consentVersion: string;
  /** 실재가 확인된 city_spot id 들. 없어진 장소는 여기 없다. */
  validCitySpotIds?: ReadonlySet<number>;
  /** moment_id → 그 Day 안 장소 자리(bindMemoriesToStops). 없으면 결합하지 않는다 */
  stopIndexByMoment?: ReadonlyMap<string, number>;
}

/**
 * 공개용 Memory 목록.
 *
 * DB 행을 펼치지 않는다(`...row` 금지). 내보낼 것만 새 객체에 담는다 —
 * 나중에 컬럼이 늘어도 저절로 공개되지 않는다.
 */
export async function serializePublicMemories(input: SerializeInput): Promise<PublicMemory[]> {
  const eligible = input.rows.filter(r => isMemoryPublic(r, input.consentVersion));
  const ordered  = orderMemories(eligible);

  const out: PublicMemory[] = [];
  for (const r of ordered) {
    const paths = input.photoPathsByMoment.get(r.moment_id) ?? [];
    const photos: PublicMemoryPhoto[] = [];
    for (const p of paths) {
      photos.push({ ref: await photoRef(input.itineraryId, r.moment_id, p) });
    }

    // 공식 장소가 사라졌으면 그 열쇠만 뺀다 — Story 전체를 죽이지 않는다
    const spotId = typeof r.city_spot_id === "number" ? r.city_spot_id : null;
    const placeId = spotId !== null && (input.validCitySpotIds?.has(spotId) ?? true)
      ? String(spotId)
      : null;

    const memo = clean(r.memo);
    const title = clean(r.title);
    out.push({
      dayNumber: typeof r.day_number === "number" ? r.day_number : null,
      memo:      memo === "" ? null : memo,
      title:     title === "" ? null : title,
      placeName: clean(r.place_name) === "" ? null : clean(r.place_name),
      placeId,
      stopIndex: input.stopIndexByMoment?.get(r.moment_id) ?? null,
      photos,
    });
  }
  return out;
}

// ── 일정 장소 결합 (서버 전용) ──────────────────────────────────────────────
type RawStop = { place_id?: unknown; source?: unknown; sourceKey?: unknown; stopId?: unknown };

function rawScheduled(raw: unknown): { dayNumber?: unknown; places?: unknown }[] {
  if (Array.isArray(raw)) return raw as { dayNumber?: unknown; places?: unknown }[];
  if (raw && typeof raw === "object") {
    const v2 = raw as { __v?: unknown; scheduled?: unknown };
    if (v2.__v === 2 && Array.isArray(v2.scheduled)) return v2.scheduled as { dayNumber?: unknown; places?: unknown }[];
  }
  return [];
}

/**
 * 공개 Memory → 그 Day 안 장소 자리. 소유자 Story(momentBelongsToStop)와 같은 규칙이다:
 *   ① stop_key 가 있으면 그 열쇠로만  ② 없는 옛 행은 공식 장소에 한해 city_spot_id 로.
 * 같은 Day 안에서만 찾고, 한 기록은 한 장소에만 붙는다. 장소명으로 추측하지 않는다.
 */
export function bindMemoriesToStops(rawDays: unknown, rows: InternalMemoryRow[]): Map<string, number> {
  const out = new Map<string, number>();
  rawScheduled(rawDays).forEach((day, di) => {
    const dayNumber = typeof day.dayNumber === "number" ? day.dayNumber : di + 1;
    const places = Array.isArray(day.places) ? (day.places as RawStop[]) : [];
    const dayRows = rows.filter(r => r.day_number === dayNumber);
    places.forEach((p, idx) => {
      const pid = typeof p.place_id === "string" || typeof p.place_id === "number" ? String(p.place_id) : null;
      const keys = stopKeysOf({
        place_id:  pid,
        source:    typeof p.source === "string" ? p.source : null,
        sourceKey: typeof p.sourceKey === "string" ? p.sourceKey : null,
        stopId:    typeof p.stopId === "string" ? p.stopId : null,
      });
      if (keys.length === 0) return;
      for (const r of dayRows) {
        if (out.has(r.moment_id)) continue;
        const mk = clean(r.stop_key);
        const hit = mk !== ""
          ? keys.includes(mk)
          : p.source === "city_spot" && typeof r.city_spot_id === "number" && pid !== null && /^\d+$/.test(pid) && String(r.city_spot_id) === pid;
        if (hit) out.set(r.moment_id, idx);
      }
    });
  });
  return out;
}
