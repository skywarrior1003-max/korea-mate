// My Trip 제목/메모 AI 글쓰기 — 3방향 (MYTRIP-AI-WRITING-AND-FIRST-TRIP-JOURNEY-GUIDE-V1)
//
// Owner 확정: 방향은 정확히 3개다. 이것은 Story AI 가 아니다 — My Trip 의 제목/메모를
// 쓰거나 다듬는 기능이고, 그 결과가 Story 에도 그대로 보인다(별도 카피 없음).
//   1 calm  절제된 담담하고 부담스럽지 않은
//   2 witty 유머와 재치, 센스
//   3 warm  감성적인
//
// 계약
//  · 생성 언어 = 현재 UI locale 그대로(ko/en/ja/zh). 언어를 묻는 UI 없음.
//  · 입력 맥락 = 장소 identity + 그 순간의 여행 맥락 + 사용자 초안.
//    이전/다음 itinerary stop 을 기계적으로 문장에 넣지 않는다(프롬프트로 금지).
//    사진 픽셀은 AI 에 보내지 않는다(사진 AI 는 동의 설계 전 금지 — SSOT).
//    사진의 존재 여부(hasPhoto)만 어조 참고로 준다.
//  · 없는 사실을 만들지 않는다 — 주어진 맥락 밖의 구체 사실(가격·역사·순위) 창작 금지.
//  · 결과는 제안일 뿐이다. 사용자가 그대로 수정할 수 있고, 저장 계약을 건드리지 않는다.

export const WRITING_DIRECTIONS = ["calm", "witty", "warm"] as const;
export type WritingDirection = (typeof WRITING_DIRECTIONS)[number];
/**
 * target "moment" (MYTRIP-AI-STORY-MAP-AND-SHARE-PREVIEW-V1): 순간 기록의
 * 제목+본문 한 쌍을 한 번의 provider 호출로 만든다. 방향(3종)별로 클라이언트가
 * 병렬 요청하므로 서버·Worker 의 "요청당 provider 1회·재시도 0" 계약은 그대로다.
 */
/**
 * target "moment3" (STORY-MULTICARD-JOURNEY-MAP-AND-AI-COST-PREVIEW-V1 §8-2):
 * 세 방향(calm/witty/warm)의 제목+본문 쌍을 **한 번의 provider 호출**로 만든다.
 * 기존 "moment"(방향당 1쌍·클라 3병렬)의 비용을 1/3 로 줄이는 계약이며,
 * 한 방향이 깨져도 나머지 방향은 살린다(파서가 방향별로 검증).
 */
/**
 * target "storyHero" (STORY-HERO-TONE-SELECTION V2): 공개 Story 첫 표지의
 * **여행 전체** 제목 + 소개문 한 쌍. 사용자가 문체(3방향 중 하나)를 먼저 고른
 * 뒤에만 호출된다 — 세 문체를 미리 만들지 않고, 방향당 정확히 1회다.
 * 응답 모양은 moment 와 같은 {title, memo} 쌍을 재사용한다(memo = 소개문).
 */
export type WritingTarget = "title" | "memo" | "moment" | "moment3" | "storyHero";
export type WritingLocale = "ko" | "en" | "ja" | "zh";

/** moment 제안 한 쌍 — 두 필드가 모두 있어야 유효하다(§A 계약) */
export interface MomentSuggestion { title: string; memo: string }

/** moment3 응답 — 방향별 부분 성공 허용(실패 방향은 빠진다) */
export type MomentSuggestionSet3 = Partial<Record<WritingDirection, MomentSuggestion>>;

/** 캐시/재호출 방지 키에 넣는 프롬프트 판본 — 프롬프트가 실질 변경되면 올린다 */
export const MOMENT3_PROMPT_VERSION = "moment3-v7-social-caption";
export const STORY_HERO_PROMPT_VERSION = "storyHero-v9-cover-motif";

/**
 * 감싼 따옴표 제거 — 짝이 맞을 때만 양끝을 벗긴다(TREND-PACK V1 §K).
 * 구 정규식(한쪽만 제거)은 zh 결과의 따옴표 짝을 깨뜨렸다(实측: 月精桥的"克隆).
 * 내부 인용은 건드리지 않는다.
 */
const QUOTE_PAIRS: Record<string, string> = {
  '"': '"', "'": "'", "“": "”", "‘": "’",
  "「": "」", "『": "』", "《": "》",
};
export function stripWrappingQuotes(s: string): string {
  let v = s.trim();
  while (v.length >= 2) {
    const close = QUOTE_PAIRS[v[0]!];
    if (!close || v[v.length - 1] !== close) break;
    // 양끝이 진짜 한 쌍인지 — 여는 쪽이 내부에서 먼저 닫히면(예: "a" b "c") 벗기지 않는다
    const inner = v.slice(1, -1);
    if (v[0] !== close && inner.includes(close) && !inner.includes(v[0]!)) break;
    v = inner.trim();
  }
  return v;
}

// ── 멀티모달 순간 기록 + 창작 계약 (MULTIMODAL-MOMENT-AND-CREATIVE-STORY-AI V1) ──
// AI 는 DB 문구 조립기가 아니다 — 사진과 여행 정보를 보고 SNS 에 남기고 싶은
// 문구를 창작해 제안한다. 다만 문체별로 창작 허용 범위를 구분한다(§C):
//   calm  = 사실 중심(사진에 명확히 보이는 것만) · witty = 시각적 말장난·비유·
//   의인화·반전·과장 허용 · warm(감성) = 시적 표현·감정적 상상 허용.
// 공통 금지: 실제 사건(사고·구매·숙박·음식 경험)·동행자·역사 정보 발명,
// 사진 속 인물의 신원·관계·나이·인종·국적·건강 추측.

/** witty/warm 창작 응답의 검증용 분류 — DB·공개 API·화면 저장·노출 0.
 * V5 §B — witty 장치 목록(SNS 캡션 8종)과 whitelist 가 어긋나면 모델이 정직하게
 * 신고한 witty 가 파서에서 통째로 죽는다(V5 QA 실측: ko/en witty 전멸) → 장치와
 * 1:1 로 맞춘 6종을 추가한다. */
export const CREATIVE_KINDS = [
  "visual_wordplay", "metaphor", "personification",
  "playful_exaggeration", "poetic_imagery", "visual_contrast",
  "comeback", "everyday_analogy", "subject_swap",
  "dry_observation", "element_flip", "current_expression",
] as const;
export type CreativeKind = (typeof CREATIVE_KINDS)[number];

/**
 * 프롬프트에 싣는 Trend 항목의 최소 형태(§G) — DB(mytrip_trend_packs)에서 고른
 * 활성 row 를 이 모양으로 넘긴다(writing-core 는 pack 데이터에 의존하지 않는다).
 */
export interface TrendPromptEntry {
  id: string; phrase: string; meaning: string; usageExample: string; avoidWhen: string;
  /** V5-1 §B — DB 에 기록된 공식 surface form(canonical_form 등)만. 임의 생성 변형 금지. */
  variants?: readonly string[];
}

