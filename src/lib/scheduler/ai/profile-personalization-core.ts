// GoKoreaMate / gokoreamate.com — Trip Personalization Profile Core
//
// 여기 있는 것은 **Trip Scheduler 의 PersonalizationProfile** 을 만드는 조각들이다.
// 같은 폴더의 personalizer.ts 와 헷갈리지 말 것 — 그쪽은 장소 설명 문장을
// 만드는 다른 기능이고, 이 파일의 결과만 profileBias 로 흘러간다.
//
// 왜 route 에서 꺼냈나
//   prompt 와 파서가 Cloudflare route 파일 안에만 있었다. 돈이 나가는 경로의
//   핵심 두 조각인데 단위 테스트로 고정할 수 없었고, 로컬 harness 도 route 를
//   통째로 불러야 해서 런타임 차이에 걸렸다.
//
// 이 파일은 순수하다. 네트워크도 secret 도 없다 — provider 호출은 route 가
// 그대로 들고 있다. 옮기면서 한 글자도 바꾸지 않았다.

import {
  PROFILE_VERSION, PROFILE_CATEGORIES, TIME_PREFERENCES,
  MAX_PROFILE_PLACES, MAX_PLACE_NAME_CHARS,
} from "./personalization-profile.ts";

export interface PlaceHint { place_id: string; name?: string; category?: string }

export interface Body {
  city?:                string;
  locale?:              string;
  start_date?:          string;
  end_date?:            string;
  travel_style?:        string;
  travelers?:           string | number;
  pace?:                string;
  selected_place_ids?:  string[];
  liked_place_ids?:     string[];
  liked_places?:        PlaceHint[];
  interests?:           string[];
  selected_places?:     PlaceHint[];
  request_id?:          string;
}

const TIMEOUT_MS       = 8_000;
const MAX_OUTPUT_TOKENS = 700;
const MODEL            = "gemini-2.5-flash";   // 저장소에 이미 정의된 모델을 그대로 쓴다
const MAX_PROMPT_CHARS = 6_000;

/**
 * prompt 는 구조화된 최소 정보만 담는다.
 * 장소 원문 description·주소·좌표·가격은 보내지 않는다 — 모델이 사실을 지어낼
 * 재료를 주지 않고, 동시에 토큰도 아낀다.
 */
function buildPrompt(b: Body, places: PlaceHint[], liked: PlaceHint[] = []): string {
  const fmt = (p: PlaceHint) =>
    `- ${p.place_id} | ${(p.category ?? "unknown")} | ${(p.name ?? "").slice(0, MAX_PLACE_NAME_CHARS)}`;
  const lines = places.slice(0, MAX_PROFILE_PLACES).map(fmt);
  // Saved 는 취향 신호일 뿐이다. "반드시 방문" 이 아니라는 것을 구획으로 분리해 알린다.
  const likedLines = liked.slice(0, MAX_PROFILE_PLACES).map(fmt);

  const p = [
    "You infer a traveler preference profile. You do NOT create an itinerary.",
    "Return ONLY compact JSON. No markdown, no code fence, no prose.",
    "",
    `trip: city=${b.city ?? "?"} dates=${b.start_date ?? "?"}..${b.end_date ?? "?"}`,
    `party: style=${b.travel_style ?? "?"} travelers=${b.travelers ?? "?"} pace=${b.pace ?? "?"}`,
    b.interests?.length ? `interests: ${b.interests.slice(0, 12).join(", ")}` : "",
    "",
    "places the traveler already chose for THIS trip (id | category | name):",
    ...lines,
    likedLines.length ? "" : "",
    likedLines.length ? "places the traveler saved earlier — preference signal only, NOT required stops:" : "",
    ...likedLines,
    "",
    // ── Route Coherence Contract ──────────────────────────────────────────
    // 사람은 텔레포트하지 않는다. 거리·시간·지역 연속성은 서버 규칙 엔진의 책임이고,
    // 모델은 이미 갈 수 있는 후보들 사이에서 취향만 해석한다.
    "Your role:",
    "- You infer preferences. You are NOT the route planner.",
    "- The server rule engine decides real distance, travel time, zones, opening hours,",
    "  fixed events, arrival/departure, and every hard constraint. You cannot override it.",
    "- Preference never outranks route coherence.",
    "",
    "Route coherence you must respect:",
    "- Prefer places in the same or adjacent area on the same day.",
    "- Never push a route that backtracks to a far area already left behind.",
    "- Do not favour a distant place just because it fits taste slightly better.",
    "- If chosen places are far apart, they get spread across days — never dropped.",
    "- Filler places should stay near the day's existing route.",
    "- Saved and copied-trip preferences rank below route coherence.",
    "",
    "Rules:",
    `- category_weights keys must be from: ${PROFILE_CATEGORIES.join(", ")}; values 0..1`,
    `- time_preferences values must be from: ${TIME_PREFERENCES.join(", ")}`,
    "- preferred_place_ids MUST be a subset of the ids listed above",
    "- do NOT invent places, addresses, hours, prices, coordinates, or URLs",
    "- do NOT output any place_id that is not listed above",
    "- do NOT try to change fixed events, arrival, or departure",
    "",
    "JSON shape:",
    `{"profile_version":${PROFILE_VERSION},"category_weights":{},"preferred_place_ids":[],`
    + `"time_preferences":{},"pace_bias":0,"day_density_preference":"balanced",`
    + `"cluster_preference":"balanced","meal_preference":"flexible","preference_summary":""}`,
  ].filter(Boolean).join("\n");

  return p.slice(0, MAX_PROMPT_CHARS);
}

