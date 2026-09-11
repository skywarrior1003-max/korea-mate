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
export type WritingTarget = "title" | "memo";
export type WritingLocale = "ko" | "en" | "ja" | "zh";

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
    (r.target === "title" || r.target === "memo") &&
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
  if (c.hasPhoto) facts.push("the traveler took a photo at this moment — you cannot see it and do NOT know what is in it: never describe or guess its contents");
  if (clip(c.tripTitle, 80) && req.target === "memo") facts.push(`trip title: ${clip(c.tripTitle, 80)}`);
  // 실제 일정에서 셈한 여행 패턴(deriveTripWritingFacts) — 특히 title 의 재료다
  for (const f of (c.tripFacts ?? []).slice(0, MAX_TRIP_FACTS)) {
    const t = clip(f, MAX_FACT_CHARS);
    if (t) facts.push(t);
  }
  const draft = clip(c.draft, MAX_CONTEXT_CHARS);

  const what = req.target === "title"
    ? `one trip title, max ${MAX_TITLE_CHARS} characters`
    : `one short travel memo of 1-2 sentences, max ${MAX_MEMO_CHARS} characters`;

  const targetCraft = req.target === "title"
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
    DIRECTION_BRIEF[req.direction],
    targetCraft,
    `Known context (the ONLY facts you may use):`,
    ...facts.map(f => `- ${f}`),
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
    `- First person voice of the traveler. Output the ${req.target} text alone.`,
    `Before you answer: silently list every concrete claim in your line (people, photos, purchases, times, weather, objects, numbers, prior stops) and DELETE any claim not literally present in the facts/draft — replace it with plain being-there observation. Then output.
Return JSON: {"suggestion": "<text>"}`,
  ].join("\n");
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: { suggestion: { type: "string" } },
  required: ["suggestion"],
} as const;

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

export function buildProviderBody(prompt: string, direction?: WritingDirection): unknown {
  const witty = direction === "witty";
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: witty ? WITTY_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
      // 글맛이 필요한 작업 — profile(0.3)보다 높게, 폭주는 스키마로 잠근다
      temperature: direction ? DIRECTION_TEMPERATURE[direction] : 0.7,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // witty 만 thinking 증액 — "관찰→반전" 구성이 즉답으로는 자주 무너진다
      // (blind 실측, 특히 JA·food-heavy title). 같은 모델·같은 provider 의
      // 요청 옵션이며 호출은 버튼 클릭 시 1회뿐이다.
      thinkingConfig: { thinkingBudget: witty ? WITTY_THINKING_BUDGET : 256 },
    },
  };
}
