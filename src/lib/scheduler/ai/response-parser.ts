// GoKoreaMate / gokoreamate.com — Gemini Response Parser
// TASK-014: AI Personalization Layer
// Manual type guards only — no Zod or external validation libraries.
// Returns null on any parsing or validation failure (triggers Tier 2 fallback).

import type { PlaceExplanation, AlternativePlace } from "./personalization-types";

// ─── Type Guards ──────────────────────────────────────────────────────────────

function isAlternativePlace(obj: unknown): obj is AlternativePlace {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.place_id  === "string" &&
    typeof o.reason_ko === "string" &&
    typeof o.reason_en === "string"
  );
}

function isPlaceExplanation(obj: unknown): obj is PlaceExplanation {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.place_id       === "string" &&
    typeof o.reason_ko      === "string" &&
    typeof o.reason_en      === "string" &&
    Array.isArray(o.alternatives) &&
    (o.alternatives as unknown[]).every(isAlternativePlace)
  );
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseGeminiResponse(text: string): PlaceExplanation[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    console.log(
      JSON.stringify({
        ts:     new Date().toISOString(),
        action: "personalize-schedule",
        status: "parse-error",
        reason: "JSON.parse failed",
        preview: text.slice(0, 200),
      })
    );
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const root = parsed as Record<string, unknown>;
  const explanations = root.explanations;

  if (!Array.isArray(explanations)) {
    console.log(
      JSON.stringify({
        ts:     new Date().toISOString(),
        action: "personalize-schedule",
        status: "parse-error",
        reason: "Missing or non-array 'explanations' key",
      })
    );
    return null;
  }

  const valid = explanations.filter(isPlaceExplanation);

  if (valid.length === 0 && explanations.length > 0) {
    console.log(
      JSON.stringify({
        ts:     new Date().toISOString(),
        action: "personalize-schedule",
        status: "parse-error",
        reason: "All explanation items failed type guard",
      })
    );
    return null;
  }

  return valid;
}
