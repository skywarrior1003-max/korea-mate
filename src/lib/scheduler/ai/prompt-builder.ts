// GoKoreaMate / gokoreamate.com — Personalization Prompt Builder
// TASK-014: AI Personalization Layer
// Builds the single Gemini prompt from a completed ScheduledDay + SchedulerInput.
// v1: explanations are based on functional attributes (category, zone, score, timing).
// v2 enhancement: add place_name_hints map to SchedulerInput for richer descriptions.

import type { ScheduledDay } from "../types";
import type { SchedulerInput, NearMeCandidate } from "../types";

const SYSTEM_PROMPT = `You are GoKoreaMate's trip personalization AI for gokoreamate.com.
Your role is to explain rule-based scheduling decisions in natural, friendly language.
- Write reason_ko in Korean (2–3 sentences). Write reason_en in English (2–3 sentences).
- Base explanations on category fit, score rank, time slot, zone flow, and travel time.
- For alternatives, choose from unselected candidates with the same or adjacent category.
- Return ONLY valid JSON matching the schema exactly. No markdown, no extra text outside JSON.`;

interface PromptPlaceItem {
  place_id:                string;
  category:                string;
  start_time:              string;
  end_time:                string;
  stay_minutes:            number;
  travel_minutes_from_prev: number;
  zone_id:                 number | undefined;
  score:                   number | undefined;
}

interface PromptCandidate {
  place_id: string;
  category: string;
  zone_id:  number;
  score:    number;
}

export function buildPersonalizationPrompt(
  day: ScheduledDay,
  input: SchedulerInput
): string {
  const candidateMap = new Map<string, NearMeCandidate>(
    input.candidates.map((c) => [c.place_id, c])
  );

  // Only place items need AI explanations (events/affiliates excluded)
  const placedItems: PromptPlaceItem[] = day.items
    .filter((it) => it.item_type === "place" && it.place_id)
    .map((it) => ({
      place_id:                 it.place_id!,
      category:                 candidateMap.get(it.place_id!)?.category ?? "unknown",
      start_time:               it.start_time,
      end_time:                 it.end_time,
      stay_minutes:             it.stay_minutes,
      travel_minutes_from_prev: it.travel_minutes_from_prev,
      zone_id:                  it.zone_id,
      score:                    candidateMap.get(it.place_id!)?.score,
    }));

  // Remaining candidates (not placed) — available for alternatives
  const placedIds = new Set(placedItems.map((it) => it.place_id));
  const remainingCandidates: PromptCandidate[] = input.candidates
    .filter((c) => !placedIds.has(c.place_id))
    .map((c) => ({
      place_id: c.place_id,
      category: c.category,
      zone_id:  c.zone_id,
      score:    c.score,
    }));

  const paceLabelMap: Record<string, string> = {
    relaxed: "relaxed (×1.3 stay time)",
    normal:  "normal (×1.0 stay time)",
    packed:  "packed (×0.8 stay time)",
  };

  const userMessage = `Trip context:
- Date: ${day.trip_date}
- Day window: ${input.start_time} ~ ${input.end_time}
- Pace: ${paceLabelMap[input.pace] ?? input.pace}

Scheduled place items (${placedItems.length} items):
${JSON.stringify(placedItems, null, 2)}

Unselected candidates (${remainingCandidates.length} available for alternatives):
${JSON.stringify(remainingCandidates, null, 2)}

For each scheduled place, provide:
1. reason_ko: why this place was chosen (2–3 Korean sentences)
2. reason_en: why this place was chosen (2–3 English sentences)
3. alternatives: 0–2 items from unselected candidates (same or adjacent category)

Output schema:
{"explanations":[{"place_id":"string","reason_ko":"string","reason_en":"string","alternatives":[{"place_id":"string","reason_ko":"string","reason_en":"string"}]}]}`;

  // Combine system context into user message (some Gemini tiers require systemInstruction in body)
  return `${SYSTEM_PROMPT}\n\n${userMessage}`;
}

export { SYSTEM_PROMPT };
