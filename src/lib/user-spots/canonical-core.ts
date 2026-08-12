// 공개 장소(city_spots)를 개인 장소(user_spots)로 남길 때의 순수 규칙.
//
// 핵심은 하나다 — 사실 값은 서버가 DB 에서 읽는다. 클라이언트가 보낸 이름·좌표는
// 사실의 출처가 아니다. 사용자가 고른 것은 "어느 장소인가"(id) 뿐이고, 그 장소가
// 무엇인지는 우리가 안다.

/** user_spots.category CHECK 5종. 여기를 벗어난 값은 저장하지 않는다. */
export const USER_SPOT_CATEGORIES = [
  "attraction", "nature", "restaurant", "event", "accommodation",
] as const;
export type UserSpotCategoryValue = typeof USER_SPOT_CATEGORIES[number];

/**
 * 공개 장소의 category 를 개인 장소의 category 로 옮긴다.
 *
 * 지금 city_spots 에 실재하는 값은 restaurant·attraction·nature 셋뿐이고 전부
 * 5종 안에 있다. 그래도 매핑을 명시해 두는 이유는, 나중에 city_spots 에
 * cafe 같은 값이 생겼을 때 조용히 저장되어 DB CHECK 에서 터지는 대신
 * 여기서 먼저 멈추게 하기 위해서다.
 *
 * 아는 값이 아니면 null 을 준다 — 임의로 attraction 으로 뭉개지 않는다.
 * 모르는 종류를 아는 척 저장하면 그 장소의 성격이 조용히 바뀐다.
 */
export function mapCanonicalCategory(value: string | null | undefined): UserSpotCategoryValue | null {
  const v = (value ?? "").trim().toLowerCase();
  return (USER_SPOT_CATEGORIES as readonly string[]).includes(v)
    ? (v as UserSpotCategoryValue)
    : null;
}

/** 서버가 city_spots 에서 읽는 값. 클라이언트가 보내는 값이 아니다. */
export interface CanonicalRow {
  id:       number;
  name:     string | null;
  city:     string | null;
  category: string | null;
  lat:      number | null;
  lng:      number | null;
}

/** user_spots 에 실제로 넣을 값. */
export interface CanonicalSnapshot {
  related_city_spot_id: number;
  name:     string;
  city?:    string;
  category: UserSpotCategoryValue;
  lat?:     number;
  lng?:     number;
}

export type SnapshotResult =
  | { ok: true;  snapshot: CanonicalSnapshot }
  | { ok: false; reason: "blank_name" | "unsupported_category" | "broken_coordinates" };

/**
 * 공개 장소 한 행에서 개인 장소로 옮길 사실 값을 만든다.
 *
 * 좌표는 있으면 복사하고 없으면 넣지 않는다. 좌표가 없는 공개 장소도
 * 개인 장소가 될 수 있어야 한다 — 경주 쪽 116곳이 그렇다. 그 경우 저장의
 * 근거는 "사용자가 이 장소를 골랐다" 는 관계와 그 장소의 이름이다.
 *
 * 한쪽 좌표만 있는 행은 거른다. 지도에 찍을 수도, 고칠 수도 없는 값이라
 * 개인 기록에 옮겨 담을 이유가 없다. (현재 실데이터에는 없다.)
 */
export function buildCanonicalSnapshot(row: CanonicalRow): SnapshotResult {
  const name = (row.name ?? "").trim();
  if (!name) return { ok: false, reason: "blank_name" };

  const category = mapCanonicalCategory(row.category);
  if (!category) return { ok: false, reason: "unsupported_category" };

  const hasLat = row.lat !== null && row.lat !== undefined;
  const hasLng = row.lng !== null && row.lng !== undefined;
  if (hasLat !== hasLng) return { ok: false, reason: "broken_coordinates" };

  const snapshot: CanonicalSnapshot = {
    related_city_spot_id: row.id,
    name,
    category,
  };
  const city = (row.city ?? "").trim();
  if (city) snapshot.city = city;
  if (hasLat && hasLng) {
    snapshot.lat = row.lat as number;
    snapshot.lng = row.lng as number;
  }
  return { ok: true, snapshot };
}

// ── 대표 이미지 ───────────────────────────────────────────────────────────────

/** city_spot_images 한 행 (+ 연결된 출처). */
export interface CanonicalImageRow {
  image_url:            string;
  display_eligible:     boolean;
  is_primary:           boolean;
  attribution_required: boolean;
  /** 사용자에게 보여줄 수 있는 출처 링크. 없으면 null. */
  source_url:           string | null;
}

export interface CanonicalImagePick {
  imageUrl:  string;
  /** 표기가 필요한 이미지일 때만 채워진다. 없으면 표기할 것이 없다는 뜻이다. */
  sourceUrl: string | null;
}

/**
 * 보여줘도 되는 대표 이미지를 고른다.
 *
 * 허용 기준은 display_eligible 하나다. rights_status 문자열로 판단하지 않는다 —
 * 지금 그 컬럼에는 VG_RESTAURANT_OFFICIAL·Type1·Type3·KTO_TYPE_UNKNOWN 처럼
 * 서로 다른 체계의 값이 섞여 있어서, 문자열을 읽어 허용 여부를 정하는 코드는
 * 값 하나가 추가되는 순간 틀린다. display_eligible 은 046 이 바로 그 판단을
 * 담으려고 만든 컬럼이다.
 *
 * 표기가 필요한데 보여줄 출처가 없으면 그 이미지는 쓰지 않는다. 권리 표기를
 * 못 하는 상태로 남의 사진을 먼저 띄우지 않는다 — 커버리지보다 앞선다.
 *
 * legacy city_spots.image_url 은 쓰지 않는다. 그 컬럼에는 권리 상태를 담을
 * 자리가 없다(046 헤더).
 */
export function pickCanonicalImage(rows: readonly CanonicalImageRow[]): CanonicalImagePick | null {
  const usable = rows.filter(r => {
    if (!r.display_eligible) return false;
    if (!(r.image_url ?? "").trim()) return false;
    if (r.attribution_required) return Boolean((r.source_url ?? "").trim());
    return true;
  });
  if (usable.length === 0) return null;

  // primary 를 먼저 본다. 없으면 남은 것 중 첫 번째.
  const chosen = usable.find(r => r.is_primary) ?? usable[0]!;
  return {
    imageUrl:  chosen.image_url,
    sourceUrl: chosen.attribution_required ? ((chosen.source_url ?? "").trim() || null) : null,
  };
}
