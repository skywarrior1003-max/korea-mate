// My Place 를 저장할 수 있는가, 그리고 어느 경로로 저장하는가.
//
// 저장 가능 여부는 사용자가 제목을 적었는지로 판단하지 않는다. 시스템이 이
// 장소를 이해할 근거(Anchor)가 하나라도 있는지로 판단한다. 제목은 장소를
// 이해하는 근거가 아니라 표현 값이다.
//
// 지금 UI 가 만들 수 있는 Anchor 는 둘뿐이다 — 좌표 짝, 그리고 사진.
// canonical place 관계·trip context·링크는 저장할 컬럼이 아직 없으므로
// 있는 것처럼 계산하지 않는다.

export interface AnchorInput {
  lat:  number | null;
  lng:  number | null;
  /** 이번에 새로 고른 사진이 있는가. */
  hasPhoto: boolean;
}

/** 좌표는 짝일 때만 위치다. 한쪽만 있는 값은 지도에 찍을 수도 고칠 수도 없다. */
export function hasCompleteGps(v: { lat: number | null; lng: number | null }): boolean {
  return v.lat !== null && v.lng !== null;
}

/**
 * 새 My Place 를 만들 수 있는가.
 *
 * name·address·note·category 는 아무리 채워도 여기에 영향을 주지 않는다.
 * 그것들만 있는 행은 나중에 그게 무엇이었는지 아무도 알 수 없다.
 */
export function canCreate(v: AnchorInput): boolean {
  return hasCompleteGps(v) || v.hasPhoto;
}

/**
 * 이미 있는 My Place 를 고칠 수 있는가.
 *
 * 만들기와 규칙이 다르다. 이름만으로 만들어진 예전 행이 아직 남아 있고,
 * 그 행의 메모를 고치려는 사람을 막을 이유가 없다. 서버 PUT 이 검사하는
 * 최종 상태 규칙(legacy name OR 좌표 OR 기존 사진)과 같은 말을 한다.
 *
 * 이름 항은 legacy 호환일 뿐이며 새 장소를 만드는 근거가 아니다.
 */
export function canEdit(v: AnchorInput & { name: string; hasExistingPhoto: boolean }): boolean {
  if (hasCompleteGps(v)) return true;
  if (v.hasPhoto || v.hasExistingPhoto) return true;
  return v.name.trim().length > 0;
}

export type CreateRoute =
  /** 좌표만 — 기존 JSON 생성 */
  | "json"
  /** 좌표와 사진 — 장소를 먼저 만들고 사진을 붙인다 */
  | "json-then-photo"
  /** 사진만 — 사진이 유일한 근거라 한 번에 만들어야 한다 */
  | "with-photo"
  /** 근거 없음 — 아무것도 보내지 않는다 */
  | "blocked";

/**
 * 어느 경로로 만들 것인가.
 *
 * 사진이 있다고 무조건 /with-photo 를 쓰지 않는다. 좌표가 이미 있으면 장소는
 * 사진 없이도 성립하므로, 장소를 먼저 만들고 사진을 나중에 붙인다. 그래야
 * 사진 업로드가 실패해도 사용자가 방금 저장한 장소가 사라지지 않는다.
 *
 * 좌표가 없으면 사진이 유일한 근거다. 그때는 사진이 실패하면 남길 것이
 * 없으므로 한 요청으로 처리하고, 실패하면 아무것도 만들지 않는다.
 */
export function decideCreateRoute(v: AnchorInput): CreateRoute {
  const gps = hasCompleteGps(v);
  if (gps && v.hasPhoto)  return "json-then-photo";
  if (gps)                return "json";
  if (v.hasPhoto)         return "with-photo";
  return "blocked";
}
