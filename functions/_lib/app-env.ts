// 서버 전용 환경 가드 (V2-ENVIRONMENT-ISOLATION-V1 §7·§9·§10)
//
// Functions/API 가 DB·Storage·AI provider 에 닿기 **전에** 환경 일치를 검증한다.
// 이 모듈은 서버 번들(Pages Functions)에만 들어간다 — 클라이언트 import 금지
// (out/ 정적 번들에 이 파일 문자열이 없음을 테스트가 감시한다: APP_ENV_SERVER_ONLY_MARKER).
//
// Production Supabase ref 는 비밀이 아니다(.github/workflows/supabase-keepalive.yml
// 로 이미 공개). key·service role·secret 파생값은 이 파일에 없다.
// 오류 응답은 내부 설정을 드러내지 않는 일반 503 이다.

import {
  parseAppEnv, parseMode, refFromSupabaseUrl, supabaseRefAllowed,
  PRODUCTION_ORIGIN, STAGING_ORIGIN_SUFFIX, type AppEnvironment,
} from "../../src/lib/env/app-env-core.ts";

export const APP_ENV_SERVER_ONLY_MARKER = "gkm-server-env-guard-v1" as const;

export const PRODUCTION_SUPABASE_REF = "tfulaxxtorbxhlgupktc";

export interface ServerEnvVars {
  APP_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  EXPECTED_SUPABASE_PROJECT_REF?: string;
  AI_MODE?: string;
  GEMINI_API_KEY?: string;
}

function safe503(): Response {
  // 사용자에게 환경 상세·ref·URL 을 보여주지 않는다
  return new Response(JSON.stringify({ error: "service_unavailable" }), {
    status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function hostAllowed(env: AppEnvironment, hostname: string): boolean {
  const h = hostname.toLowerCase();
  const local = h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "0.0.0.0" || h.endsWith(".localhost");
  if (env === "production") return `https://${h}` === PRODUCTION_ORIGIN || h.endsWith(STAGING_ORIGIN_SUFFIX);
  if (env === "staging") return h.endsWith(STAGING_ORIGIN_SUFFIX) || local;
  return local || h.endsWith(STAGING_ORIGIN_SUFFIX); // development(로컬 wrangler·터널)
}

/**
 * 환경 일치 판정. null = 통과, Response = 안전한 503(fail-closed).
 *  · APP_ENV 누락·오타 → 차단(production 추정 금지)
 *  · DB ref 가 환경 정책과 어긋나면 → 차단(DB query 이전)
 *  · Production 도메인인데 APP_ENV≠production → 차단(교차 검증)
 */
export function envGate(env: ServerEnvVars, requestUrl: string): Response | null {
  const appEnv = parseAppEnv(env.APP_ENV);
  if (!appEnv) return safe503();

  const ref = refFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const ok = supabaseRefAllowed(appEnv, ref, {
    productionRef: PRODUCTION_SUPABASE_REF,
    expectedRef: env.EXPECTED_SUPABASE_PROJECT_REF ?? null,
  });
  if (!ok) return safe503();

  let hostname = "";
  try { hostname = new URL(requestUrl).hostname; } catch { return safe503(); }
  if (!hostAllowed(appEnv, hostname)) return safe503();
  // Production 실도메인은 반드시 APP_ENV=production 이어야 한다
  if (`https://${hostname.toLowerCase()}` === PRODUCTION_ORIGIN && appEnv !== "production") return safe503();

  return null;
}

/**
 * AI 허용 판정(§10) — provider 호출 이전에 부른다.
 *  · production: AI_MODE=live 에서만 허용(누락→off)
 *  · staging/development: AI_MODE=test + 이 환경에 키가 실재할 때만 허용
 *  · 그 외 전부 차단 — Production key fallback 없음(다른 키를 참조하지 않는다)
 */
export function aiAllowed(env: ServerEnvVars): boolean {
  const appEnv = parseAppEnv(env.APP_ENV);
  if (!appEnv) return false;
  const mode = parseMode(env.AI_MODE);
  if (appEnv === "production") return mode === "live";
  return mode === "test" && typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.length > 0;
}

/** 비허용 환경의 AI 요청 응답 — provider·DB 접근 없이 즉시 반환 */
export function aiUnavailableResponse(): Response {
  return new Response(JSON.stringify({ error: "ai_unavailable_in_this_environment" }), {
    status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