// ── V5-1 §B·§C — trend 사용 판정의 SSOT 는 서버 문자열 검사다 ────────────────
// AI 의 trend_used_id 신고는 참고값일 뿐이다. 이번 요청에서 실제로 전달한
// entry 의 phrase·저장된 variant 만 검사한다(DB 전체 활성 후보 아님 — 전달하지
// 않은 표현을 사후에 trend 로 끼워 맞추지 않는다). 정규화는 안전한 범위만:
// NFC·trim·연속 공백·en 소문자. fuzzy/동의어/타 locale 매칭 금지.
function normForMatch(s: string, locale: WritingLocale): string {
  const n = s.normalize("NFC").trim().replace(/\s+/g, " ");
  return locale === "en" ? n.toLowerCase() : n;
}
function formPresent(text: string, form: string, locale: WritingLocale): boolean {
  if (!form) return false;
  if (locale !== "en") return text.includes(form);
  // en 은 단어 경계 필수 — "understood" 가 "misunderstood" 에 오인 매칭되면 안 된다.
  const esc = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`).test(text);
}
export interface TrendUseVerdict {
  /** witty 를 살릴 수 있는가 — false 면 witty 방향 폐기(재호출 0) */
  ok: boolean;
  /** 서버가 확정한 사용 trend id(통계 SSOT) — 미사용·폐기는 null */
  usedId: string | null;
  /** 문자열에서 실제 발견된 전달 entry id 들(진단용) */
  matched: string[];
}
export function resolveTrendUse(
  locale: WritingLocale, title: string, memo: string,
  entries: ReadonlyArray<{ id: string; forms: readonly string[] }>,
  claimedId: string | null,
): TrendUseVerdict {
  const body = normForMatch(title + "\n" + memo, locale);
  const matched = entries
    .filter(e => e.forms.some(f => formPresent(body, normForMatch(f, locale), locale)))
    .map(e => e.id);
  // §C-3·6·7 — 2개 이상이면 신고와 무관하게 폐기(유행어 2개 금지)
  if (matched.length >= 2) return { ok: false, usedId: null, matched };
  if (matched.length === 0) {
    // §C-1·4 — 실제 0개: 신고가 있으면 신고 불일치로 폐기, 없으면 미사용 허용
    return claimedId ? { ok: false, usedId: null, matched } : { ok: true, usedId: null, matched };
  }
  // §C-2·5 — 정확히 1개: 무신고면 서버가 자동 확정, 다른 id 신고면 폐기
  if (claimedId && claimedId !== matched[0]) return { ok: false, usedId: null, matched };
  return { ok: true, usedId: matched[0]!, matched };
}

// ── 언어별 재치·감성 문법 (MULTILOCALE V2 §7·§8) — 한국어 결과의 번역이 아니라
// locale 별 유머·감성 문법으로 처음부터 쓴다. 감성은 V1 품질 유지가 우선이다.
const WITTY_LOCALE_CRAFT: Record<WritingLocale, string> = {
  ko: "KO witty craft: 짧은 밈 문법·되받기·생활형 반전. 유머 장치는 한 결과에 정확히 1개 — 1+1류 숫자 개그·유행어·의인화를 한 카드에 겹쳐 쓰지 않는다.",
  ja: "JA witty craft: 抑えたツッコミ・間・オノマトペ・予想外の締め。「笑」を機械的に付けない。韓国式の割引ネタ（1+1 等）の直訳や「お得感」の繰り返しは失敗 — 「水面が頑張りすぎ」のように日本語としてそのまま可笑しい観察を優先する。",
  en: "EN witty craft: visual pun, understatement, self-aware caption energy. Do NOT default to a literal '1+1'; 'BOGO' only if a retail joke truly fits this photo. Never reuse 'main character energy' on every photo. Think shapes like: the river making a copy / one bridge, two appearances — but write your own.",
  zh: "ZH witty craft: 简体中文网络语感 — 短对比、谐音、情境反转，像本地人随手发的一句。幽默手法一次只用一个：不要把“买一送一”和“出片”放进同一条，不要堆形容词像广告文案。",
};
const WARM_LOCALE_CRAFT: Record<WritingLocale, string> = {
  ko: "KO warm craft: 짧은 여운과 이미지 중심 — 설명하지 말고 남긴다.",
  ja: "JA warm craft: 説明より余白・季節感・残像。言い切らずに残す。",
  en: "EN warm craft: concise lyrical caption; never inflated ad-copy lyricism.",
  zh: "ZH warm craft: 以画面为中心的短抒情，不堆古风套话。",
};

/** visual_basis 허용 — 사진의 일반적 시각 요소만(인물·신원·위치 추론 금지).
 * V5 §F 확장: 실제 사진에 흔한 요소 6종 추가 — 목록이 좁아 witty/warm 이
 * 무관한 값을 자기신고하는 압력을 줄인다. crowd 는 "여러 사람이 장면 요소"
 * 라는 구도 신고일 뿐, 개별 인물 서술 허용이 아니다(HARD RULES 그대로). */
export const VISUAL_BASIS_ALLOWED = [
  "reflection", "symmetry", "night_light", "silhouette",
  "color_contrast", "framing", "repeated_shape", "foreground_background",
  "flowers", "architecture", "shadow", "crowd", "scale_contrast", "weather_visible",
] as const;

/** 멀티모달 이미지 입력 — 클라이언트 canvas 전처리(재인코딩 JPEG)만 받는다 */
export interface WritingImage { mimeType: "image/jpeg"; data: string }
/**
 * base64 상한 — 구 2M chars 는 실측(전처리 23~81KB = 31k~110k chars) 대비 과도
 * (TREND-PACK V1 §I 감사). 400k chars(≈300KB 디코드)로 축소: 정상 fixture 의
 * 3~10배 여유를 두면서 비용 폭주·프롬프트 주입 표면을 줄인다.
 */
export const MAX_IMAGE_BASE64_CHARS = 400_000;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
/** base64 "/9j/" = JPEG SOI(FF D8 FF) — canvas 재인코딩 JPEG 만 통과 */
const JPEG_B64_MAGIC = "/9j/";

/**
 * 요청의 image 필드를 안전하게 꺼낸다. 규칙:
 *  · 없으면 null(텍스트 경로) · 있는데 계약 위반이면 "invalid"(호출부가
 *    provider 호출 없이 정직하게 실패) — 임의 URL·타 포맷·초과 크기를 조용히
 *    무시하고 사진을 본 척하는 경로를 만들지 않는다.
 *  · URL 은 어떤 형태로도 받지 않는다(SSRF 원천 차단 — fetch 대상 없음).
 */
export function extractRequestImage(v: unknown): WritingImage | null | "invalid" {
  if (!v || typeof v !== "object") return "invalid";
  const r = v as Record<string, unknown>;
  if (r.mimeType !== "image/jpeg") return "invalid";
  if (typeof r.data !== "string" || r.data.length === 0) return "invalid";
  if (r.data.length > MAX_IMAGE_BASE64_CHARS) return "invalid";
  if (!BASE64_RE.test(r.data)) return "invalid";
  if (!r.data.startsWith(JPEG_B64_MAGIC)) return "invalid"; // JPEG magic(§I)
  return { mimeType: "image/jpeg", data: r.data };
}

/** 표지 소개문 상한 — 표지에서 2~4줄로 읽히는 길이(§10) */
export const MAX_HERO_INTRO_CHARS = 160;

/**
 * 공개된 moment 제목·메모 요약 — storyHero 의 사실 재료(§5 허용 입력).
 * **공개로 저장된 값만** 넣는다: 호출부(소유자 화면)가 공개 목록을 골라 넘긴다.
 */
export interface PublicMomentFact { placeName?: string | null; title?: string | null; memo?: string | null }
export function deriveHeroMomentFacts(moments: PublicMomentFact[]): string[] {
  const out: string[] = [];
  for (const m of moments.slice(0, 6)) {
    const parts = [m.placeName, m.title, m.memo].map(v => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
    if (parts.length > 0) out.push(`public moment — ${parts.join(" / ").slice(0, 160)}`);
  }
  return out;
}

// ── storyHero 사실 접지 (GROUNDING-STABLE V3 §A) ────────────────────────────
// 표지 문장은 나열된 사실 키에서만 나와야 한다. 모델은 사용한 키를
// source_refs 로 되돌려 주고, 서버는 존재하지 않는 키가 하나라도 있으면
// 결과를 버린다(추가 AI 검수 요청 없음 — 요청은 계속 1회다).
// 완전한 의미 검증은 코드만으로 불가능하다 — 이 키 검증·프롬프트 제한·고정
// fixture 검사가 방어선이고, 그 한계는 보고서에 그대로 적는다.

export interface HeroFact { key: string; text: string }

/** storyHero 가 쓸 수 있는 입력 전부 — §A-1 허용 목록과 1:1. 순서 결정적. */
export function buildHeroFacts(c: WritingContext): HeroFact[] {
  const clipLocal = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const facts: HeroFact[] = [];
  let n = 0;
  const push = (text: string) => { n += 1; facts.push({ key: `f${n}`, text }); };
  push(`city: ${clipLocal(c.city, 40)}`);
  if (clipLocal(c.dates, 40)) push(`trip dates: ${clipLocal(c.dates, 40)}`);
  if (c.hasPhoto) push("public photos exist: YES — you CANNOT see them; never describe their contents");
  for (const f of (c.tripFacts ?? []).slice(0, MAX_TRIP_FACTS + 8)) {
    const t = clipLocal(f, MAX_FACT_CHARS + 60);
    if (t) push(t);
  }
  return facts;
}

/**
 * hero 응답 — {title, memo(=intro), basis_refs, creative_kind}. 파싱 실패·필드
 * 누락은 null. basis_refs 는 "어떤 공개 순간·장소를 참고했는가" 확인 용도이며
 * exact substring 강제 도구가 아니다(§J) — AI 가 최종 문장을 직접 쓴다.
 */
export interface HeroSuggestion extends MomentSuggestion { sourceRefs: string[]; creativeKind: string | null }

export const HERO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    memo: { type: "string" },
    basis_refs: { type: "array", items: { type: "string" } },
    creative_kind: { type: "string" },
  },
  required: ["title", "memo", "basis_refs"],
} as const;

export function extractHeroSuggestion(text: string): HeroSuggestion | null {
  const parse = (t: string): Record<string, unknown> | null => {
    try { const j = JSON.parse(t); return j && typeof j === "object" ? j as Record<string, unknown> : null; }
    catch { return null; }
  };
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const raw = parse(text) ?? parse(fenced);
  if (raw === null) return null;
  if (typeof raw.title !== "string" || typeof raw.memo !== "string" || !Array.isArray(raw.basis_refs)) return null;
  const refs = raw.basis_refs.filter((r): r is string => typeof r === "string").map(r => r.trim()).filter(Boolean);
  const clean = (s: string, max: number) => {
    let v = stripWrappingQuotes(s);
    if (v.length > max) v = v.slice(0, max).trim();
    return v;
  };
  const title = clean(raw.title, MAX_TITLE_CHARS + 20);
  const memo = clean(raw.memo, MAX_HERO_INTRO_CHARS + 60);
  if (!title || !memo || refs.length === 0) return null;
  const kind = typeof raw.creative_kind === "string" ? raw.creative_kind.trim() : null;
  return { title, memo, sourceRefs: refs, creativeKind: kind || null };
}

/**
 * basis_refs 가 실제 제공한 키 집합 안에만 있는가 — 밖의 키가 하나라도 있으면
 * 거부(확인 용도 — substring 강제가 아니다). witty/warm 은 creative_kind 가
 * 허용 목록에 있어야 한다(§D — 검증에만 쓰고 저장·노출 0). 형식 검증이 창작
 * 품질·완전한 진실성을 보장하지 못한다는 한계는 보고서에 그대로 적는다.
 */
export function validateHeroRefs(req: WritingRequest, hero: HeroSuggestion | null): MomentSuggestion | null {
  if (hero === null) return null;
  const keys = new Set(buildHeroFacts(req.context).map(f => f.key));
  for (const r of hero.sourceRefs) if (!keys.has(r)) return null;
  if ((req.direction === "witty" || req.direction === "warm") &&
      !(CREATIVE_KINDS as readonly string[]).includes(hero.creativeKind ?? "")) return null;
  // V5-1 §H — witty 표지 제목의 질문형은 결정적으로 거부한다(재호출 0).
  if (req.direction === "witty" && HERO_QUESTION_RE.test(hero.title)) return null;
  return { title: hero.title, memo: hero.memo };
}

/**
 * V5-1 §H — hero witty 제목 질문형 검출(좁은 결정적 패턴). V5 실측 표본
 * "경주, 고요해서 더 좋았나" 유형: 물음표(전각 포함)·"~했나/~였을까/~일까"류
 * 어미 종결. 자연어 전반 심사가 아니다 — 나열형은 프롬프트+사람 판독 담당.
 */
export const HERO_QUESTION_RE = /[?？]|(?:했나|였나|았나|었나|좋았나|일까|을까|ㄹ까|였을까|았을까|었을까|할까요|인가|는가|던가)\s*$/;

export const MODEL = "gemini-2.5-flash";     // 저장소에 이미 승인된 모델 그대로
export const TIMEOUT_MS = 8_000;             // personalize 와 같은 상한 — 늦으면 버린다
export const MAX_OUTPUT_TOKENS = 700;
export const MAX_TITLE_CHARS = 40;           // itinerary 제목 input maxLength(60) 안쪽
export const MAX_MEMO_CHARS = 220;           // memo textarea 300 안쪽
export const MAX_CONTEXT_CHARS = 400;        // 요청 필드별 입력 상한(비용/프롬프트 방어)

export interface WritingContext {
  city: string;
  placeName?: string | null;
  category?: string | null;
  dayNumber?: number | null;
  /** "YYYY-MM-DD" ~ "YYYY-MM-DD" 같은 원문 기간 문자열 */
  dates?: string | null;
  hasPhoto?: boolean;
  /** 사용자가 이미 적어 둔 초안 — 있으면 새로 짓지 말고 다듬는다 */
  draft?: string | null;
  tripTitle?: string | null;
  /**
   * 실제 일정에서 결정적으로 셈한 여행 패턴 문장들(deriveTripWritingFacts).
   * (AI-WRITING-QUALITY-PRODUCTION-V1 — context poverty 해소의 핵심.)
   * 좌표·주소·내부 id 없음: "trip length: 3 days, 21 stops" ·
   * "food stops: 9 of 21" · "places include: A, B, C" 수준의 요약뿐이다.
   */
  tripFacts?: string[] | null;
}

/** tripFacts 상한 — 프롬프트 비대/비용 방어 */
export const MAX_TRIP_FACTS = 8;
export const MAX_FACT_CHARS = 120;

/**
 * 일정에서 여행 패턴을 **결정적으로 셈**해 짧은 사실 문장으로 만든다.
 * AI 에게 "이 여행에서만 나올 수 있는 문장" 의 재료를 주는 함수다 —
 * 없는 사실을 만들지 않도록 전부 입력에서 세어서만 적는다.
 * 좌표/주소/내부 id/숙소명은 넣지 않는다(숙소는 위치 프라이버시 — 개수만).
 */
export function deriveTripWritingFacts(
  days: { places: { name?: string | null; category?: string | null; isAccommodation?: boolean }[] }[],
): string[] {
  const facts: string[] = [];
  const stops = days.flatMap(d => (d.places ?? []).filter(p => p?.isAccommodation !== true));
  const total = stops.length;
  if (days.length >= 1 && total >= 1) facts.push(`trip length: ${days.length} day(s), ${total} stops`);

  // 카테고리 집계 — 저장값 그대로 센다(재분류 없음)
  const counts = new Map<string, number>();
  for (const p of stops) {
    const c = (p.category ?? "").trim().toLowerCase();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const food = (counts.get("restaurant") ?? 0) + (counts.get("food") ?? 0) + (counts.get("cafe") ?? 0);
  if (food >= 2 && total > 0) facts.push(`food/cafe stops: ${food} of ${total}`);
  for (const [cat, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    if (n >= 2 && !["restaurant", "food", "cafe"].includes(cat)) facts.push(`${cat} stops: ${n}`);
  }

  // 실제 장소명 표본 — 각 Day 의 앞쪽에서 고루, 최대 6개
  const names: string[] = [];
  for (const d of days) {
    for (const p of (d.places ?? [])) {
      if (p?.isAccommodation === true) continue;
      const n = (p.name ?? "").trim();
      if (n && !names.includes(n)) { names.push(n); break; }
    }
  }
  for (const p of stops) {
    if (names.length >= 6) break;
    const n = (p.name ?? "").trim();
    if (n && !names.includes(n)) names.push(n);
  }
  if (names.length > 0) facts.push(`places include: ${names.slice(0, 6).map(n => n.slice(0, 40)).join(", ")}`);

  return facts.slice(0, MAX_TRIP_FACTS).map(f => f.slice(0, MAX_FACT_CHARS));
}

export interface WritingRequest {
  target: WritingTarget;
  direction: WritingDirection;
  locale: WritingLocale;
  context: WritingContext;
  /**
   * 멀티모달 사진 입력(moment3 전용) — 클라이언트가 canvas 재인코딩으로 EXIF·
   * GPS·기기 메타데이터를 제거한 JPEG base64. 서버는 어떤 URL 도 fetch 하지
   * 않는다. AI 요청 후 즉시 폐기 — DB·로그·캐시에 저장 금지.
   */
  image?: WritingImage | null;
}

const LOCALE_NAME: Record<WritingLocale, string> = {
  ko: "Korean", en: "English", ja: "Japanese", zh: "Simplified Chinese",
};

// ── 스타일 지시 (AI-WRITING-QUALITY-PRODUCTION-V1) ───────────────────────────
// Owner 확정 3방향의 "품질" 정의. 예문은 template 가 아니라 구체성/톤의 기준이다.
const DIRECTION_BRIEF: Record<WritingDirection, string> = {
  calm: [
    "Direction 1 — restrained, calm, unburdened. A quiet plain diary line.",
    "Understatement is the craft: small concrete observation, no evaluation words.",
    'Good shape (Korean example, do not copy): "바람이 생각보다 셌다. 그래도 오래 앉아 있었다."',
    "Never: 최고/완벽/잊지 못할, superlatives, exclamation marks, emoji, ad-copy energy.",
  ].join(" "),
  witty: [
    "Direction 2 — humor, wit, sense. The humor MUST come from a real observation in the given facts",
    "(a pattern, a small irony, gentle self-deprecation) — never from trying hard to be funny.",
    'Good shapes (Korean examples of the CRAFT, do not copy): "계획은 관광, 결과는 다섯 끼." / "부산에서는 길보다 메뉴를 더 많이 바꿨다."',
    "Test yourself: could this line be pasted on ANY trip? Then it fails — rewrite from THIS trip's facts.",
    "Never: dad-joke puns, place-name + exclamation, memes, slapstick, sarcasm about the place, emoji.",
    "NO similes or personification ('like a child', '〜のようだ', '像…一样') — wit here is dry observation, not metaphor.",
    "If the draft is ALREADY funny, your job is a minimal polish — keep the user's joke as the punchline (reuse its numbers verbatim); never replace it with your own or soften it.",
    "If the facts give you nothing genuinely witty, write a modest dry line instead of forcing a joke.",
  ].join(" "),
  warm: [
    "Direction 3 — emotional and warm, but the feeling must rise from ONE concrete scene in the facts",
    "(light, wind, rain, food steam, a pause, what the photo moment felt like) — never from abstract sentiment.",
    'Good shape (Korean example, do not copy): "해가 지는 걸 끝까지 봤다. 별 이유는 없었다."',
    "Never: 낭만/설렘/감성 가득, 특별한 순간, 잊지 못할 추억 — brochure emotion words in any language. No emoji.",
  ].join(" "),
};

// ── Story 표지 전용 창작 브리프 (§J) — moment 용 DIRECTION_BRIEF 와 별개다.
// 표지는 AI 가 최종 문장을 직접 쓴다(서버 고정 템플릿 조립 금지). 문체별로
// 창작 허용 범위만 다르다. 실제 사건·동행자·역사 발명은 전 문체 금지.
export const HERO_CREATIVE_BRIEF: Record<WritingDirection, string> = {
  calm: [
    "Tone — calm, restrained. Build the cover from the itinerary and the traveler's own public moment notes.",
    "Quiet concrete summary of the whole trip; no evaluation words, no superlatives, no exclamation marks.",
    "Stay factual: only what the listed facts actually say.",
  ].join(" "),
  witty: [
    "Tone — light and witty. The cover must make the reader smile ONCE MORE at this trip — it is a COMEBACK,",
    "not a summary. Build the cover around ONE CONCRETE MOTIF taken from the traveler's own public moment",
    "notes (their own joke or a vivid detail is the best material): pick it up, echo it, or escalate it one",
    "step — that echo is the ONLY place a current expression may appear; never add a new trend phrase the",
    "traveler did not use. If no saved joke exists, find the one funny pattern in the real facts and land it",
    "as a short deadpan punchline.",
    "TITLE: a short declarative or noun-phrase statement. NEVER a question — no question marks, no",
    "wondering endings (Korean '~했나/~일까/~였을까' style), no abstract musing without a concrete image,",
    "and no list of places.",
    "INTRO: ideally ONE short sentence (at most two short clauses). NEVER name three or more places, and",
    "NEVER walk through the itinerary ('did A at X, then B at Y...') — zoom into the one saved scene and",
    "let it hint at the whole trip's mood.",
    "HARD FAILURES for this tone: a plain list of counts/places ('N days, M stops...'), stringing several",
    "moments together, a poetic-pretty line (that is the emotional tone's job), or a caption that fits any",
    "trip. Deadpan beats exclamation. Never invent feelings or plans the traveler did not write.",
    "Allowed: metaphor, personification of the itinerary/scenes, playful exaggeration that no one could mistake for a real event.",
    "creative_kind must name the main device you used.",
  ].join(" "),
  warm: [
    "Tone — emotional, poetic. CREATIVITY IS ALLOWED here: you may connect the emotional lines the traveler",
    "saved in public moments, compress the whole trip into one poetic sentence, and add atmosphere or",
    "emotional imagination that is clearly mood, not a claimed event.",
    "Allowed: poetic imagery, personification of light/night/water/streets, gentle metaphor.",
    "creative_kind must name the main device you used.",
  ].join(" "),
};

// locale-native — 번역투가 아니라 그 언어로 처음부터 쓴 문장의 리듬을 요구한다.
// (blind 재검 2026-09-09: JA 는 말장난형 유머가 불발한다 — ツッコミ/自虐로 지시.)
const LOCALE_VOICE: Record<WritingLocale, string> = {
  ko: "Write as a Korean person writes their own diary: 담백한 구어체, 짧은 문장, 과장 없는 관찰. Avoid 번역투/광고투; particles and sentence endings must feel natural, not formal-stiff.",
  en: "Write as a native English speaker's travel note: dry, concrete, lowercase energy; understatement over enthusiasm; no brochure adjectives.",
  ja: "Write as a Japanese person's 旅の記録: 短く、体言止めや控えめな言い回しが自然。翻訳調・観光パンフ調は不可。ユーモアは軽いツッコミか自虐だけ（craft の例、コピー禁止:「観光のつもりが、気づけば食べてばかり。」「同じ路地で40枚。反省はしていない。」）。語呂合わせ・詩的な言葉遊び・意味の曖昧な格言風・パンフ調の情景描写は不可。「最高」「絶景」「息をのむ」などの感嘆常套句は全スタイルで不可。文法が崩れるくらいなら、地味で自然な一文を選ぶ。witty では必ず一言のツッコミか自虐を入れる — きれいな情景描写だけの文は witty ではない。",
  zh: "Write as a native Chinese traveler's 随手记: 口语化、简短、具体; 不要宣传腔或翻译腔、不要小红书滤镜腔。幽默只能是克制的吐槽或自嘲，禁止比喻和拟人。",
};

// 언어 격리 — draft 의 "의미" 는 대상 언어로 옮기되, 고유명사는 창작 번역하지 않는다.
// (blind 재검 2라운드: 지명을 옮기라고 하자 ハルモニポック/白い村/福国奶奶家 같은
//  발명 번역·표기 흔들림이 생겼다 — 장소명은 context 원문 그대로 or 일반명사.)
const LOCALE_ISOLATION: Record<WritingLocale, string> = {
  ko: "The draft may be in another language — carry its MEANING into Korean. Place names: use them as given in the context.",
  en: "The draft may be in Korean — carry its MEANING into natural English. Zero Hangul in the output. Place names: keep them EXACTLY as written in the context.",
  ja: "Draft が韓国語なら意味だけを自然な日本語にする。出力にハングルは 1 文字も不可。固有名詞（店名・地名）は context の表記をそのまま使うか、「この店」「この寺」「この通り」のような一般語にする — 勝手に翻訳・音写しない。",
  zh: "草稿若是韩语，只把意思写成中文；输出中不得出现任何韩文字符。专有名词（店名/地名）照抄 context 里的写法，或用「这家店」「这座寺」这类通称 — 不要自创翻译。",
};

// generic 여행 카피 억제 — 기계 치환이 아니라 프롬프트 차원에서 막는다.
// Owner FAIL 예: "부산 2박3일 웃음꽃피우다".
const BANNED_PHRASES =
  "웃음꽃, 행복 가득, 추억 가득, 낭만 가득, 힐링, 설렘 가득, 특별한 순간, 잊지 못할, 소중한 추억, 행복한 시간, 배꼽";

const clip = (v: unknown, max = MAX_CONTEXT_CHARS): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export function isWritingRequest(v: unknown): v is WritingRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    (r.target === "title" || r.target === "memo" || r.target === "moment" || r.target === "moment3" || r.target === "storyHero") &&
    WRITING_DIRECTIONS.includes(r.direction as WritingDirection) &&
    ["ko", "en", "ja", "zh"].includes(r.locale as string) &&
    !!r.context && typeof r.context === "object" &&
    typeof (r.context as WritingContext).city === "string"
  );
}

/** provider 프롬프트 — 사실 창작 금지·전후 일정 삽입 금지·언어 고정이 계약의 핵심이다 */
export function buildWritingPrompt(req: WritingRequest): string {
  const c = req.context;
  const facts: string[] = [`city: ${clip(c.city, 40)}`];
  if (clip(c.placeName)) facts.push(`place: ${clip(c.placeName, 80)}`);
  if (clip(c.category, 40)) facts.push(`place category: ${clip(c.category, 40)}`);
  if (typeof c.dayNumber === "number" && c.dayNumber >= 1) facts.push(`trip day: Day ${Math.floor(c.dayNumber)}`);
  if (clip(c.dates, 40)) facts.push(`trip dates: ${clip(c.dates, 40)}`);
  // hasPhoto 는 양방향 사실이다 (LOCALE-FACT-GROUNDING-V1 §7): 없음을 말하지
  // 않으면 모델이 "찍었다" 를 그럴듯한 행동으로 창작한다(LIVE 실측).
  if (c.hasPhoto) facts.push("photo available: YES — a photo exists but you CANNOT see it and do NOT know what is in it: never describe or guess its contents");
  else if (req.target !== "title") facts.push("photo available: NO — the traveler did NOT take a photo here: never mention taking, holding, reviewing, or posing for photos/cameras");
  // storyHero 에는 내부 여행 이름(trip_title)을 넣지 않는다 — 관리용 이름(QA 표기
  // 포함)이 공개 표지 문구의 재료가 되면 안 된다(§5 금지 입력).
  if (clip(c.tripTitle, 80) && req.target !== "title" && req.target !== "storyHero") facts.push(`trip title: ${clip(c.tripTitle, 80)}`);
  // 실제 일정에서 셈한 여행 패턴(deriveTripWritingFacts) — 특히 title 의 재료다
  for (const f of (c.tripFacts ?? []).slice(0, MAX_TRIP_FACTS)) {
    const t = clip(f, MAX_FACT_CHARS);
    if (t) facts.push(t);
  }
  const draft = clip(c.draft, MAX_CONTEXT_CHARS);

  const what = req.target === "title"
    ? `one trip title, max ${MAX_TITLE_CHARS} characters`
    : req.target === "moment"
    ? `one moment title (max ${MAX_TITLE_CHARS} characters) AND one short travel memo of 1-2 sentences (max ${MAX_MEMO_CHARS} characters) for the SAME moment`
    : req.target === "moment3"
    ? `THREE complete diary entries for the SAME single moment — one per direction (calm, witty, warm). Each entry = one moment title (max ${MAX_TITLE_CHARS} characters) AND one short travel memo of 1-2 sentences (max ${MAX_MEMO_CHARS} characters)`
    : req.target === "storyHero"
    ? `one cover title for the WHOLE trip story (max ${MAX_TITLE_CHARS} characters) AND one short introduction of 1-2 sentences (max ${MAX_HERO_INTRO_CHARS} characters) that opens the whole trip`
    : `one short travel memo of 1-2 sentences, max ${MAX_MEMO_CHARS} characters`;

  const targetCraft = req.target === "storyHero"
    ? [
        `Cover craft: this is the FIRST screen of a shared trip story — it introduces the WHOLE trip, not one`,
        `place. Draw an arc from the places/moments in the facts (e.g. from the first to the last scene) without`,
        `inventing anything. Never a label ("${clip(c.city, 40)} Day N", "{N} Days in {City}" — the cover already`,
        `shows city and dates elsewhere). The intro must read as an invitation into the story: 1-2 quiet sentences`,
        `grounded ONLY in the listed places and public moment notes. Title and intro must not repeat each other.`,
      ].join(" ")
    : req.target === "moment" || req.target === "moment3"
    ? [
        `Moment-title craft: a short first-person heading for THIS one moment/place — like the top line of a`,
        `diary entry. Never a label ("${clip(c.city, 40)} Day N", place name alone), never a summary of the whole trip.`,
        `Memo craft: stay inside THIS one moment/place. Use the place identity, the draft, and what this`,
        `moment plausibly felt like — never narrate the itinerary ("came from X, heading to Y" is forbidden).`,
        `Title and memo must read as one entry (same scene, same tone) without repeating the same sentence.`,
      ].join(" ")
    : req.target === "title"
    ? [
        `Title craft: catch what makes THIS trip itself — a pattern you can actually see in the facts`,
        `(e.g. many food stops, one repeated kind of place). NEVER a label like "{N} Days in {City}" or`,
        `"${clip(c.city, 40)} 여행" — the app already shows city and dates elsewhere. Do not state numbers`,
        `that are not in the facts.`,
      ].join(" ")
    : [
        `Memo craft: stay inside THIS one moment/place. Use the place identity, the draft, and what this`,
        `moment plausibly felt like — never narrate the itinerary ("came from X, heading to Y" is forbidden).`,
      ].join(" ");

  return [
    `You help a traveler write in their own trip diary. Write ${what}.`,
    `Language: write ONLY in ${LOCALE_NAME[req.locale]}. No other language, no romanization.`,
    LOCALE_ISOLATION[req.locale],
    LOCALE_VOICE[req.locale],
    ...(req.target === "moment3"
      ? [DIRECTION_BRIEF.calm, DIRECTION_BRIEF.witty, DIRECTION_BRIEF.warm]
      : req.target === "storyHero"
      ? [HERO_CREATIVE_BRIEF[req.direction]]
      : [DIRECTION_BRIEF[req.direction]]),
    targetCraft,
    `ALLOWED FACTS (the ONLY facts that exist — everything else is UNKNOWN):`,
    ...(req.target === "storyHero"
      ? buildHeroFacts(c).map(f => `- [${f.key}] ${f.text}`)
      : facts.map(f => `- ${f}`)),
    ...(req.target === "storyHero" ? [
      `COVER RULES (storyHero):
- You write the FINAL title and intro yourself — creative, in the tone described above. No template assembly.
- Your material is the listed facts (places, itinerary, the traveler's saved public moment titles/notes). Creativity means arranging, twisting, or poetically compressing THESE — never inventing new events, companions, purchases, accidents, meals, weather-as-fact, or history.
- Return in "basis_refs" ONLY the keys (like "f1") of the facts you actually drew from. Do not invent keys. This is a reference list, not a quotation constraint — your sentences do not need to copy the facts verbatim.
- Return in "creative_kind" the main device you used, one of: ${CREATIVE_KINDS.join(", ")}. For calm you may omit it.
- Never mock the place, the culture, or people. Never state wrong historical/cultural claims as fact.
- NEVER state a season (봄/가을, 春/秋, spring/autumn, seasonal winds) unless a listed public moment note explicitly names it — trip dates are not proof.`,
    ] : []),
    `FACT RULES:
- You may only state concrete events, actions, foods, and numbers that are supported by the ALLOWED FACTS or the traveler's draft.
- Missing information means UNKNOWN — it is never permission to invent.
- Provided place/business names are IMMUTABLE PROPER NOUNS: copy them character-for-character exactly as written above. Do not translate, transliterate, respell, localize, or invent another name for any place, shop, street, or business.
- Korean food words from the facts/draft: keep the word exactly as written there, or use plain common vocabulary of the output language (e.g. "soup" / "スープ" / "汤") — NEVER coin a new translated word for a Korean dish.
- State possibilities as possibilities: never assert that an event actually happened (getting lost, ending up somewhere, meeting someone) unless the facts/draft say it happened.`,
    draft
      ? [
          `The traveler already wrote this draft — polish it in the requested direction. Keep their meaning,`,
          `their jokes, their specific details and personal voice; never flatten a good line into a generic one;`,
          `do not add new events:\n"${draft}"`,
        ].join(" ")
      : [
          `No draft exists — write freshly from the context above. Because you know only the place, not what`,
          `happened: NEVER make up specific dishes eaten, people met ("옆자리", companions, crowds reacting),`,
          `purchases, or actions. Stay at the level of the place itself and a quiet plausible reaction to it.`,
        ].join(" "),
    `When the facts are thin, FACTUAL BEATS FUNNY: a less funny true line always wins over a funnier invented one — prefer a short dry understated observation over any joke that needs material not in the facts.`,
    `The three directions (calm/witty/warm) must be clearly distinguishable — never produce a line that could pass for another direction.`,
    `Hard rules:`,
    `- Do NOT invent facts, prices, history, rankings, weather, companions, meals, or events not in the context.`,
    `- Do NOT invent OTHER PEOPLE or their behavior (옆자리/옆 테이블, foreigners, crowds reacting, staff).`,
    `- Do NOT narrate hypothetical mishaps or incidents as if they happened (wrong turns, being chased, spills).`,
    `- Do NOT assert what a photo shows (no "photo of X", no "찍은 건/撮った写真は/拍的是") — you cannot see it.
    - Being AT a restaurant/market does not mean anything was eaten or bought — never assert eating/ordering/buying unless the draft says so.
    - Never state being alone or with companions — you do not know.`,
    `- Never invent or alter NUMBERS; use a count only with the exact meaning it has in the facts.`,
    `- Never imply repetition or earlier stops: no "another …", また/又/再次/다시, "this time" framings — you know only THIS moment.`,
    `- Never echo wording from these instructions or their examples into the output.`,
    `- Never state the time of day, season, or weather unless it is in the facts/draft.
    - Mention photos/cameras ONLY if the context says a photo was taken.`,
    `- The trip title (if given) is a TONE reference only — do not treat its words as objects present at this place.`,
    `- Do NOT mention previous or next itinerary stops, schedules, or "다음 일정" style transitions.`,
    `- NO tourism-marketing or inspirational-travel clichés in ANY language. Banned examples (Korean): ${BANNED_PHRASES}.`,
    `  Equivalents like "unforgettable memories", "忘れられない思い出", "难忘的回忆" are equally banned.`,
    `- The line must be specific enough that it could NOT be pasted onto a different trip unchanged.`,
    `- Do NOT address the reader, do NOT explain yourself, no hashtags, no quotes around the text.`,
    `- First person voice of the traveler. Output the ${req.target === "moment" || req.target === "moment3" || req.target === "storyHero" ? "title and memo" : `${req.target} text`} alone.`,
    `Before you answer: silently list every concrete claim in your line (people, photos, purchases, times, weather, objects, numbers, prior stops) and DELETE any claim not literally present in the facts/draft — replace it with plain being-there observation. Then output.
${req.target === "moment3"
  ? 'Return JSON: {"calm": {"title": "<title>", "memo": "<memo>"}, "witty": {"title": "<title>", "memo": "<memo>"}, "warm": {"title": "<title>", "memo": "<memo>"}}'
  : req.target === "storyHero"
  ? 'Return JSON: {"title": "<title>", "memo": "<intro>", "basis_refs": ["f1", "f2"], "creative_kind": "<device>"}'
  : req.target === "moment" ? 'Return JSON: {"title": "<title>", "memo": "<memo>"}' : 'Return JSON: {"suggestion": "<text>"}'}`,
  ].join("\n");
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: { suggestion: { type: "string" } },
  required: ["suggestion"],
} as const;

/** moment 응답 스키마 — 제목·본문 두 필드가 필수(하나만 오면 실패로 취급) */
export const MOMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, memo: { type: "string" } },
  required: ["title", "memo"],
} as const;

/**
 * moment 응답 파서 — extractSuggestion 과 같은 PARSER SAFETY GUARD 원칙:
 * 파싱 불가/필드 누락은 제안이 아니라 실패(null)다. 절단 payload 노출 금지.
 */
export function extractMomentSuggestion(text: string): MomentSuggestion | null {
  const parse = (t: string): MomentSuggestion | null => {
    try {
      const j = JSON.parse(t) as { title?: unknown; memo?: unknown };
      if (typeof j.title !== "string" || typeof j.memo !== "string") return null;
      return { title: j.title, memo: j.memo };
    } catch { return null; }
  };
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const raw = parse(text) ?? parse(fenced);
  if (raw === null) return null;
  const clean = (s: string, max: number) => {
    let v = stripWrappingQuotes(s);
    if (v.length > max) v = v.slice(0, max).trim();
    return v;
  };
  const title = clean(raw.title, MAX_TITLE_CHARS + 20);
  const memo = clean(raw.memo, MAX_MEMO_CHARS + 60);
  if (!title || !memo) return null;
  return { title, memo };
}

/** moment3 응답 스키마 — 세 방향 모두 요구하되, 파서가 방향별로 재검증한다 */
export const MOMENT3_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    calm:  { type: "object", properties: { title: { type: "string" }, memo: { type: "string" } }, required: ["title", "memo"] },
    witty: { type: "object", properties: { title: { type: "string" }, memo: { type: "string" } }, required: ["title", "memo"] },
    warm:  { type: "object", properties: { title: { type: "string" }, memo: { type: "string" } }, required: ["title", "memo"] },
  },
  required: ["calm", "witty", "warm"],
} as const;

/**
 * moment3 응답 파서 — PARSER SAFETY GUARD 원칙 그대로.
 * 방향별로 개별 검증한다: 한 방향이 깨져도(필드 누락·빈 값) 나머지는 살린다.
 * 전 방향이 무효면 null(전체 실패) — 화면은 기존 실패 안내를 쓴다.
 */
export function extractMoment3(text: string): MomentSuggestionSet3 | null {
  const parse = (t: string): Record<string, unknown> | null => {
    try { const j = JSON.parse(t); return j && typeof j === "object" ? j as Record<string, unknown> : null; }
    catch { return null; }
  };
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const raw = parse(text) ?? parse(fenced);
  if (raw === null) return null;
  const clean = (s: string, max: number) => {
    let v = stripWrappingQuotes(s);
    if (v.length > max) v = v.slice(0, max).trim();
    return v;
  };
  const set: MomentSuggestionSet3 = {};
  for (const d of WRITING_DIRECTIONS) {
    const e = raw[d] as { title?: unknown; memo?: unknown } | undefined;
    if (!e || typeof e.title !== "string" || typeof e.memo !== "string") continue;
    const title = clean(e.title, MAX_TITLE_CHARS + 20);
    const memo = clean(e.memo, MAX_MEMO_CHARS + 60);
    if (title && memo) set[d] = { title, memo };
  }
  return Object.keys(set).length > 0 ? set : null;
}

/**
 * ja 재치의 기계적 「笑」 꼬리 제거 (V2 §6 — 「笑」로 유머를 대신하지 않는다).
 * 프롬프트 지시에도 붙는 사례가 실측돼 결정적으로 벗긴다. 문장 끝의
 * 笑/(笑)/ｗ/w 꼬리만 — 본문 중간의 표현은 건드리지 않는다.
 */
// ── V4 §F — 계절 사실 가드 ──────────────────────────────────────────────────
// 사진의 꽃·잎·옷차림이나 여행 날짜만으로 계절을 단정하지 못하게 한다(실측
// 결함: 봄 목련 사진의 ja 감성에 「秋風」). 계절 표현은 사용자의 제목·메모 등
// 신뢰 입력에 그 계절이 명시된 경우에만 허용 — 위반한 방향만 폐기(재호출 0).
// 감성적 비유·유머는 계절 단정이 아니면 그대로 허용한다.

type CanonSeason = "spring" | "summer" | "autumn" | "winter";
const SEASON_PATTERNS: Record<CanonSeason, RegExp> = {
  // CJK 는 부분 문자열, EN 은 단어 경계(waterfall/fallback 의 fall 오탐 방지)
  spring: /봄|春|(?<![a-z])spring(?![a-z])/iu,
  summer: /여름|夏|(?<![a-z])summer(?![a-z])/iu,
  autumn: /가을|秋|(?<![a-z])(?:autumn|fall foliage|fall colors)(?![a-z])|(?<!water|rain|night|pit)(?<![a-z])fall(?![a-z])/iu,
  winter: /겨울|冬|(?<![a-z])winter(?![a-z])/iu,
};

/** 텍스트에 등장하는 계절(정규화) 집합 */
export function detectSeasons(text: string): Set<CanonSeason> {
  const out = new Set<CanonSeason>();
  for (const [season, re] of Object.entries(SEASON_PATTERNS) as [CanonSeason, RegExp][]) {
    if (re.test(text)) out.add(season);
  }
  return out;
}

/**
 * 신뢰 가능한 계절 근거 — 사용자가 직접 쓴 draft(제목·메모)와, hero 의 경우
 * 사용자가 저장한 공개 moment 문구(tripFacts)만. 여행 날짜(dates)는 근거가
 * 아니다(§F — 날짜만으로 계절성 감정·바람을 단정하지 않는다).
 */
export function allowedSeasonsOf(c: WritingContext): Set<CanonSeason> {
  const trusted = [c.draft ?? "", ...(c.tripFacts ?? [])].join("\n");
  return detectSeasons(trusted);
}

/** 출력이 근거 없는 계절을 단정하면 true(그 방향 폐기 대상) */
export function seasonViolation(c: WritingContext, output: string): boolean {
  const used = detectSeasons(output);
  if (used.size === 0) return false;
  const allowed = allowedSeasonsOf(c);
  for (const s of used) if (!allowed.has(s)) return true;
  return false;
}

/**
 * V3 §9 — 감성 상투구 검출(4locale). 걸리면 그 warm 방향만 폐기한다(자동
 * 재호출 0 — 직접 작성·다른 방향은 유지). 발생 빈도는 로그로 집계한다.
 */
export const STOCK_WARM_RE =
  /모든 것이 멈춘|시간이 멈춘|잊지 못할|마음속에 오래|꿈처럼|꿈결처럼|time (?:stood|stands) still|unforgettable|like a dream|時が止ま|夢のよう|忘れられない|仿佛静止|时间静止|如梦|难忘/i;

export function stripJaLaughTail(s: string): string {
  return s.replace(/[\s]*(?:\(笑\)|（笑）|笑|ｗ+|w{1,3})$/u, "").trim();
}

// ── V5 §C — witty 길이 계약(생성부터 짧게, 위반 = witty 만 폐기·재호출 0) ────
// SNS 캡션은 길면 이미 실패다. 목표(target)는 프롬프트가 요구하고, 여기의
// max 는 서버 하드 한도다 — 잘라서 살리지 않는다(잘린 개그는 개그가 아니다).
// en 은 단어 수, CJK 는 문자 수(공백 포함) 기준.
export const WITTY_LEN_LIMIT: Record<WritingLocale, { titleMax: number; memoMax: number; unit: "chars" | "words" }> = {
  ko: { titleMax: 22, memoMax: 45, unit: "chars" },
  en: { titleMax: 10, memoMax: 18, unit: "words" },
  ja: { titleMax: 22, memoMax: 42, unit: "chars" },
  zh: { titleMax: 18, memoMax: 36, unit: "chars" },
};
export function wittyLenViolation(locale: WritingLocale, title: string, memo: string): boolean {
  const lim = WITTY_LEN_LIMIT[locale];
  const len = (s: string): number =>
    lim.unit === "words" ? s.trim().split(/\s+/).filter(Boolean).length : s.trim().length;
  return len(title) > lim.titleMax || len(memo) > lim.memoMax;
}

/**
 * V5 §B — witty 철학 독백·추상 자기질문 검출(좁은 결정적 패턴만). 실측 실패
 * 사례("나는 뭘 봤을까…")의 형태만 잡는다 — 자연어 전반을 심사하지 않는다.
 * 걸리면 witty 만 폐기(재호출 0).
 */
export const WITTY_MONOLOGUE_RE =
  /(?:뭘|무얼|무엇을)\s*(?:봤|보았|했|느꼈)을까|나는\s*무엇|내가\s*본\s*것?은\s*무엇|what\s+(?:did|do)\s+i\s+(?:even\s+)?(?:see|feel|learn)|何を(?:見|感じ)た(?:の)?(?:だろう|かな)|私は何を|我(?:到底)?(?:看|感受)到了什么/i;

/** moment3 세트에 방향별 guard — 걸린 방향만 빠진다(부분 성공 유지) */
export function groundedMoment3Guard(req: WritingRequest, set: MomentSuggestionSet3 | null): MomentSuggestionSet3 | null {
  if (set === null) return null;
  const out: MomentSuggestionSet3 = {};
  for (const d of WRITING_DIRECTIONS) {
    let pair = set[d];
    if (!pair) continue;
    if (req.locale === "ja" && d === "witty") {
      const title = stripJaLaughTail(pair.title), memo = stripJaLaughTail(pair.memo);
      if (!title || !memo) continue;
      pair = { title, memo };
    }
    // V3 §9 — warm 상투구는 그 방향만 폐기(재호출 0·다른 방향 유지)
    if (d === "warm" && STOCK_WARM_RE.test(pair.title + "\n" + pair.memo)) continue;
    // V5 §C·§B — witty 길이 계약 위반·철학 독백은 witty 만 폐기(재호출 0)
    if (d === "witty" && (wittyLenViolation(req.locale, pair.title, pair.memo)
      || WITTY_MONOLOGUE_RE.test(pair.title + "\n" + pair.memo))) continue;
    if (groundedSuggestionGuard(req, pair.title) !== null && groundedSuggestionGuard(req, pair.memo) !== null) out[d] = pair;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ── 멀티모달 moment3 (§A-1·§B·§C·§D) ────────────────────────────────────────
// 사진이 있으면 한 번의 멀티모달 요청으로 세 문체를 창작한다. 사진이 없으면
// 이 경로를 절대 타지 않는다(§G — 기존 텍스트 프롬프트 그대로, 멀티모달 0).

/** 멀티모달 응답 스키마 — witty/warm 은 검증용 creative_kind·visual_basis 필수 */
export const MOMENT3_MULTIMODAL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    calm:  { type: "object", properties: { title: { type: "string" }, memo: { type: "string" } }, required: ["title", "memo"] },
    witty: { type: "object", properties: {
      title: { type: "string" }, memo: { type: "string" },
      creative_kind: { type: "string" }, visual_basis: { type: "array", items: { type: "string" } },
      trend_used_id: { type: "string" },
    }, required: ["title", "memo", "creative_kind", "visual_basis"] },
    warm:  { type: "object", properties: {
      title: { type: "string" }, memo: { type: "string" },
      creative_kind: { type: "string" }, visual_basis: { type: "array", items: { type: "string" } },
    }, required: ["title", "memo", "creative_kind", "visual_basis"] },
  },
  required: ["calm", "witty", "warm"],
} as const;

/** 사진 경로 전용 생성 예산 — 검증 필드 2종이 추가되므로 상향(thinking 포함 상한) */
export const MOMENT3_MULTIMODAL_MAX_OUTPUT_TOKENS = 3400;

/**
 * 멀티모달 전용 timeout — 이미지 입력은 텍스트보다 오래 걸린다(QA 실측: 4locale
 * 중 6.8~7.7s, ja 1건 8.0s 초과로 기존 8s 상한 timeout). 재시도 0 계약은 그대로.
 */
export const MOMENT3_MULTIMODAL_TIMEOUT_MS = 12_000;

/**
 * 멀티모달 moment3 프롬프트 — 텍스트 경로(buildWritingPrompt)와 분리한다.
 * 이유: 텍스트 경로의 "사진 내용 단정 금지·비유/의인화 금지" 규칙이 사진을
 * 실제로 보는 창작 계약과 정면 충돌한다. 공통 안전 규칙(고유명사·언어 격리·
 * 인물 추론 금지·사건 발명 금지)은 그대로 유지한다.
 */
export function buildMoment3MultimodalPrompt(req: WritingRequest, trendEntries?: readonly TrendPromptEntry[]): string {
  const c = req.context;
  const facts: string[] = [`city: ${clip(c.city, 40)}`];
  if (clip(c.placeName)) facts.push(`place: ${clip(c.placeName, 80)}`);
  if (clip(c.category, 40)) facts.push(`place category: ${clip(c.category, 40)}`);
  if (typeof c.dayNumber === "number" && c.dayNumber >= 1) facts.push(`trip day: Day ${Math.floor(c.dayNumber)}`);
  if (clip(c.dates, 40)) facts.push(`trip dates: ${clip(c.dates, 40)}`);
  const draft = clip(c.draft, MAX_CONTEXT_CHARS);
  // 길이 목표(§H) — 생성 후 자르지 않고 처음부터 짧게 쓰게 한다
  const lenGoal = req.locale === "en"
    ? "Length goal (calm/warm): title within ~45 characters, memo within ~90 characters. Write short FROM THE START — never a long line to be trimmed."
    : "Length goal (calm/warm): title around 18 characters, memo around 30 characters (CJK). Write short FROM THE START — one beat, not a paragraph.";
  // V5 §C — witty 는 SNS 캡션 길이 계약이 더 엄격하다. 서버가 max 초과 witty 를
  // 통째로 폐기하므로(자르지 않음) 프롬프트가 처음부터 계약을 알아야 한다.
  const wl = WITTY_LEN_LIMIT[req.locale];
  const wittyLen = wl.unit === "words"
    ? `HARD LENGTH CONTRACT for "witty": title 2-7 words (never more than ${wl.titleMax}), memo 5-12 words (never more than ${wl.memoMax}). A witty line over the limit is DISCARDED whole, not trimmed.`
    : `HARD LENGTH CONTRACT for "witty": title within ${wl.titleMax} characters (aim shorter), memo within ${wl.memoMax} characters. A witty line over the limit is DISCARDED whole, not trimmed.`;
  const trend = (trendEntries ?? []).slice(0, 5);
  return [
    `You help a traveler caption ONE moment of their trip for their own diary/SNS. You are given the traveler's`,
    `own photo of this moment (attached) plus the facts below. Look at the photo carefully — the caption should`,
    `feel like it was written by someone who was actually standing there looking at this exact scene.`,
    `Write THREE complete entries for this SAME moment — one per direction (calm, witty, warm). Each entry =`,
    `one title (max ${MAX_TITLE_CHARS} characters) AND one short memo (max ${MAX_MEMO_CHARS} characters).`,
    lenGoal,
    wittyLen,
    `Language: write ONLY in ${LOCALE_NAME[req.locale]}. No other language, no romanization.`,
    LOCALE_ISOLATION[req.locale],
    LOCALE_VOICE[req.locale],
    `DIRECTIONS (each has its OWN creative license — they must be clearly distinguishable):`,
    `- "calm": factual and quiet. Only what is clearly visible in the photo, the place, the traveler's note, the`,
    `  real itinerary. A restrained diary line. No metaphor, no jokes.`,
    `- "witty": a SOCIAL-MEDIA CAPTION a funny friend would post under this exact photo. The reader's`,
    `  path is fixed: see the photo → read the title and INSTANTLY get what it points at → read the short`,
    `  memo → smile once → done. The title is a concrete hook about THIS scene (never abstract), the memo`,
    `  is the payoff — it must never repeat or re-explain the title.`,
    `  Use EXACTLY ONE comic device, chosen from: visual contrast, a comeback/retort, a one-plus-one style`,
    `  everyday analogy, swapping who is the main subject vs the background, personifying one thing in the`,
    `  scene, a current casual expression, a single dry observation, or flipping two elements of the photo.`,
    `  Craft level to aim for (do NOT copy, it is a shape reference): a night bridge doubled in the water →`,
    `  title "1+1 tonight", memo "came for one bridge, the water threw in another."`,
    `  HARD FAILURES for witty (any of these = the witty entry is worthless): a philosophical monologue or`,
    `  abstract self-question ("what did I really see..."), an explanation of the scene, an anticlimax gag`,
    `  that lands nowhere, two comic devices stacked, two slang expressions in one entry, a trend phrase`,
    `  bolted onto the end of the sentence, poetic-pretty lines (that is warm's job), or a caption that`,
    `  would fit any photo. Deadpan beats exclamation. If the photo gives nothing, one dry concrete`,
    `  observation about what IS in the frame still beats all of the above.`,
    `- "warm": POETIC. Use the photo's light, color, reflection, distance, night, space. Personify the scene,`,
    `  give it mood and emotional imagination. Clearly lyrical — never a fake experience report. Never reuse`,
    `  the same stock line for every place. BANNED warm clichés (any language): "time stood still",`,
    `  "모든 것이 멈춘 듯"·"시간이 멈춘 듯"·"잊지 못할"·"마음속에 오래"·"꿈처럼"·"時が止まった"·"夢のよう"·"仿佛静止"·"如梦"·"难忘".`,
    // §7·§8 — 이 locale 의 유머·감성 문법으로 처음부터 쓴다(한국어 번역체 금지)
    WITTY_LOCALE_CRAFT[req.locale],
    WARM_LOCALE_CRAFT[req.locale],
    ...(trend.length > 0 ? [
      `CURRENT EXPRESSIONS (reviewed list — for "witty" ONLY):`,
      ...trend.map(t => `- [${t.id}] "${t.phrase}" — ${t.meaning} e.g. ${t.usageExample} Avoid: ${t.avoidWhen}`),
      // V5 §D — 전달은 60%로 늘었지만 강제 사용이 아니다. 단, "단순 무시"도
      // 아니다: 자연 결합 가능성을 먼저 검토하고, 안 맞으면 정직하게 버린다.
      `Rules for these: FIRST genuinely check whether ONE of them fits this exact scene naturally, in its`,
      `original language and register — if it does, weaving it in usually makes the caption funnier; if none`,
      `truly fits, use none (do not force it). Use AT MOST ONE, only in "witty". Never stack several, never`,
      `translate one into another language, never bend the sentence to fit it, never bolt one onto the end`,
      `of an already-finished line, and never write a line that merely explains the expression.`,
      `Never insert artist/group/member names around it. If you weave one in you MUST report its [id] in`,
      `"trend_used_id" — an unreported use is discarded whole; omit the field when unused. calm and warm`,
      `must NOT use any of these.`,
    ] : [
      // V5 §E — trend 미전달 요청의 witty 가 "일반문"으로 처지지 않게: locale
      // 원어민 SNS 캡션 문법을 명시적으로 강제한다(철학·감성시·설명문 금지).
      `No current-expression list is provided for this request. Still write "witty" in the native`,
      `social-caption grammar of ${LOCALE_NAME[req.locale]} — the rhythm of a funny caption a local would`,
      `actually post — NOT a philosophical line, NOT a mini-poem, NOT a plain descriptive sentence.`,
    ]),
    `FACTS (besides the photo, the ONLY things known):`,
    ...facts.map(f => `- ${f}`),
    draft
      ? `The traveler already wrote this note — keep its meaning and voice, build on it, never contradict it:\n"${draft}"`
      : `No note exists — write freshly from the photo and facts above.`,
    `HARD RULES (all directions):`,
    `- NEVER guess or mention the identity, relationship, age, race, nationality, health, or character of any`,
    `  person in the photo. If people appear, treat them only as part of the general scene composition.`,
    `- NEVER invent real-sounding events: accidents, illness, purchases, lodging, eating/ordering, meeting`,
    `  people, dangerous actions. Creative imagery is allowed; fake experience reports are not.`,
    `- NEVER state wrong history/culture as fact. Never mock the place, local people, or culture.`,
    `- Provided place/business names are IMMUTABLE PROPER NOUNS — copy them exactly as written above.`,
    `- NEVER state or imply a season (spring/summer/autumn/winter, 봄·가을, 春·秋, 春天·秋天, seasonal winds`,
    `  like 秋風) unless the traveler's own note explicitly names that season. Flowers, leaves, or clothing`,
    `  in the photo are NOT proof of a season. Trip dates are NOT proof either.`,
    `- No internet slang, no ㅋㅋ/LOL, no emoji, no hashtags. Do not address the reader.`,
    `- NO tourism-marketing clichés in any language (banned Korean examples: ${BANNED_PHRASES}).`,
    `- First person voice of the traveler.`,
    `For "witty" and "warm" also return, FOR VERIFICATION ONLY:`,
    `- "creative_kind": the main device used — one of ${CREATIVE_KINDS.join(", ")}.`,
    `- "visual_basis": 1-3 generic visual elements of the photo you actually used — ONLY from:`,
    `  ${VISUAL_BASIS_ALLOWED.join(", ")}. Never people, identity, GPS, or objects not in the photo.`,
    `Return JSON: {"calm": {"title": "...", "memo": "..."}, "witty": {"title": "...", "memo": "...",`,
    `"creative_kind": "...", "visual_basis": ["..."]}, "warm": {"title": "...", "memo": "...",`,
    `"creative_kind": "...", "visual_basis": ["..."]}}`,
  ].join("\n");
}

