// GoKoreaMate — Trip Cover V1A 순수 로직 (검증 · 테마 판정 · 결정론적 선택)
//
// SSOT 는 data/trip-cover/busan-v1-assets.json 이며, 그 JSON 을 실제로 import 하는
// 모듈은 assets.data.ts 하나뿐이다.
//
// 이 파일이 JSON 을 직접 import 하지 않는 이유:
//   Cloudflare Pages 의 Functions 번들러(wrangler 3.114 / 구 esbuild)는 import 속성
//   (`with { type: "json" }`)을 파싱하지 못해 배포 빌드가 깨진다. 반대로 Node 의 ESM
//   런너는 속성이 없으면 JSON 을 로드하지 못한다. 순수 로직을 여기에 두고 JSON import
//   를 assets.data.ts 로 격리하면 Node 테스트·Next 빌드·Pages 번들이 모두 통과한다.
//
// 규칙:
// - KOGL Type 1 이 아닌 자산은 거부한다 (권리 미확인 이미지가 섞이는 것을 원천 차단)
// - 필수 필드가 잘못된 자산은 제외하되 런타임 전체를 실패시키지 않는다
// - 24건 전부 place_match_status=theme_only — 특정 장소의 사진이라고 표시하면 안 된다

export type CoverTheme =
  | "beach_ocean"
  | "food_market"
  | "nature_trails"
  | "culture_village"
  | "night_view"
  | "accommodation";

export const COVER_THEMES: readonly CoverTheme[] = [
  "beach_ocean", "food_market", "nature_trails",
  "culture_village", "night_view", "accommodation",
] as const;

/** 판정 불가 시 사용하는 부산 기본 테마 */
export const DEFAULT_THEME: CoverTheme = "beach_ocean";

/** 화면 노출용 테마 라벨 — 장소명이 아니라 분위기 라벨이다 */
export const THEME_LABEL: Record<CoverTheme, string> = {
  beach_ocean:     "Beach & Ocean",
  food_market:     "Food Journey",
  nature_trails:   "Nature & Trails",
  culture_village: "Culture & Streets",
  night_view:      "Night View",
  accommodation:   "Stay",
};

export interface CoverAsset {
  asset_id:           string;
  city:               string;
  theme:              CoverTheme;
  priority:           number;
  place_name:         string;   // 내부 참조용 — 화면 캡션으로 노출 금지
  image_url:          string;   // 원본 HTTPS. 클라이언트가 직접 쓰지 않고 프록시를 경유한다
  attribution_text:   string;
  publisher:          string;
  license_type:       string;
  width:              number;
  height:             number;
  landscape_fit:      string;
  vertical_fit:       string;
  place_match_status: "exact" | "high" | "theme_only";
}

const REQUIRED_LICENSE = "kogl_type1";
const ALLOWED_HOST     = "tong.visitkorea.or.kr";

export function isValidAsset(raw: unknown): raw is CoverAsset {
  if (raw === null || typeof raw !== "object") return false;
  const a = raw as Record<string, unknown>;

  const str = (k: string) => typeof a[k] === "string" && (a[k] as string).trim().length > 0;
  const num = (k: string) => typeof a[k] === "number" && Number.isFinite(a[k] as number) && (a[k] as number) > 0;

  if (!str("asset_id") || !str("city") || !str("theme")) return false;
  if (!str("image_url") || !str("attribution_text") || !str("license_type")) return false;
  if (!str("landscape_fit") || !str("vertical_fit")) return false;
  if (!num("width") || !num("height")) return false;

  // KOGL Type 1 외 자산 거부 — modification_use 는 manifest 최상위가 아닌
  // 권리 감사 원본에 있으므로, 로더에서는 license_type 을 단일 기준으로 삼는다.
  if (a.license_type !== REQUIRED_LICENSE) return false;

  if (!COVER_THEMES.includes(a.theme as CoverTheme)) return false;

  // 원본은 반드시 HTTPS + 허용 호스트 (mixed content / 임의 호스트 차단)
  let u: URL;
  try { u = new URL(a.image_url as string); } catch { return false; }
  if (u.protocol !== "https:" || u.hostname !== ALLOWED_HOST) return false;

  return true;
}

