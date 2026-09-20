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
export const MOMENT3_PROMPT_VERSION = "moment3-v1";
export const STORY_HERO_PROMPT_VERSION = "storyHero-v3-witty";

/**
 * 재치 문체의 허용 표현 장치 (WITTY-TONE-QUALITY V1 §E).
 * witty(화면 라벨: "가볍고 재치 있게")에서만 응답에 style_device 가 필수이고,
 * 이 목록 밖 값이면 서버가 결과를 폐기한다. DB·공개 API·화면에 저장·노출 0.
 */
export const HERO_STYLE_DEVICES = ["contrast", "rhythm", "callback", "wordplay", "observation"] as const;
export type HeroStyleDevice = (typeof HERO_STYLE_DEVICES)[number];

/**
 * hero 전용 재치 브리프 — moment 용 witty 브리프와 별개다. 재치는 사실을 바꾸는
 * 기능이 아니라 같은 사실의 배열·리듬을 바꾸는 기능이다(§C).
 */
export const HERO_WITTY_BRIEF = [
  "Direction 2 — light, witty (화면: 가볍고 재치 있게). NOT comedy, NOT jokes — the quiet wit of a",
  "well-written travel journal. You MUST use at least ONE of these devices, built ONLY from the listed facts,",
  "and name it in style_device:",
  '- "contrast": play the trip numbers or places against each other (e.g. 9 stops on the itinerary vs the one scene the memos lingered on).',
  '- "rhythm": repeat one sentence shape across places so the repetition itself carries the smile.',
  '- "callback": pick up a word that actually appears in a public moment memo and return to it with a twist.',
  '- "wordplay": light, natural play on a place name or a memo word of THIS locale — never translate a pun from another language.',
  '- "observation": one dry observation about the trip pattern visible in the facts (a mild personification of the itinerary/footsteps/gaze is allowed — never of people).',
  "The reader must feel the difference from a plain calm line — but the FACTS stay identical to calm.",
  "STILL FORBIDDEN: invented actions/feelings/companions/weather/food/mishaps/tiredness, revisit-intent,",
  "mocking heritage or locals, internet slang, ㅋㅋ/LOL, emoji, forced dad-jokes, sarcasm, exaggeration beyond the facts.",
].join(" ");

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

/** hero 응답 — {title, memo(=intro), source_refs, style_device?}. 파싱 실패·필드 누락은 null. */
export interface HeroSuggestion extends MomentSuggestion { sourceRefs: string[]; styleDevice: string | null }

export const HERO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    memo: { type: "string" },
    source_refs: { type: "array", items: { type: "string" } },
    style_device: { type: "string" },
  },
  required: ["title", "memo", "source_refs"],
} as const;