/** 멀티모달 응답의 검증 메타 — 로그·캐시 진단용(whitelist 값·pack id 뿐, 화면·공개 API 노출 0) */
export interface Moment3CreativeMeta {
  kinds: Partial<Record<WritingDirection, string>>;
  dropped: WritingDirection[];
  /** witty 가 실제 사용을 신고하고 검증을 통과한 pack id — 미사용이면 null */
  trendUsedId: string | null;
}

/**
 * 멀티모달 moment3 파서+검증 — calm 은 기존과 동일(제목·메모). witty/warm 은
 * creative_kind 가 허용 6종, visual_basis 가 허용 8종 ⊆ 이고 1개 이상이어야
 * 통과한다. 위반 방향만 빠진다(부분 성공 유지). 검증 필드는 클라이언트로
 * 돌려보내지 않는다 — 세트에는 title/memo 만 남긴다.
 */
export function extractMoment3Creative(
  text: string,
  /** 이번 요청 프롬프트에 실은 활성 pack — id→phrase(또는 [phrase, ...variants]). 없으면 trend 신고 자체가 위반이다(§G). */
  activeTrend?: ReadonlyMap<string, string | readonly string[]>,
  /** V5-1 §B — en 단어 경계·case 정규화에 필요. 생략 시 CJK 규칙(substring). */
  locale: WritingLocale = "ko",
): { set: MomentSuggestionSet3; meta: Moment3CreativeMeta } | null {
  const parse = (t: string): Record<string, unknown> | null => {
    try { const j = JSON.parse(t); return j && typeof j === "object" ? j as Record<string, unknown> : null; }
    catch { return null; }
  };
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const raw = parse(text) ?? parse(fenced);
  if (raw === null) return null;
  const clean = (s: string, max: number) => {
    let v = stripWrappingQuotes(s);
    if (v.length > max) v = v.slice(0, max).trim();
    return v;
  };
  const set: MomentSuggestionSet3 = {};
  const meta: Moment3CreativeMeta = { kinds: {}, dropped: [], trendUsedId: null };
  for (const d of WRITING_DIRECTIONS) {
    const e = raw[d] as { title?: unknown; memo?: unknown; creative_kind?: unknown; visual_basis?: unknown; trend_used_id?: unknown } | undefined;
    if (!e || typeof e.title !== "string" || typeof e.memo !== "string") { meta.dropped.push(d); continue; }
    const title = clean(e.title, MAX_TITLE_CHARS + 20);
    const memo = clean(e.memo, MAX_MEMO_CHARS + 60);
    if (!title || !memo) { meta.dropped.push(d); continue; }
    if (d === "witty" || d === "warm") {
      const kind = typeof e.creative_kind === "string" ? e.creative_kind.trim() : "";
      const basis = Array.isArray(e.visual_basis)
        ? e.visual_basis.filter((b): b is string => typeof b === "string").map(b => b.trim())
        : [];
      const allAllowed = basis.every(b => (VISUAL_BASIS_ALLOWED as readonly string[]).includes(b));
      if (!(CREATIVE_KINDS as readonly string[]).includes(kind) || basis.length === 0 || !allAllowed) {
        meta.dropped.push(d);
        continue;
      }
      meta.kinds[d] = kind;
    }
    // Trend 판정(V5-1 §C) — SSOT 는 서버 문자열 검사. AI 신고는 참고값:
    // 실제 1개 + 무신고 → 서버 자동 확정(V5 KO 폐기 문제의 해결 경로),
    // 실제≠신고·2개 이상·신고했는데 미포함 → witty 폐기(재호출 0).
    if (d === "witty") {
      const claimedRaw = typeof e.trend_used_id === "string" ? e.trend_used_id.trim() : "";
      const entries = [...(activeTrend ?? new Map<string, string | readonly string[]>())]
        .map(([id, f]) => ({ id, forms: typeof f === "string" ? [f] : f }));
      const v = resolveTrendUse(locale, title, memo, entries, claimedRaw || null);
      if (!v.ok) { delete set[d]; meta.dropped.push(d); delete meta.kinds[d]; continue; }
      meta.trendUsedId = v.usedId;
    }
    set[d] = { title, memo };
  }
  return Object.keys(set).length > 0 ? { set, meta } : null;
}

