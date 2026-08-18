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

/** 서버가 읽어야 하는 Memory 컬럼. 이 목록 밖의 값은 가져오지 않는다. */
export const PUBLIC_MEMORY_SELECT_COLUMNS =
  "moment_id, memo, place_name, city_spot_id, day_number, captured_at, storage_path, is_public, public_consent_at, public_consent_version";

/** DB 에서 읽은 Memory 한 행 중 이 모듈이 쓰는 것 */
export interface InternalMemoryRow {
  moment_id:              string;
  memo:                   string | null;
  place_name:             string | null;
  city_spot_id:           number | null;
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
  placeName: string | null;
  /** 공식 장소일 때만. 나중에 "내 Saved 로" 를 붙일 때 쓴다. */
  placeId:   string | null;
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
    out.push({
      dayNumber: typeof r.day_number === "number" ? r.day_number : null,
      memo:      memo === "" ? null : memo,
      placeName: clean(r.place_name) === "" ? null : clean(r.place_name),
      placeId,
      photos,
    });
  }
  return out;
}