export function extractHeroSuggestion(text: string): HeroSuggestion | null {
  const parse = (t: string): Record<string, unknown> | null => {
    try { const j = JSON.parse(t); return j && typeof j === "object" ? j as Record<string, unknown> : null; }
    catch { return null; }
  };
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const raw = parse(text) ?? parse(fenced);
  if (raw === null) return null;
  if (typeof raw.title !== "string" || typeof raw.memo !== "string" || !Array.isArray(raw.source_refs)) return null;
  const refs = raw.source_refs.filter((r): r is string => typeof r === "string").map(r => r.trim()).filter(Boolean);
  const clean = (s: string, max: number) => {
    let v = s.trim().replace(/^["'“」『]+|["'”」』]+$/g, "").trim();
    if (v.length > max) v = v.slice(0, max).trim();
    return v;
  };
  const title = clean(raw.title, MAX_TITLE_CHARS + 20);
  const memo = clean(raw.memo, MAX_HERO_INTRO_CHARS + 60);
  if (!title || !memo || refs.length === 0) return null;
  const styleDevice = typeof raw.style_device === "string" ? raw.style_device.trim() : null;
  return { title, memo, sourceRefs: refs, styleDevice };
}

/**
 * hero 결과 검증 — ① source_refs 가 제공 키 집합 안에만 있어야 하고,
 * ② witty(재치)는 허용 style_device 가 반드시 있어야 한다(§E). 위반은 폐기.
 * style_device 는 검증에만 쓰고 저장·노출하지 않는다.
 */
export function validateHeroRefs(req: WritingRequest, hero: HeroSuggestion | null): MomentSuggestion | null {
  if (hero === null) return null;
  const keys = new Set(buildHeroFacts(req.context).map(f => f.key));
  for (const r of hero.sourceRefs) if (!keys.has(r)) return null;
  if (req.direction === "witty") {
    if (!hero.styleDevice || !(HERO_STYLE_DEVICES as readonly string[]).includes(hero.styleDevice)) return null;
  }
  return { title: hero.title, memo: hero.memo };
}

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
      // 표지 재치는 moment 재치와 다른 공예다(§C) — hero 전용 브리프로 교체.
      : req.target === "storyHero" && req.direction === "witty"
      ? [HERO_WITTY_BRIEF]
      : [DIRECTION_BRIEF[req.direction]]),
    targetCraft,
    `ALLOWED FACTS (the ONLY facts that exist — everything else is UNKNOWN):`,
    ...(req.target === "storyHero"
      ? buildHeroFacts(c).map(f => `- [${f.key}] ${f.text}`)
      : facts.map(f => `- ${f}`)),
    ...(req.target === "storyHero" ? [
      `GROUNDING RULES (storyHero):
- Every sentence of the title and intro must be traceable to the listed fact keys — nothing else exists.
- Return in "source_refs" ONLY the keys (like "f1") you actually used. Do not invent keys.
- NEVER add feelings, satisfaction, regret, longing, or intent to return (e.g. "다시 걷고 싶다", "또 오고 싶다", "좋았다") unless that exact sentiment is written inside a listed public moment memo.
- The three tones (calm/witty/warm) change WORDING ONLY — never the set of facts. No new events, no new emotions in any tone.`,
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
  ? (req.direction === "witty"
      ? 'Return JSON: {"title": "<title>", "memo": "<intro>", "source_refs": ["f1", "f2"], "style_device": "<one of: contrast|rhythm|callback|wordplay|observation>"}'
      : 'Return JSON: {"title": "<title>", "memo": "<intro>", "source_refs": ["f1", "f2"]}')
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
    let v = s.trim().replace(/^["'“」『]+|["'”」』]+$/g, "").trim();
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
    let v = s.trim().replace(/^["'“」『]+|["'”」』]+$/g, "").trim();
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

/** moment3 세트에 방향별 guard — 걸린 방향만 빠진다(부분 성공 유지) */
export function groundedMoment3Guard(req: WritingRequest, set: MomentSuggestionSet3 | null): MomentSuggestionSet3 | null {
  if (set === null) return null;
  const out: MomentSuggestionSet3 = {};
  for (const d of WRITING_DIRECTIONS) {
    const pair = set[d];
    if (!pair) continue;
    if (groundedSuggestionGuard(req, pair.title) !== null && groundedSuggestionGuard(req, pair.memo) !== null) out[d] = pair;
  }
  return Object.keys(out).length > 0 ? out : null;
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
  let s = raw.trim().replace(/^["'“」『]+|["'”」』]+$/g, "").trim();
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
  if (req.locale === "ja" || req.locale === "zh") {
    const allowed = new Set(sources.match(/[가-힣]/g) ?? []);
    for (const ch of suggestion.match(/[가-힣]/g) ?? []) {
      if (!allowed.has(ch)) return null; // source 에 없는 한글 = 오염
    }
  }
  if (c.hasPhoto === false || c.hasPhoto === undefined) {
    const draftMentionsPhoto = typeof c.draft === "string" && PHOTO_ACTION_RE.test(c.draft);
    if (!draftMentionsPhoto && PHOTO_ACTION_RE.test(suggestion)) return null;
  }
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

export function buildProviderBody(prompt: string, direction?: WritingDirection, target?: WritingTarget): unknown {
  if (target === "moment3") {
    return {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: MOMENT3_MAX_OUTPUT_TOKENS,
        temperature: MOMENT3_TEMPERATURE,
        responseMimeType: "application/json",
        responseSchema: MOMENT3_RESPONSE_SCHEMA,
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