/** moment 쌍에 기존 결정적 guard 를 적용 — 한 필드라도 걸리면 쌍 전체가 실패다. */
export function groundedMomentGuard(req: WritingRequest, pair: MomentSuggestion | null): MomentSuggestion | null {
  if (pair === null) return null;
  const t = groundedSuggestionGuard(req, pair.title);
  const m = groundedSuggestionGuard(req, pair.memo);
  return t !== null && m !== null ? pair : null;
}

/**
 * provider 응답에서 제안을 안전하게 꺼낸다 — 깨졌으면 null(저장 흐름은 무사하다).
 *
 * PARSER SAFETY GUARD (WITTY-CLOSURE-PRODUCTION-V1): 예전에는 JSON 파싱이
 * 실패하면 원문을 그대로 후보로 썼는데, 그러면 malformed/truncated payload
 * (`{"suggestion": "부산…` 식 절단)가 사용자 화면에 raw JSON 으로 노출될 수
 * 있다(2026-09-11 canary 에서 1024/700 조합으로 실제 재현). 계약: 파싱이
 * 안 되는 응답은 제안이 아니라 실패다 — code fence 제거 후 재시도까지만 하고,
 * 그래도 안 되면 null(기존 honest fallback 흐름 그대로).
 */
export function extractSuggestion(text: string, target: WritingTarget): string | null {
  const parse = (t: string): string | null => {
    try {
      const j = JSON.parse(t) as { suggestion?: unknown };
      return typeof j.suggestion === "string" ? j.suggestion : null;
    } catch { return null; }
  };
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const raw = parse(text) ?? parse(fenced);
  if (raw === null) return null;
  let s = stripWrappingQuotes(raw);
  if (!s) return null;
  const max = target === "title" ? MAX_TITLE_CHARS + 20 : MAX_MEMO_CHARS + 60;
  if (s.length > max) s = s.slice(0, max).trim();
  return s || null;
}

