// My Place 의 개인 표시값(display_title·display_memo)을 만들 때의 순수 규칙.
//
// 이 파일은 어떤 AI 회사도 알지 못한다. provider 는 문자열 하나를 받아 문자열
// 둘을 돌려주는 함수일 뿐이고, 그것이 무엇인지는 이 계층 밖의 일이다. 그래야
// 나중에 provider 를 바꿔도 여기서 정한 규칙 — 무엇을 넘기지 않는가, 무엇을
// 저장하지 않는가 — 이 그대로 남는다.
//
// Trip 쪽 스케줄러 AI 와 env 를 공유하지 않는다. 거기를 켠다고 여기가 켜지면
// 안 된다.

// ── mode ─────────────────────────────────────────────────────────────────────

export const MY_PLACE_AI_MODES = ["off", "mock", "live"] as const;
export type MyPlaceAiMode = typeof MY_PLACE_AI_MODES[number];

/** 모르는 값은 전부 off 다. 오타로 AI 가 켜지지 않는다. */
export function resolveMyPlaceAiMode(raw: string | undefined | null): MyPlaceAiMode {
  const v = (raw ?? "").trim().toLowerCase();
  return (MY_PLACE_AI_MODES as readonly string[]).includes(v) ? (v as MyPlaceAiMode) : "off";
}

// ── locale ───────────────────────────────────────────────────────────────────

export const ENRICH_LOCALES = ["en", "ko", "ja", "zh"] as const;
export type EnrichLocale = typeof ENRICH_LOCALES[number];

export function resolveEnrichLocale(raw: unknown): EnrichLocale {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (ENRICH_LOCALES as readonly string[]).includes(v) ? (v as EnrichLocale) : "en";
}

// ── grounding context ────────────────────────────────────────────────────────

/** 서버가 DB 에서 읽는 행. 이 중 일부만 밖으로 나간다. */
export interface EnrichSourceRow {
  name:      string | null;
  city:      string | null;
  category:  string | null;
  /** 좌표는 "있다/없다" 만 쓴다. 값은 이 계층 밖으로 나가지 않는다. */
  lat:       number | null;
  lng:       number | null;
  /** 사진도 존재 여부만. 경로도 내용도 나가지 않는다. */
  hasPhoto:  boolean;
  /** 사용자가 직접 쓴 메모. 있으면 그대로 근거가 된다. */
  note:      string | null;
}

/** 관련 공개 장소에서 온 사실 값. 있으면 이쪽이 더 확실한 근거다. */
export interface EnrichCanonicalRow {
  name:        string | null;
  city:        string | null;
  category:    string | null;
  subcategory: string | null;
  district:    string | null;
}

/**
 * provider 에게 넘기는 전부.
 *
 * 여기 없는 것은 나가지 않는다 — 좌표 값, 사진 경로, signed URL, device id,
 * 게시·내부 id 는 필드 자체가 없다. 타입이 곧 경계다.
 */
export interface EnrichmentContext {
  locale:      EnrichLocale;
  /** 이 장소를 부를 사실적인 이름. 없을 수 있다. */
  placeName?:  string;
  city?:       string;
  category?:   string;
  subcategory?: string;
  /** 구·동 수준. 좌표가 아니다. */
  area?:       string;
  /** 사용자가 직접 쓴 메모. AI 가 지어낸 것이 아니다. */
  userNote?:   string;
  /** 사진이 있다는 사실만. 무엇이 찍혔는지는 모른다. */
  hasPhoto:    boolean;
  /** 좌표를 가지고 있다는 사실만. 값은 넘기지 않는다. */
  hasLocation: boolean;
}

const s = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * 넘겨도 되는 것만 골라 담는다.
 *
 * 좌표는 값 대신 "있다" 로만 바뀐다. AI 에게 필요한 것은 "해운대 근처" 이지
 * 35.1587401 이 아니고, 정밀 좌표는 그 사람이 정확히 어디에 서 있었는지를
 * 외부에 알려 주는 값이다.
 */
