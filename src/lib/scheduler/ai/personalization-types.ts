// GoKoreaMate / gokoreamate.com — AI Personalization Types
// TASK-014: AI Personalization Layer

import type { ScheduledDay } from "../types";

// ─── Alternative Place ────────────────────────────────────────────────────────

export interface AlternativePlace {
  place_id:  string;
  reason_ko: string;
  reason_en: string;
}

// ─── Place Explanation ────────────────────────────────────────────────────────

export interface PlaceExplanation {
  place_id:     string;
  reason_ko:    string;
  reason_en:    string;
  alternatives: AlternativePlace[];  // 0–2 items
}

// ─── Personalized Scheduled Day ───────────────────────────────────────────────
// Extends ScheduledDay, overriding ai_used and scheduler_version with AI values.

export interface PersonalizedScheduledDay
  extends Omit<ScheduledDay, "ai_used" | "scheduler_version"> {
  ai_used:           true;
  scheduler_version: "ai-personalized-v1";
  ai_model:          string;   // e.g. "gemini-2.5-flash" or "mock"
  explanations:      PlaceExplanation[];
}

// ─── Personalization Result (discriminated union) ─────────────────────────────

export type PersonalizationResult =
  | { kind: "personalized"; data: PersonalizedScheduledDay }
  | { kind: "fallback";     data: ScheduledDay; reason: string }
  | { kind: "conflict";     error: import("../types").ConflictError };

// ─── Gemini Raw API Response (minimal typing for native fetch) ─────────────────

export interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code:    number;
    message: string;
    status:  string;
  };
}