/**
 * 좁은 결정적 출력 guard (LOCALE-FACT-GROUNDING-V1 §11) — 객관적으로 판별
 * 가능한 두 가지만 잡는다. 자연어 전체를 검사하는 validator 가 아니다.
 *
 *  1) JA/ZH 출력의 한글 오염 — 단, source(draft·placeName·tripTitle·city·
 *     tripFacts)에 실제로 있는 한글 글자는 허용한다(사용자가 쓴 한글을
 *     regex 로 뭉개지 않는다 — §9).
 *  2) hasPhoto=false 인데 사진 행동 서술 — draft 가 사진을 언급했으면 통과
 *     (사용자 사실이 우선).
 *
 * 걸리면 null = 기존 honest fallback(200 + suggestion:null). 재시도 없음.
 */
const PHOTO_ACTION_RE = /사진|찍었|찍고|찍은|찍어|카메라|셀카|photo|camera|selfie|snapshot|写真|撮っ|撮り|撮る|シャッター|拍了|拍照|拍下|照片|合影|自拍|镜头/i;

export function groundedSuggestionGuard(req: WritingRequest, suggestion: string | null): string | null {
  if (suggestion === null) return null;
  const c = req.context;
  const sources = [c.draft, c.placeName, c.tripTitle, c.city, c.category, ...(c.tripFacts ?? [])]
    .filter((v): v is string => typeof v === "string").join("\n");
  // V5-1 §E-8 — en 도 포함: EN 캡션에 source 에 없는 한글(예: KO trend phrase)이
  // 등장하면 언어 계약 위반으로 폐기한다(전달 목록 밖이라 trend 판정으로는 못 잡는다).
  if (req.locale === "ja" || req.locale === "zh" || req.locale === "en") {
    const allowed = new Set(sources.match(/[가-힣]/g) ?? []);
    for (const ch of suggestion.match(/[가-힣]/g) ?? []) {
      if (!allowed.has(ch)) return null; // source 에 없는 한글 = 오염
    }
  }
  if (c.hasPhoto === false || c.hasPhoto === undefined) {
    const draftMentionsPhoto = typeof c.draft === "string" && PHOTO_ACTION_RE.test(c.draft);
    if (!draftMentionsPhoto && PHOTO_ACTION_RE.test(suggestion)) return null;
  }
  // V4 §F — 근거 없는 계절 단정은 방향 단위로 폐기(사진·날짜는 근거가 아니다).
  // moment/moment3(3방향)/storyHero/title/memo 전부 이 guard 를 지난다 —
  // Functions·AI Worker 가 같은 함수를 쓰므로 계약이 동일하다.
  if (seasonViolation(c, suggestion)) return null;
  return suggestion;
}

