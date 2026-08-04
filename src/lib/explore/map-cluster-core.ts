// Explore Map 표시 계층 계산 — 지도 SDK 없이 순수 함수로 분리한다.
//
// 지도 관련 버그(913430d)가 단위 테스트를 전부 통과하고도 운영에 나간 이유는
// 판단 로직이 Naver SDK 콜백 안에 섞여 있어 테스트가 닿지 못했기 때문이다.
// "어떤 줌에서 무엇을 그릴지" 와 "어떤 장소끼리 묶을지" 는 SDK 가 없어도
// 결정되는 계산이므로 여기로 빼서 검증한다.

export interface ClusterableSpot {
  lat: number;
  lng: number;
  sourceKey?: string;
  id: number;
}

export interface SpotCluster<T> {
  /** 묶인 장소 — 항상 2개 이상. 1개짜리 묶음은 만들지 않는다. */
  members: T[];
  count: number;
  lat: number;
  lng: number;
  /** 셀 좌표 기반 안정 키 — 같은 줌·같은 결과면 같은 키가 나온다. */
  key: string;
}

export interface DisplayPlan<T> {
  mode: "cluster" | "individual";
  clusters: SpotCluster<T>[];
  /** 개별 마커로 그릴 장소. cluster 모드에서는 홀로 남은 장소만 들어간다. */
  singles: T[];
  /** 이름 pill 을 함께 그릴지 — 겹쳐서 읽을 수 없는 줌에서는 그리지 않는다. */
  showLabels: boolean;
}

// ── 줌 임계값 ────────────────────────────────────────────────────────────────
//
// 운영 부산 94개 실좌표를 390×844 뷰포트 기준으로 실측해 정했다.
// (뷰포트 내 평균 장소 수 / 이름 pill 겹침 쌍 평균·최대 / 마커 겹침 최대)
//
//   z=13(운영 초기)  13.5개  pill 17.74 · 45   marker 43
//   z=14             6.2개  pill  3.94 · 16   marker 16
//   z=15             3.1개  pill  0.93 ·  7   marker  4
//   z=16             2.0개  pill  0.23 ·  2   marker  1   ← 여기서 읽을 수 있게 된다
//   z=17             1.4개  pill  0.03 ·  1   marker  0
//
// z16 부터 이름 pill 이 사실상 겹치지 않으므로 그 아래는 클러스터로 접는다.
// 임계값을 하나만 두면 "마커는 개별인데 이름은 안 보이는" 어중간한 구간이
// 생기므로, 개별 전환과 이름 표시를 같은 지점으로 맞춘다.
export const CLUSTER_MAX_ZOOM = 15;
export const LABEL_MIN_ZOOM = 16;

/** 클러스터 격자 한 칸의 화면 크기(px). 마커 히트박스 44px 보다 넉넉히 잡는다. */
export const CLUSTER_CELL_PX = 72;

/** 이름 pill 최대 폭(px) — 넘치면 CSS 말줄임. 실측 겹침 계산도 이 값을 썼다. */
export const LABEL_MAX_WIDTH_PX = 180;

/**
 * 이름 pill 상한(표시 폭 단위). CSS 말줄임과 별개로 DOM 폭주를 막는다.
 *
 * 글자 수가 아니라 폭으로 세는 이유: 한글·일본어·중국어 한 글자는 라틴 한
 * 글자의 약 두 배 폭이다. 28"글자" 로 자르면 EN 은 180px 에 맞는데 KO/JA/ZH 는
 * 그 두 배가 되어 pill 하나가 화면을 가로지른다.
 */
export const LABEL_MAX_WIDTH_UNITS = 28;

/** 전각(CJK·가나·한글·전각기호)은 2, 그 외는 1로 센 표시 폭. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += isWide(ch) ? 2 : 1;
  return w;
}

function isWide(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x1100 && c <= 0x115f) ||   // 한글 자모
    (c >= 0x2e80 && c <= 0xa4cf) ||   // CJK 부수 · 가나 · CJK 통합한자
    (c >= 0xac00 && c <= 0xd7a3) ||   // 한글 음절
    (c >= 0xf900 && c <= 0xfaff) ||   // CJK 호환한자
    (c >= 0xfe30 && c <= 0xfe6f) ||   // CJK 호환 폼
    (c >= 0xff00 && c <= 0xff60) ||   // 전각 영숫자·기호
    (c >= 0xffe0 && c <= 0xffe6)
  );
}

const EARTH_CIRCUMFERENCE_M = 156543.03392;

/** Web Mercator 축척 — 위도·줌에서 픽셀당 미터. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export function displayMode(zoom: number): "cluster" | "individual" {
  return zoom > CLUSTER_MAX_ZOOM ? "individual" : "cluster";
}

export function shouldShowLabels(zoom: number): boolean {
  return zoom >= LABEL_MIN_ZOOM;
}

/** 선택 키 계약 — 병합 목록의 같은 숫자 id 를 다른 소스와 섞지 않는다. */
export function spotKey(s: ClusterableSpot): string {
  return s.sourceKey ?? String(s.id);
}

