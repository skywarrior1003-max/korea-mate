// 장소 원천 식별자 (source identity)
//
// 왜 필요한가
//   Explore 는 서로 다른 세 소스를 한 목록으로 합친다 — Supabase city_spots,
//   public/data/local-info.json, public/data/events.json. 세 소스의 숫자 ID 공간이
//   분리돼 있지 않아 `local-${spot.id}` 하나로는 서로 다른 장소가 같은 키를 갖는다.
//   실측(2026-07-30, 부산 158카드): 충돌 ID 59개 · 영향 카드 118개(74%).
//
//   그 결과 운영에서 세 가지가 깨져 있었다.
//     A. 다른 장소를 담았는데 "이미 담김"으로 표시되고 추가가 막힘
//     B. local-info 카드의 "View full details" 가 무관한 DB 장소로 이동 (63건)
//     C. local-info 를 담으면 같은 번호의 무관한 DB 장소가 스케줄러 후보에서 제외
//
// 왜 기존 id 를 바꾸지 않는가
//   저장된 일정 JSON 의 unscheduled[].id 에 `local-*` 가 이미 들어 있다(운영 61건
//   중 19건). DB 를 고칠 수 없으므로 id 형식을 바꾸면 그 데이터가 재해석되어
//   같은 결함이 과거 일정에서 되살아난다. id 는 호환용으로 고정하고, 판정에
//   쓰는 identity 를 별도 필드로 추가한다.
//
// 이 파일이 유일한 정책 SSOT 다. sourceKey 를 만들거나 해석하는 규칙을
// 다른 파일에 복제하지 않는다.
//
// sourceKey 는 "원천에서의 고유 식별자"이지 "같은 장소인가"가 아니다.
// 서로 다른 소스에 들어 있는 실제 동일 장소(예: Gwangalli 계열)를 합치는 것은
// canonical 문제이며 이 파일의 책임이 아니다. canonicalPlaceKey 라고 부르지 않는다.

/**
 * identity 를 쓰는 localStorage 키.
 *
 * 이 파일에 두는 이유: 마이그레이션과 favorites 가 같은 이름을 봐야 하는데,
 * 한쪽이 다른 쪽을 값으로 import 하면 순수 모듈이 브라우저 코드에 묶인다.
 * 이름만 여기 모아 양쪽이 각자 참조한다.
 */
export const IDENTITY_STORAGE_KEYS = {
  cart:       "koreamate_cart",
  savedData:  "koreamate_saved_spots_data",
  legacyFavs: "koreamate_favorites",
  favSources: "koreamate_favorite_source_keys",
  journal:    "koreamate_identity_migration_journal",
  version:    "koreamate_identity_migration_version",
} as const;

/** city_spots PK 만 정확히 매칭한다. 부분 포함으로 자르지 않는다. */
const CITY_SPOT_RE = /^city_spot:([0-9]+)$/;

