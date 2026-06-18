// GoKoreaMate / gokoreamate.com — Gemini API Client (Personalization)
// TASK-014: AI Personalization Layer
// Policy: MAX_RETRIES=2 (per 2026-06-11 policy), structured logs, 10s timeout.
// Immediate fallback on 429/404/400/403; retry on 503.
// No new npm packages — native fetch only.

import type { GeminiApiResponse } from "./personalization-types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PERSONALIZATION_AI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${PERSONALIZATION_AI_MODEL}:generateContent`;
const MAX_ATTEMPTS    = 2;    // 1 initial + 1 retry on 503 (per 2026-06-11 policy)
const TIMEOUT_MS      = 10_000;
const MAX_OUTPUT_TOKENS = 2_048;

// ─── Mock / Live Mode ─────────────────────────────────────────────────────────
// Priority order (per 2026-06-10 policy + TASK-014 safety gate):
// 1. GEMINI_PERSONALIZATION_ENABLED != "true"  → Mock (safety gate)
// 2. FORCE_LIVE_API=true                       → Live (overrides mock flags)
// 3. MOCK_GEMINI=1 | HARNESS_SKIP_GEMINI=1     → Mock
// 4. NODE_ENV=development|test                 → Mock
// 5. default                                   → Live (production)

export function isMockPersonalizationMode(): boolean {
  if (process.env.GEMINI_PERSONALIZATION_ENABLED !== "true") return true;
  if (process.env.FORCE_LIVE_API === "true")                  return false;
  if (
    process.env.MOCK_GEMINI === "1" ||
    process.env.HARNESS_SKIP_GEMINI === "1"
  ) return true;
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) return true;
  return false;
}

// ─── Structured Logger ────────────────────────────────────────────────────────

function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

// ─── API Key Format Validation ────────────────────────────────────────────────

function warnIfKeyFormatSuspect(key: string): void {
  if (!key.startsWith("AIzaSy")) {
    log({
      level:  "WARN",
      action: "personalize-schedule",
      msg:    "GEMINI_API_KEY format may be invalid — expected 'AIzaSy...' prefix",
    });
  }
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─── Gemini Call ──────────────────────────────────────────────────────────────

export type GeminiCallResult =
  | { success: true;  text: string }
  | { success: false; reason: string };

export async function callGemini(
  prompt: string,
  requestId: string
): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";

  if (!apiKey) {
    log({ requestId, action: "personalize-schedule", status: "fallback", reason: "GEMINI_API_KEY not set" });
    return { success: false, reason: "GEMINI_API_KEY not configured" };
  }

  warnIfKeyFormatSuspect(apiKey);

  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log({
      requestId,
      action:             "personalize-schedule",
      model:              PERSONALIZATION_AI_MODEL,
      attempt,
      maxAttempts:        MAX_ATTEMPTS,
      promptLength:       prompt.length,
      mockMode:           false,
    });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens:  MAX_OUTPUT_TOKENS,
            temperature:      0.3,
            topP:             0.8,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const statusCode = res.status;
        log({ requestId, status: "error", errorCode: statusCode, attempt, mockMode: false });

        // Non-retriable errors — immediate fallback
        if ([400, 403, 404, 429].includes(statusCode)) {
          return { success: false, reason: `Gemini HTTP ${statusCode} — non-retriable` };
        }

        // 503: retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 1000);
          continue;
        }

        return { success: false, reason: `Gemini HTTP ${statusCode} after ${attempt} attempt(s)` };
      }

      const raw = (await res.json()) as GeminiApiResponse;
      const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      if (!text) {
        log({ requestId, status: "fallback", reason: "Empty Gemini response text" });
        return { success: false, reason: "Empty response text from Gemini" };
      }

      log({ requestId, status: "success", model: PERSONALIZATION_AI_MODEL });
      return { success: true, text };

    } catch (err) {
      clearTimeout(timeoutId);

      const isAbort = err instanceof Error && err.name === "AbortError";
      const reason  = isAbort
        ? `Gemini timeout after ${TIMEOUT_MS}ms`
        : String(err);

      log({ requestId, status: "error", errorMsg: reason, attempt, mockMode: false });

      if (isAbort || attempt >= MAX_ATTEMPTS) {
        return { success: false, reason };
      }

      await sleep(attempt * 1000);
    }
  }

  // Should not reach here — all paths return above
  return { success: false, reason: "Unexpected exit from retry loop" };
}