/** 방향별 temperature — witty 는 재생성 다양성이 품질의 일부다(반복 regenerate 검수 계약). */
export const DIRECTION_TEMPERATURE: Record<WritingDirection, number> = {
  calm: 0.6, witty: 0.9, warm: 0.75,
};

/**
 * witty 전용 생성 예산 (WITTY-CLOSURE-PRODUCTION-V1, Owner 승인 canary 결과 적용).
 * gemini-2.5-flash 는 thinking 토큰이 maxOutputTokens 에 **포함**된다 —
 * 2026-09-11 canary 실측: 1024/700 조합은 23/32 가 JSON 절단. 그래서 두 값은
 * 반드시 세트다. canary(blind): GOOD 56%→75% · FLAT 6→2 · 비용 +59% ·
 * p50 3.4→5.1s(제품 timeout 8s 내). calm/warm 은 기존 그대로.
 */
export const WITTY_THINKING_BUDGET = 1024;
export const WITTY_MAX_OUTPUT_TOKENS = 1800;

/**
 * moment3 생성 예산 — 한 호출로 3쌍(JSON)을 낸다. witty 의 thinking 증액 근거를
 * 그대로 물려받되(1024), 출력은 3쌍 + thinking 이 maxOutputTokens 에 포함되므로
 * 절단 방지를 위해 상향한다(WITTY 1800=1쌍 기준 → 3쌍 3000).
 */
