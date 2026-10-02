// 한 번의 Gemini generateContent 요청이 낼 수 있는 최대 비용(µ$) — 보낼 요청 본문만 보고 계산한다 (2026-10-02)
//
// Pages Functions 는 이 값으로 회사 원장에 예약하고, 서울 Worker 는 같은 함수로 다시 계산해 호출측이 알린 예약액보다
// 크면 모델에 보내지 않는다. 고정 예약값(예: 가져오기 12,100 · 개인화 2,500)은 입력이 커지면 실제 최악을 덮지 못했다.
//
// 상한식
//   입력 토큰 ≤ (사진 데이터를 뺀 본문 UTF-8 바이트) × 1 + 사진 장수 × 사진 1장 토큰
//     · 글 1바이트당 토큰 ≤ 1 — countTokens(3.5 Flash-Lite) 실측: 9가지 문자 종류 모두 토큰 ≤ UTF-8 바이트(최대 1.000).
//       본문 바이트는 지시문·사실·JSON 이스케이프·responseSchema·generationConfig 까지 모두 세므로 모델이 읽는 글보다 크거나 같다.
//     · 사진 1장 토큰 — Gemini 3 공식 표: LOW 280 · MEDIUM 560 · HIGH 1120. 지정이 없으면 HIGH 로 센다.
//   출력 토큰 ≤ generationConfig.maxOutputTokens — 3.x 는 사고 토큰도 이 상한 안이다(10-02 실측: 상한 32 에 사고 26+본문 2).
//     2.x 는 사고 토큰이 상한 밖일 수 있어 thinkingBudget 0 일 때만 받는다.
//   단가 — 받는 모델 중 가장 비싼 값(지금은 둘 다 $0.30/$2.50 per 1M).
//
// 계산할 수 없는 요청은 거절한다: 도구(검색 grounding 등 별도 과금)·외부 파일·사진 외 미디어·출력 상한 없음·상한 초과.
// 이것은 countTokens 몇 가지 예시가 아니라 "본문 바이트 ≥ 토큰" 가정 위의 상한이다 — 그 가정은 실측으로 확인했고 증명은 아니다.

/** 이 Worker·원장이 단가를 아는 모델(µ$/토큰). 여기 없는 모델로는 부르지 않는다 */
export const PRICED_MODELS: Readonly<Record<string, { inTok: number; outTok: number }>> = {
  "gemini-2.5-flash":      { inTok: 0.30, outTok: 2.50 },
  "gemini-3.5-flash-lite": { inTok: 0.30, outTok: 2.50 },
};
export const IMAGE_TOKENS: Readonly<Record<string, number>> = {
  MEDIA_RESOLUTION_LOW: 280, MEDIA_RESOLUTION_MEDIUM: 560, MEDIA_RESOLUTION_HIGH: 1120,
};
/** 지정이 없을 때 사진 1장 토큰 — 가장 큰 값 */
export const IMAGE_TOKENS_DEFAULT = 1120;
/** 받는 출력 상한의 최댓값 */
export const MAX_OUTPUT_TOKENS_CAP = 8192;
/** 호출측이 알린 예약액(µ$) — Worker 가 상한과 비교한다 */
export const RESERVED_HEADER = "x-gkm-reserved-usd-micro";

export type BoundResult =
  | { ok: true; textBytes: number; images: number; imageTokens: number; maxOut: number; usdMicro: number }
  | { ok: false; reason: "invalid_body" | "tools_not_allowed" | "file_data_not_allowed" | "non_image_media" | "no_output_cap" | "output_cap_too_large" | "thinking_unbounded" };

function maxPrice(): { inTok: number; outTok: number } {
  const all = Object.values(PRICED_MODELS);
  return { inTok: Math.max(...all.map(p => p.inTok)), outTok: Math.max(...all.map(p => p.outTok)) };
}

/** 본문(문자열 또는 객체)의 최대 비용. 모델은 받지 않는다 — PRICED_MODELS 중 가장 비싼 단가로 센다 */
export function providerBodyBound(body: unknown): BoundResult {
  let b: Record<string, unknown>;
  try { b = (typeof body === "string" ? JSON.parse(body) : body) as Record<string, unknown>; } catch { return { ok: false, reason: "invalid_body" }; }
  if (!b || typeof b !== "object" || !Array.isArray(b.contents)) return { ok: false, reason: "invalid_body" };
  if ("tools" in b || "toolConfig" in b || "cachedContent" in b) return { ok: false, reason: "tools_not_allowed" };
  const gc = (b.generationConfig ?? {}) as Record<string, unknown>;
  const maxOut = gc.maxOutputTokens;
  if (typeof maxOut !== "number" || !Number.isInteger(maxOut) || maxOut < 1) return { ok: false, reason: "no_output_cap" };
  if (maxOut > MAX_OUTPUT_TOKENS_CAP) return { ok: false, reason: "output_cap_too_large" };
  // 2.x 는 사고 토큰이 출력 상한 밖일 수 있다 — 사고를 끈(thinkingBudget 0) 요청만 받는다. 3.x 로는 Worker 가 thinkingLevel 로 바꾼다.
  const tc = gc.thinkingConfig as Record<string, unknown> | undefined;
  if (!tc || tc.thinkingBudget !== 0) return { ok: false, reason: "thinking_unbounded" };
  let images = 0;
  const stripped = JSON.parse(JSON.stringify(b)) as { contents: { parts?: Record<string, unknown>[] }[]; systemInstruction?: { parts?: Record<string, unknown>[] } };
  const allParts = [...stripped.contents.flatMap(c => c.parts ?? []), ...(stripped.systemInstruction?.parts ?? [])];
  for (const p of allParts) {
    if ("fileData" in p) return { ok: false, reason: "file_data_not_allowed" };
    const inline = p.inlineData as { mimeType?: unknown; data?: unknown } | undefined;
    if (inline) {
      if (typeof inline.mimeType !== "string" || !inline.mimeType.startsWith("image/")) return { ok: false, reason: "non_image_media" };
      images++;
      inline.data = "";
    }
  }
  const textBytes = new TextEncoder().encode(JSON.stringify(stripped)).length;
  const imageTokens = IMAGE_TOKENS[String(gc.mediaResolution ?? "")] ?? IMAGE_TOKENS_DEFAULT;
  const p = maxPrice();
  const usdMicro = Math.ceil((textBytes + images * imageTokens) * p.inTok + maxOut * p.outTok);
  return { ok: true, textBytes, images, imageTokens, maxOut, usdMicro };
}