/** 도시 이름을 namespace 조각으로 정규화 — "Busan" · "busan" → "busan" */
export function normalizeCityKey(city: string | null | undefined): string {
  return (city ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

// ── sourceKey 생성 ───────────────────────────────────────────────────────────
//
// city_spots 는 DB 전역 PK 라 도시가 필요 없다. 나머지는 도시별 파일이므로
// 서울·제주·경주로 확장할 때 같은 수동 ID 가 재충돌하지 않도록 도시를 넣는다.

export function citySpotSourceKey(dbId: number | string): string {
  return `city_spot:${dbId}`;
}

export function localInfoSourceKey(city: string, fileId: number | string): string {
  return `local_info:${normalizeCityKey(city)}:${fileId}`;
}

/** events.json 의 원본 문자열 id(`evt-anchor-001`)를 쓴다. 배열 index 를 쓰지 않는다. */
export function eventSourceKey(city: string, eventId: string): string {
  return `event:${normalizeCityKey(city)}:${eventId}`;
}

/**
 * 사용자의 실제 숙소 체크인 stop. 카탈로그 id 가 없어 일정에 넣는 순간 한 번 만든
 * uuid 를 stop 객체에 저장한다(`stay:<uuid>`). 이후 reload·순서 변경·시간 수정에도
 * 그 값이 그대로 남아 순간(Moment)이 이 숙소를 정확히 가리킬 수 있다.
 * 이름·좌표·시각으로 만들지 않는다 — 그것들은 바뀌고, 같은 호텔이 두 여행에 나올 수 있다.
 */
export function staySourceKey(uuid: string): string {
  return `stay:${uuid}`;
}

export function userSpotSourceKey(uuid: string): string {
  return `user_spot:${uuid}`;
}

// ── legacy fingerprint ───────────────────────────────────────────────────────
//
// 마이그레이션에서 어느 소스인지 확정할 수 없는 기존 항목에 부여한다.
// 그대로 `local-<n>` 으로 남기면 충돌이 유지되므로 반드시 고유 키를 준다.
//
// 동기 해시를 쓴다. crypto.subtle 은 비동기라 Cart 읽기 전체를 async 로 바꿔야
// 하고, 여기 필요한 것은 암호학적 강도가 아니라 결정성뿐이다.
// trip-cover 에서 쓰는 것과 같은 FNV-1a 다.
function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 비교용 정규화 — 대소문자·기호·공백 차이를 흡수한다 */
export function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface LegacyFingerprintInput {
  city:     string | null | undefined;
  name:     string | null | undefined;
  address:  string | null | undefined;
  category: string | null | undefined;
}

/**
 * 개인정보를 넣지 않는다 — 사용자 메모·device id·사진·addedAt·sortOrder 제외.
 * 같은 장소 정보면 언제 실행해도 같은 값이 나온다(멱등 마이그레이션 전제).
 */
export function legacySourceKey(input: LegacyFingerprintInput): string {
  const city = normalizeCityKey(input.city) || "unknown";
  const seed = [
    city,
    normalizeForMatch(input.name),
    normalizeForMatch(input.address),
    normalizeForMatch(input.category),
  ].join("|");
  // 32bit 하나로는 충돌 여지가 있어 seed 를 두 번 다르게 섞는다
  const a = fnv1a32(seed).toString(36).padStart(7, "0");
  const b = fnv1a32(`${seed}#salt`).toString(36).padStart(7, "0");
  return `legacy:${city}:${a}${b}`;
}

// ── 해석 ─────────────────────────────────────────────────────────────────────

/** sourceKey 가 city_spots 행을 가리키면 DB PK 를, 아니면 null */
export function parseCitySpotId(sourceKey: string | null | undefined): string | null {
  if (typeof sourceKey !== "string") return null;
  const m = CITY_SPOT_RE.exec(sourceKey);
  return m ? m[1] : null;
}

/** 이 장소가 /place/<id>/ 상세 페이지를 가진 DB 장소인가 */
export function isCitySpotSource(sourceKey: string | null | undefined): boolean {
  return parseCitySpotId(sourceKey) !== null;
}

/**
 * 사용자가 직접 등록한 개인 장소인가.
 *
 * 개인 장소는 이름 자체가 사적이다 — `display_title` 은 그 사람에게 그곳이
 * 무엇이었는지를 적은 값이지 장소의 factual name 이 아니다. 그래서 외부로
 * 무언가를 보내기 전에 이 판정이 필요하다.
 */
export function isUserSpotSource(sourceKey: string | null | undefined): boolean {
  return typeof sourceKey === "string" && sourceKey.startsWith("user_spot:");
}

// ── Cart·Saved 판정 ──────────────────────────────────────────────────────────

/** sourceKey 를 갖는 최소 형태 — CartItem·EventItem·저장 스냅샷 모두 만족한다 */
export interface HasIdentity {
  id: string;
  sourceKey?: string;
  // fallback 지문에만 쓴다. 없으면 없는 대로 처리한다.
  name?:     string;
  city?:     string;
  address?:  string;
  type?:     string;
}

function hasValue(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * 중복·Added·Remove·**React key** 판정에 쓰는 키.
 *
 * 우선순위
 *   1. 유효한 sourceKey
 *   2. 기존 id (아직 마이그레이션되지 않은 항목)
 *   3. 둘 다 없으면 개발 경고 + 내용 기반 결정적 지문
 *
 * **반드시 비어 있지 않은 문자열을 반환한다.** React key 로 쓰이므로 빈 값이
 * 나오면 목록 전체가 잘못 재사용된다. 배열 index 를 fallback 으로 쓰지 않고,
 * 사용자 메모·표시 순서·현재 locale 도 키에 넣지 않는다 — 그 값들이 바뀌면
 * 같은 장소가 다른 항목으로 취급된다.
 */
export function getItemSourceKey(item: HasIdentity): string {
  if (hasValue(item.sourceKey)) return item.sourceKey;
  if (hasValue(item.id)) return item.id;

  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    // 이름·주소는 출력하지 않는다
    console.warn("[identity] item without sourceKey and id — falling back to content fingerprint");
  }
  return legacySourceKey({
    city: item.city, name: item.name, address: item.address, category: item.type,
  });
}

export function isSameSourcePlace(a: HasIdentity, b: HasIdentity): boolean {
  return getItemSourceKey(a) === getItemSourceKey(b);
}

// ── Planner hint key ─────────────────────────────────────────────────────────

/**
 * Cart 항목 → `/api/trip/plan` 의 `cart_hints[].place_id`.
 *
 * city_spots 만 바레 숫자로 보낸다. 그래야 plan.ts 가 DB 후보와 대조해 중복을
 * 제거하고(BUG-01 유지), place_map 이 표시정보를 채운다. 나머지 소스는
 * sourceKey 원문을 그대로 보내 어떤 DB 후보와도 매칭되지 않게 한다 — 이것이
 * 결함 C(무관한 DB 장소가 후보에서 빠지는 문제)의 해결이다.
 *
 * plan.ts 의 scheduler·dedupe 로직은 건드리지 않는다. 바꾸는 것은 이 경계에서
 * 만들어 보내는 키 값뿐이다.
 *
 * `local-<n>` → `<n>` 자동 변환을 여기서 하지 않는다. 그 변환이 정확히
 * 결함 C 의 원인이었다. 옛 항목은 마이그레이션이 city_spot 임을 확정했을 때만
 * city_spot: sourceKey 를 갖게 되고, 그때 비로소 숫자로 나간다.
 *
 * cart_hints · cartItemByKey · cartCoordByKey · cartHintMap · planner 결과 재결합이
 * **모두 이 함수 하나**를 써야 한다. 한 곳이라도 다른 규칙을 쓰면 다시 어긋난다.
 */
export function getPlannerHintKey(item: HasIdentity): string {
  const key = getItemSourceKey(item);
  return parseCitySpotId(key) ?? key;
}