export function buildEnrichmentContext(
  row:       EnrichSourceRow,
  canonical: EnrichCanonicalRow | null,
  locale:    EnrichLocale,
): EnrichmentContext {
  const ctx: EnrichmentContext = {
    locale,
    hasPhoto:    row.hasPhoto,
    hasLocation: row.lat !== null && row.lng !== null,
  };
  // 공개 장소와 연결돼 있으면 그쪽 사실 값이 더 확실하다.
  const name = s(canonical?.name) || s(row.name);
  if (name) ctx.placeName = name;
  const city = s(canonical?.city) || s(row.city);
  if (city) ctx.city = city;
  const cat = s(canonical?.category) || s(row.category);
  if (cat) ctx.category = cat;
  const sub = s(canonical?.subcategory);
  if (sub) ctx.subcategory = sub;
  const area = s(canonical?.district);
  if (area) ctx.area = area;
  const note = s(row.note);
  if (note) ctx.userNote = note;
  return ctx;
}

/**
 * 사실 기반으로 쓸 것이 있는가.
 *
 * 사진만 있고 그 장소가 어디인지 모르면 아무것도 만들지 않는다. 그때 문장을
 * 만들면 그건 기록이 아니라 창작이다 — 우리가 모르는 장소를 아는 척하게 된다.
 */
export function hasEnoughGrounding(ctx: EnrichmentContext): boolean {
  return Boolean(ctx.placeName || ctx.userNote);
}

// ── provider 경계 ────────────────────────────────────────────────────────────

export interface EnrichmentDraft {
  title?: string;
  memo?:  string;
}

/** 무엇을 만들어야 하는가. 이미 값이 있는 쪽은 요청하지 않는다. */
export interface EnrichmentRequest {
  context:   EnrichmentContext;
  needTitle: boolean;
  needMemo:  boolean;
}

export type EnrichmentProvider = (req: EnrichmentRequest) => Promise<EnrichmentDraft>;

// ── 출력 검증 ────────────────────────────────────────────────────────────────

export const TITLE_MAX = 300;
export const MEMO_MAX  = 1000;
/** provider 에게 요구하는 목표 길이. DB 상한은 마지막 방어선이지 목표가 아니다. */
export const TITLE_TARGET = 60;
export const MEMO_TARGET  = 200;

/**
 * 저장해도 되는 값인가.
 *
 * 길면 자르지 않고 버린다. 문장 중간에서 잘린 제목은 AI 가 만든 적 없는
 * 문장이고, 그것을 사용자 기록으로 남기는 편보다 아무것도 없는 편이 낫다.
 * plain text 만 받는다 — 마크업이 섞이면 화면마다 다르게 보인다.
 */
export function validateDraftField(
  value: string | undefined | null,
  max:   number,
): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > max) return null;
  // 마크업은 받지 않는다. plain text 만 저장한다 — 화면마다 다르게 보이면 안 된다.
  if (/[<>]/.test(v)) return null;
  // 탭·줄바꿈만 허용하고 나머지 제어문자는 거른다. 정규식에 제어문자를
  // 직접 적으면 소스에 보이지 않는 바이트가 남아 도구를 거칠 때마다 깨진다.
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x09 || c === 0x0a) continue;
    if (c < 0x20 || c === 0x7f) return null;
  }
  return v;
}

// ── mock provider ────────────────────────────────────────────────────────────

/**
 * local·test 전용. Production 에서는 mode 가 off 라 여기에 닿지 않는다.
 *
 * 문구는 결정적이고, 어떤 회사 이름도 담지 않으며, 사용자가 하지 않은 일을
 * 말하지 않는다. 이 흐름이 옳게 도는지 확인하기 위한 값이지 제품 문구가 아니다.
 */
export const mockEnrichmentProvider: EnrichmentProvider = async (req) => {
  const { context: c } = req;
  const where = c.placeName ?? c.area ?? c.city ?? "";
  const draft: EnrichmentDraft = {};
  if (req.needTitle) draft.title = `[mock] ${where}`.trim();
  if (req.needMemo)  draft.memo  = `[mock] ${where} · ${c.category ?? ""}`.trim();
  return draft;
};
