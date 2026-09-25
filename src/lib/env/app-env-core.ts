// 애플리케이션 환경 SSOT — 순수 판정 로직 (V2-ENVIRONMENT-ISOLATION-V1 §3·§7)
//
// 환경은 정확히 셋: development · staging · production.
// `NODE_ENV` 는 최적화 빌드 신호일 뿐 환경 판정에 절대 쓰지 않는다
// (Cloudflare Preview 도 NODE_ENV=production 이다).
//
// 이 모듈은 클라이언트 번들에 들어갈 수 있다 — secret·project ref 상수를 두지
// 않는다(ref 는 호출부가 인자로 준다). Production Supabase ref 상수는 서버·빌드
// 전용 모듈(functions/_lib/app-env.ts, scripts/verify-environment.mjs)에만 있다.

export type AppEnvironment = "development" | "staging" | "production";

export const APP_ENVIRONMENTS: readonly AppEnvironment[] = ["development", "staging", "production"];

/** 공개 Production origin — 비밀 아님 */
export const PRODUCTION_ORIGIN = "https://gokoreamate.com";
/** Preview/Staging origin 계열 — 비밀 아님(Cloudflare Pages 프로젝트 도메인) */
export const STAGING_ORIGIN_SUFFIX = ".korea-mate.pages.dev";

/**
 * APP_ENV 파싱. 누락·오타는 null — **절대 production 으로 추정하지 않는다**.
 * NODE_ENV 는 입력조차 받지 않는다.
 */
export function parseAppEnv(raw: unknown): AppEnvironment | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return (APP_ENVIRONMENTS as readonly string[]).includes(v) ? (v as AppEnvironment) : null;
}

export type FeatureMode = "off" | "test" | "live";

/** 기능 mode 파싱 — 누락·오타는 off(fail-closed) */
export function parseMode(raw: unknown): FeatureMode {
  if (typeof raw !== "string") return "off";
  const v = raw.trim().toLowerCase();
  return v === "live" ? "live" : v === "test" ? "test" : "off";
}

/** live 는 production 전용, test 는 비-production 전용, off 는 어디서나 */
export function modeAllowed(env: AppEnvironment, mode: FeatureMode): boolean {
  if (mode === "off") return true;
  if (mode === "live") return env === "production";
  return env !== "production"; // test
}

function hostnameOf(origin: string): string | null {
  try { return new URL(origin).hostname.toLowerCase(); } catch { return null; }
}

function isLocalHost(h: string): boolean {
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "0.0.0.0" || h.endsWith(".localhost");
}

/** site origin 이 환경에 허용되는가 */
export function originAllowed(env: AppEnvironment, origin: string): boolean {
  const h = hostnameOf(origin);
  if (!h) return false;
  if (env === "production") return `https://${h}` === PRODUCTION_ORIGIN;
  if (env === "staging") return h.endsWith(STAGING_ORIGIN_SUFFIX) || h === STAGING_ORIGIN_SUFFIX.slice(1) || isLocalHost(h);
  return isLocalHost(h); // development
}

/** Supabase URL 에서 project ref 추출(비밀 아님) — 형식이 아니면 null */
export function refFromSupabaseUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = url.trim().match(/^https:\/\/([a-z0-9]{16,24})\.supabase\.co\/?$/);
  return m ? m[1] : null;
}

export interface SupabaseRefPolicy {
  /** 공개된 Production project ref (서버·빌드 모듈이 주입) */
  productionRef: string;
  /** 이 배포가 기대하는 ref (EXPECTED_SUPABASE_PROJECT_REF) — staging 은 필수 */
  expectedRef?: string | null;
}

/**
 * 환경별 Supabase ref 허용 판정.
 *  · ref 판독 불가 → 거부(fail-closed)
 *  · production: production ref 만(expected 가 있으면 그것과도 일치)
 *  · staging: production ref 금지 + expected 필수·일치
 *  · development: production ref 금지(expected 가 있으면 일치까지)
 */
export function supabaseRefAllowed(
  env: AppEnvironment, ref: string | null, policy: SupabaseRefPolicy,
): boolean {
  if (!ref) return false;
  const expected = policy.expectedRef?.trim() || null;
  if (env === "production") {
    return ref === policy.productionRef && (expected === null || expected === ref);
  }
  if (ref === policy.productionRef) return false;
  if (env === "staging") return expected !== null && ref === expected;
  return expected === null || ref === expected; // development
}

/** public/server Supabase URL 의 ref 일치(Storage 는 같은 project 를 쓴다) */
export function refsConsistent(publicUrl: unknown, serverUrl: unknown): boolean {
  const a = refFromSupabaseUrl(publicUrl);
  const b = serverUrl === undefined || serverUrl === null || serverUrl === ""
    ? a // 별도 server URL 변수가 없는 구조(현행)면 public 이 곧 server
    : refFromSupabaseUrl(serverUrl);
  return a !== null && a === b;
}
