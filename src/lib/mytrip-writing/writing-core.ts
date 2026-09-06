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

const DIRECTION_BRIEF: Record<WritingDirection, string> = {
  calm:  "Direction 1 — restrained, calm, unburdened. Plain quiet sentences. No exclamation marks, no hype words, no emoji.",
  witty: "Direction 2 — humor, wit, a light clever touch. One gentle smile, never slapstick, never sarcasm about the place. No emoji.",
  warm:  "Direction 3 — emotional and warm. Soft sensory feeling, sincere, not syrupy. At most quiet lyricism. No emoji.",
};

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
  if (c.hasPhoto) facts.push("the traveler took a photo at this moment (you cannot see it)");
  if (clip(c.tripTitle, 80) && req.target === "memo") facts.push(`trip title: ${clip(c.tripTitle, 80)}`);
  const draft = clip(c.draft, MAX_CONTEXT_CHARS);

  const what = req.target === "title"
    ? `one trip title, max ${MAX_TITLE_CHARS} characters`
    : `one short travel memo of 1-2 sentences, max ${MAX_MEMO_CHARS} characters`;

  return [
    `You help a traveler write in their own trip diary. Write ${what}.`,
    `Language: write ONLY in ${LOCALE_NAME[req.locale]}. No other language, no romanization.`,
    DIRECTION_BRIEF[req.direction],
    `Known context (the ONLY facts you may use):`,
    ...facts.map(f => `- ${f}`),
    draft
      ? `The traveler already wrote this draft — polish it in the requested direction, keep their meaning and any personal detail, do not add new events:\n"${draft}"`
      : `No draft exists — write freshly from the context above.`,
    `Hard rules:`,
    `- Do NOT invent facts, prices, history, rankings, weather, companions, or feelings about things not in the context.`,
    `- Do NOT mention previous or next itinerary stops, schedules, or "다음 일정" style transitions.`,
    `- Do NOT address the reader, do NOT explain yourself, no hashtags, no quotes around the text.`,
    `- First person voice of the traveler. Output the ${req.target} text alone.`,
    `Return JSON: {"suggestion": "<text>"}`,
  ].join("\n");
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: { suggestion: { type: "string" } },
  required: ["suggestion"],
} as const;

/** provider 응답에서 제안을 안전하게 꺼낸다 — 깨졌으면 null(저장 흐름은 무사하다) */
export function extractSuggestion(text: string, target: WritingTarget): string | null {
  let s = "";
  try {
    const j = JSON.parse(text) as { suggestion?: unknown };
    if (typeof j.suggestion === "string") s = j.suggestion;
  } catch { s = text; }
  s = s.trim()
    .replace(/^```(?:json)?/i, "").replace(/```$/, "")
    .replace(/^["'“」『]+|["'”」』]+$/g, "")
    .trim();
  if (!s) return null;
  const max = target === "title" ? MAX_TITLE_CHARS + 20 : MAX_MEMO_CHARS + 60;
  if (s.length > max) s = s.slice(0, max).trim();
  return s || null;
}

export function buildProviderBody(prompt: string): unknown {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,                 // 글맛이 필요한 작업 — profile(0.3)보다 높게, 폭주는 스키마로 잠근다
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}