/**
 * 이름 pill 텍스트.
 *
 * 번역하거나 축약형을 지어내지 않는다 — 원문을 그대로 쓰되 길면 잘라낸다.
 * 전체 이름은 하단 선택 카드와 List 가 계속 보여준다.
 */
export function labelText(name: string, maxWidth: number = LABEL_MAX_WIDTH_UNITS): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (displayWidth(t) <= maxWidth) return t;
  let out = "", w = 0;
  for (const ch of t) {
    const cw = isWide(ch) ? 2 : 1;
    if (w + cw > maxWidth - 1) break;   // 말줄임표 자리를 남긴다
    out += ch; w += cw;
  }
  return out.trimEnd() + "…";
}

/** 마커 HTML 에 이름을 넣기 전 이스케이프 — 장소명은 DB 문자열이다. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 줌에 맞춰 클러스터/개별 마커를 계산한다.
 *
 * 격자 방식을 쓴다. 외부 클러스터 라이브러리를 새로 들이지 않으려는 이유도
 * 있지만, 격자는 같은 입력·같은 줌이면 항상 같은 결과가 나와서(순서 무관)
 * 지도를 흔들 때 묶음이 덜컥거리지 않는다.
 *
 * 좌표가 없는 장소는 지도에 표현할 수 없으므로 제외한다 — 기존 정책과 같다.
 */
export function planDisplay<T extends ClusterableSpot>(
  spots: T[],
  zoom: number,
  cellPx: number = CLUSTER_CELL_PX,
): DisplayPlan<T> {
  const withCoords = spots.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat !== 0 && s.lng !== 0);
  const showLabels = shouldShowLabels(zoom);

  if (displayMode(zoom) === "individual") {
    return { mode: "individual", clusters: [], singles: withCoords, showLabels };
  }

  // 격자 한 칸의 위경도 크기 — 화면 px 를 위도 보정해 도(degree)로 환산한다.
  //
  // 기준 위도는 정수로 반올림해 쓴다. 첫 원소의 위도를 그대로 쓰면 배열 순서가
  // 바뀌는 것만으로 칸 크기가 미세하게 달라져 격자 경계가 밀리고, 같은 결과인데
  // 묶음이 달라 보인다. 칸 크기는 대략만 맞으면 되므로 1도 단위로 고정한다.
  const refLat = Math.round(
    withCoords.length > 0 ? withCoords.reduce((a, s) => a + s.lat, 0) / withCoords.length : 0,
  );
  const mPerPx = metersPerPixel(refLat, zoom);
  const cellM = mPerPx * cellPx;
  const dLat = cellM / 111_320;
  const dLng = cellM / (111_320 * Math.max(0.01, Math.cos((refLat * Math.PI) / 180)));

  const cells = new Map<string, T[]>();
  for (const s of withCoords) {
    const cy = Math.floor(s.lat / dLat);
    const cx = Math.floor(s.lng / dLng);
    const k = `${cx}:${cy}`;
    const bucket = cells.get(k);
    if (bucket) bucket.push(s);
    else cells.set(k, [s]);
  }

  const clusters: SpotCluster<T>[] = [];
  const singles: T[] = [];
  for (const [k, members] of cells) {
    // 1개짜리 묶음은 숫자 뱃지로 만들지 않는다 — 그냥 그 장소의 마커다.
    if (members.length < 2) { singles.push(members[0]); continue; }
    let lat = 0, lng = 0;
    for (const m of members) { lat += m.lat; lng += m.lng; }
    clusters.push({
      members,
      count: members.length,
      lat: lat / members.length,
      lng: lng / members.length,
      key: `c${zoom}:${k}`,
    });
  }

  return { mode: "cluster", clusters, singles, showLabels };
}

/** 계획에 실제로 등장하는 장소 키 — 누락·중복 검증용. */
export function planSpotKeys<T extends ClusterableSpot>(plan: DisplayPlan<T>): string[] {
  const keys: string[] = [];
  for (const c of plan.clusters) for (const m of c.members) keys.push(spotKey(m));
  for (const s of plan.singles) keys.push(spotKey(s));
  return keys;
}

/** 클러스터를 눌렀을 때 갈 줌 — 한 번에 풀리도록 올리되 상한을 둔다. */
export const CLUSTER_ZOOM_STEP = 2;
export const MAX_ZOOM = 18;

export function zoomAfterClusterClick(current: number): number {
  return Math.min(MAX_ZOOM, current + CLUSTER_ZOOM_STEP);
}