/**
 * 원본 manifest 배열 → 검증 통과 자산만, priority 오름차순 고정 정렬.
 * 정렬이 고정이어야 해시 선택이 안정적이다.
 */
export function buildCoverAssets(raw: unknown[]): readonly CoverAsset[] {
  return Object.freeze(
    (raw ?? [])
      .filter(isValidAsset)
      .sort((a, b) =>
        a.theme === b.theme
          ? (a.priority - b.priority) || a.asset_id.localeCompare(b.asset_id)
          : a.theme.localeCompare(b.theme),
      ),
  );
}

export function filterByTheme(pool: readonly CoverAsset[], theme: CoverTheme): readonly CoverAsset[] {
  return pool.filter((a) => a.theme === theme);
}

export function findById(pool: readonly CoverAsset[], assetId: string): CoverAsset | undefined {
  return pool.find((a) => a.asset_id === assetId);
}

/** 같은 출처 프록시 경로 — 클라이언트·Canvas 는 항상 이 URL 만 사용한다 */
export function coverProxyPath(assetId: string): string {
  return `/img/cover/${encodeURIComponent(assetId)}`;
}

// ── 표지 문구 ────────────────────────────────────────────────────────────────
//
// 표지에 실제로 무엇이 보이는지에 따라 문구가 갈린다. 개인 사진 위에 관광
// 테마명(예: "BEACH & OCEAN")을 붙이면 사용자의 사진을 관광 자산인 것처럼
// 잘못 설명하게 된다 — eyebrow 와 alt 양쪽 모두 해당된다.
//
// "unknown" 은 판정 전 상태다. 이때 테마 라벨을 먼저 그렸다가 personal 로
// 바꾸면 잘못된 라벨이 순간적으로 보이므로(플래시), 도시명만 표시한다.
// 판정 근거는 서버가 준 커버 종류뿐이다 — 이미지 로드 결과나 currentSrc 로
// 추론하지 않는다.
//
// 문구는 영어 고정이다. 표지 카드의 나머지(Day/Place/Copied 등)가 모두 영어라
// eyebrow 만 번역하면 한 카드 안에서 언어가 섞인다. 카드 전체 i18n 은 별건이다.

export type CoverDisplayKind = "unknown" | "personal" | "tourism";

/** 표지 상단 eyebrow — `CITY · THEME` / `CITY · MY TRIP STORY` / `CITY` */
export function coverEyebrow(city: string, kind: CoverDisplayKind, theme: CoverTheme): string {
  if (kind === "personal") return `${city} · MY TRIP STORY`;
  if (kind === "tourism")  return `${city} · ${THEME_LABEL[theme]}`;
  return city;
}

/** 표지 이미지 alt — 개인 사진과 unknown 에는 관광 테마명을 쓰지 않는다 */
export function coverAlt(
  kind: CoverDisplayKind,
  o: { city: string; theme: CoverTheme; title?: string | null },
): string {
  const named = (o.title ?? "").trim() || o.city;
  if (kind === "personal") return `${named} personal trip cover`;
  if (kind === "tourism")  return `${o.city} ${THEME_LABEL[o.theme]}`;
  return `${named} trip cover`;
}

// ══════════════════════════════════════════════════════════════════════════
// GoKoreaMate — Trip Cover 테마 판정 + 결정론적 자산 선택
//
// 한 단어로 결정하지 않는다. 일정 제목 · 장소명 · category · district 를 모두
// 점수화해 최고점 테마를 고른다. 동점·불명확이면 DEFAULT_THEME 로 떨어진다.
//
// 운영 실측 어휘 기준 (itineraries.days 710개 장소):
//   Attraction 185 · Park 81 · Market 71 · Restaurant 50 · Shopping 40
//   Experience 40 · nature 31 · attraction 24 · History 20 · Landmark 19
// 대소문자가 섞여 있으므로 전 입력을 trim + lowercase 후 판정한다.

export interface ThemeInputPlace {
  name?:     string | null;
  category?: string | null;
  location?: string | null;   // 자치구 (Haeundae-gu 등)
}

export interface ThemeInput {
  tripTitle?: string | null;
  places:     ThemeInputPlace[];
}

const norm = (v: unknown): string =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

