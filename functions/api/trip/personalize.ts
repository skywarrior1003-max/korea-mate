// Cloudflare Pages Function: POST /api/trip/personalize
//
// 여행 전체를 보고 개인화 프로필을 **한 번만** 만든다.
//
// 왜 여기인가
//   /api/trip/plan 은 하루 단위라 14일 여행이면 14번 호출된다. 거기에 AI 를
//   넣으면 provider 호출도 14번이 된다 — 과거 비용 사고가 정확히 그 모양이었다.
//   그래서 AI 는 이 엔드포인트에서 여행당 최대 1회만 부르고, 결과 프로필을
//   클라이언트가 각 날짜의 /api/trip/plan 에 얹어 보낸다.
//
// 이 엔드포인트는 일정을 만들지 않는다. 가중치만 만든다.
//
// 안전 계약
//   · 기본 모드 off. 모르는 값·미설정도 off. 켜는 방향으로 실수할 수 없다.
//   · 재시도 0. 400·401·403·404·408·429·5xx·network·timeout 전부 즉시 fallback.
//   · timeout 8초. 늦게 끝난 응답은 버린다.
//   · secret 은 ctx.env 에서 요청 시점에만 읽는다.
//   · 어떤 실패도 200 + null profile 로 돌려준다 — 일정 생성이 멈추면 안 된다.

import {
  resolveAiMode, modeAllowsProviderCall, validateProfile, buildMockProfile,
  PROFILE_VERSION, PROFILE_CATEGORIES, TIME_PREFERENCES,
  MAX_PROFILE_PLACES, MAX_PLACE_NAME_CHARS,
  type PersonalizationProfile, type AiStatus,
} from "../../../src/lib/scheduler/ai/personalization-profile";

interface Env {
  GEMINI_API_KEY?:           string;
  AI_PERSONALIZATION_MODE?:  string;
}

interface PlaceHint { place_id: string; name?: string; category?: string }

interface Body {
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

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const reply = (profile: PersonalizationProfile | null, ai_status: AiStatus) =>
  json({ profile, ai_status });

/** 로그에는 개인정보를 넣지 않는다. 식별은 짧은 해시로만 한다. */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "trip-personalize", ...fields }));
}

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
    "Rules:"
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

/** 모델 텍스트에서 JSON 만 끄집어낸다. code fence 는 벗겨내되 실패하면 버린다. */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch { /* ignore */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* ignore */ } }
  return null;
}

export async function onRequestPost(ctx: { request: Request; env: Env }): Promise<Response> {
  const mode = resolveAiMode(ctx.env.AI_PERSONALIZATION_MODE);

  let body: Body;
  try { body = (await ctx.request.json()) as Body; }
  catch { return reply(null, "fallback_invalid_response"); }

  const selected = Array.isArray(body.selected_place_ids) ? body.selected_place_ids.map(String) : [];
  const liked    = Array.isArray(body.liked_place_ids)    ? body.liked_place_ids.map(String)    : [];
  // 프로필이 가리킬 수 있는 장소는 사용자가 이미 고른 것뿐이다.
  const allowedIds = [...new Set([...selected, ...liked])].slice(0, MAX_PROFILE_PLACES);

  const requestId = body.request_id
    ? shortHash(String(body.request_id))
    : shortHash([body.city, body.start_date, body.end_date, ...selected].join("|"));

  // ── off: provider 를 부르지 않는다 ──
  if (mode === "off") {
    log({ requestId, mode, providerCalled: false, status: "disabled" });
    return reply(null, "disabled");
  }

  // ── mock: 실제 요청 0. 결정론적 fixture ──
  if (mode === "mock") {
    log({ requestId, mode, providerCalled: false, status: "mock" });
    return reply(buildMockProfile(allowedIds), "mock");
  }

  // ── live: key 가 없으면 부르지 않는다 ──
  const apiKey = ctx.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    log({ requestId, mode, providerCalled: false, status: "fallback_missing_key" });
    return reply(null, "fallback_missing_key");
  }
  if (!modeAllowsProviderCall(mode)) {
    log({ requestId, mode, providerCalled: false, status: "fallback_guard" });
    return reply(null, "fallback_guard");
  }

  const places: PlaceHint[] = Array.isArray(body.selected_places)
    ? body.selected_places.slice(0, MAX_PROFILE_PLACES)
    : allowedIds.map(id => ({ place_id: id }));

  const likedHints: PlaceHint[] = Array.isArray(body.liked_places)
    ? body.liked_places.slice(0, MAX_PROFILE_PLACES)
    : [];
  const prompt = buildPrompt(body, places, likedHints);
  const started = Date.now();

  // ── 실제 호출: 정확히 1회. 재시도 루프가 없다. ──
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.3 },
        }),
      },
    );
    clearTimeout(timer);
    const latency = Date.now() - started;

    if (!res.ok) {
      // 400·401·403·404·408·429·5xx 전부 여기로 온다. 재호출하지 않는다.
      log({ requestId, mode, providerCalled: true, attempts: 1, httpStatus: res.status,
            latency, status: "fallback_provider_error" });
      return reply(null, "fallback_provider_error");
    }

    const raw = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const profile = validateProfile(extractJson(text), allowedIds);

    log({ requestId, mode, providerCalled: true, attempts: 1, httpStatus: 200, latency,
          inputTokens:  raw.usageMetadata?.promptTokenCount     ?? "unknown",
          outputTokens: raw.usageMetadata?.candidatesTokenCount ?? "unknown",
          status: profile ? "applied" : "fallback_invalid_response" });

    return profile ? reply(profile, "applied") : reply(null, "fallback_invalid_response");

  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    // timeout·network 모두 재호출하지 않는다. 늦게 오는 응답도 버린다.
    log({ requestId, mode, providerCalled: true, attempts: 1,
          latency: Date.now() - started, timedOut: isAbort,
          status: isAbort ? "fallback_timeout" : "fallback_provider_error" });
    return reply(null, isAbort ? "fallback_timeout" : "fallback_provider_error");
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
