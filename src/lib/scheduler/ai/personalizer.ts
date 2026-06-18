// GoKoreaMate / gokoreamate.com — AI Personalizer (Orchestrator)
// TASK-014: AI Personalization Layer
// Pipeline: runScheduler → buildPrompt → callGemini → parseResponse → merge
// 3-tier fallback: Tier 1 (AI ok) → Tier 2 (parse fail) → Tier 3 (API fail)

import { runScheduler } from "../engine";
import type { SchedulerInput, ScheduledDay } from "../types";
import type {
  PersonalizationResult,
  PersonalizedScheduledDay,
  PlaceExplanation,
} from "./personalization-types";
import { buildPersonalizationPrompt } from "./prompt-builder";
import {
  isMockPersonalizationMode,
  callGemini,
  PERSONALIZATION_AI_MODEL,
} from "./gemini-client";
import { parseGeminiResponse } from "./response-parser";

// ─── Mock Personalizer ────────────────────────────────────────────────────────

function buildMockPersonalizedDay(day: ScheduledDay): PersonalizedScheduledDay {
  const explanations: PlaceExplanation[] = day.items
    .filter((it) => it.item_type === "place" && it.place_id)
    .map((it) => ({
      place_id:     it.place_id!,
      reason_ko:    "[Mock] 규칙 기반 최고 점수 후보로 선정되었습니다. Zone 연속성과 이동 시간을 고려한 최적 슬롯에 배치되었습니다.",
      reason_en:    "[Mock] Selected as the highest-scored rule-based candidate. Placed in the optimal time slot considering zone continuity and travel time.",
      alternatives: [],
    }));

  return {
    trip_date:         day.trip_date,
    items:             day.items,
    generated_at:      day.generated_at,
    ai_used:           true,
    scheduler_version: "ai-personalized-v1",
    ai_model:          "mock",
    explanations,
  };
}

// ─── Request ID Generator ─────────────────────────────────────────────────────

function makeRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function personalize(
  input: SchedulerInput
): Promise<PersonalizationResult> {
  // ── Step 1: Rule-based schedule (foundation, never skipped) ───────────────

  const schedulerResult = runScheduler(input);
  if (!schedulerResult.success) {
    return { kind: "conflict", error: schedulerResult.error };
  }
  const ruleBasedDay: ScheduledDay = schedulerResult.data;

  // ── Step 2: Mock mode ────────────────────────────────────────────────────

  if (isMockPersonalizationMode()) {
    return { kind: "personalized", data: buildMockPersonalizedDay(ruleBasedDay) };
  }

  // ── Step 3: Build Gemini prompt ──────────────────────────────────────────

  const prompt    = buildPersonalizationPrompt(ruleBasedDay, input);
  const requestId = makeRequestId();

  // ── Step 4: Call Gemini (Tier 3 fallback on API failure) ─────────────────

  const geminiResult = await callGemini(prompt, requestId);
  if (!geminiResult.success) {
    return { kind: "fallback", data: ruleBasedDay, reason: geminiResult.reason };
  }

  // ── Step 5: Parse response (Tier 2 fallback on parse failure) ────────────

  const explanations = parseGeminiResponse(geminiResult.text);
  if (explanations === null) {
    return {
      kind:   "fallback",
      data:   ruleBasedDay,
      reason: "Gemini response JSON parsing failed",
    };
  }

  // ── Step 6: Merge into PersonalizedScheduledDay (Tier 1 success) ─────────

  const personalized: PersonalizedScheduledDay = {
    trip_date:         ruleBasedDay.trip_date,
    items:             ruleBasedDay.items,
    generated_at:      ruleBasedDay.generated_at,
    ai_used:           true,
    scheduler_version: "ai-personalized-v1",
    ai_model:          PERSONALIZATION_AI_MODEL,
    explanations,
  };

  return { kind: "personalized", data: personalized };
}