export const MOMENT3_MAX_OUTPUT_TOKENS = 3000;
export const MOMENT3_THINKING_BUDGET = 1024;
export const MOMENT3_TEMPERATURE = 0.85;

export function buildProviderBody(prompt: string, direction?: WritingDirection, target?: WritingTarget, image?: WritingImage | null): unknown {
  if (target === "moment3") {
    // 멀티모달(§A-1): 사진이 있으면 inlineData 로 픽셀을 함께 보낸다 — 1회 요청.
    // 사진이 없으면 이미지 part 자체가 없다(§G — 멀티모달 호출 0).
    const parts = image
      ? [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: prompt }]
      : [{ text: prompt }];
    return {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: image ? MOMENT3_MULTIMODAL_MAX_OUTPUT_TOKENS : MOMENT3_MAX_OUTPUT_TOKENS,
        temperature: MOMENT3_TEMPERATURE,
        responseMimeType: "application/json",
        responseSchema: image ? MOMENT3_MULTIMODAL_RESPONSE_SCHEMA : MOMENT3_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: MOMENT3_THINKING_BUDGET },
      },
    };
  }
  const witty = direction === "witty";
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: witty ? WITTY_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
      // 글맛이 필요한 작업 — profile(0.3)보다 높게, 폭주는 스키마로 잠근다
      temperature: direction ? DIRECTION_TEMPERATURE[direction] : 0.7,
      responseMimeType: "application/json",
      responseSchema: target === "storyHero" ? HERO_RESPONSE_SCHEMA : target === "moment" ? MOMENT_RESPONSE_SCHEMA : RESPONSE_SCHEMA,
      // witty 만 thinking 증액 — "관찰→반전" 구성이 즉답으로는 자주 무너진다
      // (blind 실측, 특히 JA·food-heavy title). 같은 모델·같은 provider 의
      // 요청 옵션이며 호출은 버튼 클릭 시 1회뿐이다.
      thinkingConfig: { thinkingBudget: witty ? WITTY_THINKING_BUDGET : 256 },
    },
  };
}