/**
 * Gemini Structured Output 스키마 — PersonalizationProfile 과 1:1 이다.
 *
 * 왜 필요한가
 *   지난번엔 프롬프트로 "JSON 만 내라" 라고 말만 했다. 모델은 HTTP 200 을 주면서도
 *   파싱 불가능한 25 토큰을 돌려줬다. 형식은 부탁이 아니라 계약이어야 한다.
 *
 * category_weights·time_preferences 는 자유 map 이지만 Gemini 스키마 방언은
 * 자유 map 을 표현하지 못한다. 그래서 허용 카테고리를 **그대로 펼쳐** 선언한다.
 * 느슨하게 푸는 것이 아니라 실제 enum 을 나열하는 것이다.
 *
 * 이 스키마를 통과해도 끝이 아니다. 서버 validateProfile 은 그대로 돈다 —
 * 후보 밖 place_id 는 provider 가 뭐라 하든 거기서 걸러진다.
 */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    profile_version:        { type: "INTEGER" },
    category_weights: {
      type: "OBJECT",
      properties: Object.fromEntries(PROFILE_CATEGORIES.map(c => [c, { type: "NUMBER" }])),
    },
    preferred_place_ids:    { type: "ARRAY", items: { type: "STRING" } },
    time_preferences: {
      type: "OBJECT",
      properties: Object.fromEntries(
        PROFILE_CATEGORIES.map(c => [c, { type: "STRING", enum: [...TIME_PREFERENCES] }]),
      ),
    },
    pace_bias:              { type: "NUMBER" },
    day_density_preference: { type: "STRING", enum: ["lighter", "balanced", "fuller"] },
    cluster_preference:     { type: "STRING", enum: ["tight", "balanced", "explore"] },
    meal_preference:        { type: "STRING", enum: [...TIME_PREFERENCES] },
    preference_summary:     { type: "STRING" },
  },
  required: [
    "profile_version", "category_weights", "preferred_place_ids", "time_preferences",
    "pace_bias", "day_density_preference", "cluster_preference", "meal_preference",
    "preference_summary",
  ],
  propertyOrdering: [
    "profile_version", "category_weights", "preferred_place_ids", "time_preferences",
    "pace_bias", "day_density_preference", "cluster_preference", "meal_preference",
    "preference_summary",
  ],
};

/** 모델 텍스트에서 JSON 만 끄집어낸다. code fence 는 벗겨내되 실패하면 버린다. */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch { /* ignore */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* ignore */ } }
  return null;
}

export {
  buildPrompt, extractJson, RESPONSE_SCHEMA,
  MODEL, TIMEOUT_MS, MAX_OUTPUT_TOKENS, MAX_PROMPT_CHARS,
};