/** 키워드 → 테마 가중치. category 는 강한 신호, 이름·제목은 보조 신호 */
const KEYWORDS: ReadonlyArray<readonly [CoverTheme, readonly string[]]> = [
  ["beach_ocean",     ["beach", "ocean", "coast", "sea", "harbor", "port", "haeundae",
                       "gwangalli", "songjeong", "dadaepo", "songdo", "oryukdo", "waterfront"]],
  ["food_market",     ["market", "restaurant", "seafood", "food", "shopping", "jagalchi",
                       "gukje", "bupyeong", "cafe", "dining", "street food"]],
  ["nature_trails",   ["nature", "park", "trail", "mountain", "forest", "garden", "hill",
                       "arboretum", "wetland", "walk", "igidae", "geumjeong"]],
  ["culture_village", ["culture", "history", "historic", "temple", "village", "museum",
                       "gallery", "art", "heritage", "gamcheon", "shrine", "memorial"]],
  ["night_view",      ["night", "observatory", "bridge", "tower", "sunset", "skyline",
                       "viewpoint", "lookout", "marine city"]],
  ["accommodation",   ["hotel", "resort", "stay", "guesthouse", "hostel", "pension"]],
];

/** 특정 테마로 몰기 어려운 일반 관광 어휘 — 전체 가중치만 올리고 편향은 주지 않는다 */
const GENERIC = ["attraction", "landmark", "experience", "spot", "place"];

const W_CATEGORY = 3;   // category 는 구조화된 값이라 신뢰도가 높다
const W_NAME     = 2;
const W_TITLE    = 2;
const W_DISTRICT = 1;

function scoreText(text: string, weight: number, out: Map<CoverTheme, number>): void {
  if (!text) return;
  for (const [theme, kws] of KEYWORDS) {
    for (const kw of kws) {
      if (text.includes(kw)) {
        out.set(theme, (out.get(theme) ?? 0) + weight);
        break;             // 같은 텍스트에서 한 테마는 한 번만 가산
      }
    }
  }
}

export interface ThemeResult {
  theme:      CoverTheme;
  confident:  boolean;              // false = 동점·무득점 fallback
  scores:     Record<string, number>;
}

export function resolveTheme(input: ThemeInput): ThemeResult {
  const s = new Map<CoverTheme, number>();

  scoreText(norm(input.tripTitle), W_TITLE, s);

  for (const p of input.places ?? []) {
    const cat = norm(p.category);
    // Experience 등 일반 어휘는 편향을 주지 않는다 (제목·장소명으로만 판정)
    if (cat && !GENERIC.includes(cat)) scoreText(cat, W_CATEGORY, s);
    scoreText(norm(p.name), W_NAME, s);
    scoreText(norm(p.location), W_DISTRICT, s);
  }

  const scores: Record<string, number> = {};
  for (const t of COVER_THEMES) scores[t] = s.get(t) ?? 0;

  let best: CoverTheme | null = null;
  let bestScore = 0;
  let tied = false;
  for (const t of COVER_THEMES) {
    const v = scores[t] ?? 0;
    if (v > bestScore)      { best = t; bestScore = v; tied = false; }
    else if (v === bestScore && v > 0 && best !== null) { tied = true; }
  }

  if (best === null || bestScore === 0 || tied) {
    return { theme: DEFAULT_THEME, confident: false, scores };
  }
  return { theme: best, confident: true, scores };
}

// ── 결정론적 선택 ────────────────────────────────────────────────────────────
// 입력은 itineraryId 와 theme 뿐. 시간·랜덤·요청 횟수를 쓰지 않으므로
// 같은 일정은 몇 번을 새로고침해도 같은 사진이 나온다.
// 서버·클라이언트 공용 함수 — 두 곳에서 같은 결과를 보장한다.

export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * theme 의 정렬된 자산 목록에서 itineraryId 기반으로 하나를 고정 선택한다.
 * skip 은 이미지 로드 실패 시 다음 후보로 넘어가기 위한 오프셋이다.
 */
export function pickFrom(
  all: readonly CoverAsset[],
  itineraryId: string,
  theme: CoverTheme,
  skip = 0,
): CoverAsset | undefined {
  const pool = filterByTheme(all, theme);
  if (pool.length === 0) return undefined;
  const idx = (fnv1a32(`${itineraryId}:${theme}`) + skip) % pool.length;
  return pool[idx];
}
