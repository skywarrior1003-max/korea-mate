// 빌드 전 환경 검증 (V2-ENVIRONMENT-ISOLATION-V1 §8) — 실패 시 non-zero 종료.
//
// 잘못된 환경 조합의 빌드를 산출물 생성 이전에 fail-closed 로 막는다.
// Cloudflare CI 값(CF_PAGES_BRANCH 등)은 **교차 검증에만** 쓴다 —
// 그것 하나로 환경을 추정하지 않는다(APP_ENV 가 SSOT).
// secret 값·URL 원문·ref 를 출력하지 않는다(고정 사유 문구만).
import { readFileSync } from "node:fs";

const PRODUCTION_SUPABASE_REF = "tfulaxxtorbxhlgupktc"; // 공개 ref(keepalive workflow) — 비밀 아님
const PRODUCTION_ORIGIN = "https://gokoreamate.com";
const STAGING_SUFFIX = ".korea-mate.pages.dev";
const APP_ENVS = ["development", "staging", "production"];

// CI 는 process.env 만, 로컬은 .env.local 로 보충(next build 가 스스로 읽는 값과 동일 원천)
function loadEnv() {
  const env = { ...process.env };
  if (String(env.CF_PAGES ?? "") !== "1") {
    try {
      for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0 && env[t.slice(0, i).trim()] === undefined) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    } catch { /* .env.local 부재는 아래 검증이 잡는다 */ }
  }
  return env;
}

const fails = [];
const fail = (msg) => fails.push(msg);
const env = loadEnv();

// ── APP_ENV (NODE_ENV 는 판정에 쓰지 않는다) ──
const appEnvRaw = (env.APP_ENV ?? "").trim().toLowerCase();
const appEnv = APP_ENVS.includes(appEnvRaw) ? appEnvRaw : null;
if (!appEnv) fail("APP_ENV must be one of development|staging|production (missing/unknown is never production)");

// ── NEXT_PUBLIC_APP_ENV 베이크 일치(클라이언트 판정의 무결성) ──
if (appEnv && (env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase() !== appEnv) {
  fail("NEXT_PUBLIC_APP_ENV must equal APP_ENV (client bake integrity)");
}

// ── site origin ──
const origin = (env.SITE_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL ?? "").trim();
let host = null;
try { host = origin ? new URL(origin).hostname.toLowerCase() : null; } catch { host = null; }
const isLocal = (h) => h === "localhost" || h === "127.0.0.1" || h?.endsWith(".localhost");
if (!host) fail("SITE_ORIGIN (or NEXT_PUBLIC_SITE_URL) must be a valid URL");
else if (appEnv === "production" && `https://${host}` !== PRODUCTION_ORIGIN) fail("production build requires the production site origin");
else if (appEnv === "staging" && !(host.endsWith(STAGING_SUFFIX) || host === STAGING_SUFFIX.slice(1) || isLocal(host))) fail("staging build requires a preview/staging origin");
else if (appEnv === "development" && !isLocal(host)) fail("development build requires a localhost origin");

// ── Supabase ref ──
const refOf = (u) => {
  const m = typeof u === "string" ? u.trim().match(/^https:\/\/([a-z0-9]{16,24})\.supabase\.co\/?$/) : null;
  return m ? m[1] : null;
};
const ref = refOf(env.NEXT_PUBLIC_SUPABASE_URL);
const expected = (env.EXPECTED_SUPABASE_PROJECT_REF ?? "").trim() || null;
if (!ref) fail("NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL");
else if (appEnv === "production") {
  if (ref !== PRODUCTION_SUPABASE_REF) fail("production build must use the production Supabase project");
  if (expected && expected !== ref) fail("EXPECTED_SUPABASE_PROJECT_REF mismatch for production");
} else if (appEnv === "staging") {
  if (ref === PRODUCTION_SUPABASE_REF) fail("staging build must not use the production Supabase project");
  if (!expected) fail("staging build requires EXPECTED_SUPABASE_PROJECT_REF");
  else if (expected !== ref) fail("staging Supabase project does not match EXPECTED_SUPABASE_PROJECT_REF");
} else if (appEnv === "development") {
  if (ref === PRODUCTION_SUPABASE_REF) fail("development build must not use the production Supabase project");
  if (expected && expected !== ref) fail("development Supabase project does not match EXPECTED_SUPABASE_PROJECT_REF");
}

// ── Cloudflare CI 교차 검증(존재할 때만·단독 추정 금지) ──
const cfBranch = (env.CF_PAGES_BRANCH ?? "").trim();
if (cfBranch) {
  if (cfBranch === "master" && appEnv !== "production") fail("Cloudflare production build (master) requires APP_ENV=production");
  if (cfBranch !== "master" && appEnv === "production") fail("Cloudflare preview build must not run with APP_ENV=production");
}

// ── 기능 mode: live 는 production 전용 ──
const mode = (v) => { const x = (v ?? "").trim().toLowerCase(); return x === "live" ? "live" : x === "test" ? "test" : "off"; };
for (const [name, value] of [["AI_MODE", env.AI_MODE], ["ANALYTICS_MODE", env.ANALYTICS_MODE], ["AFFILIATE_MODE", env.AFFILIATE_MODE], ["PAYMENT_MODE", env.PAYMENT_MODE]]) {
  if (mode(value) === "live" && appEnv !== "production") fail(`${name}=live is only allowed in production`);
}
// analytics 오염 방지: 비-production 에 Production GA id 가 실리려면 test 모드가 명시돼야 한다
if (appEnv !== "production" && (env.NEXT_PUBLIC_GA4_ID ?? "").trim() && mode(env.ANALYTICS_MODE) !== "test") {
  fail("non-production build must not carry an analytics measurement id unless ANALYTICS_MODE=test");
}

// ── 클라이언트 노출 변수의 secret 성격 금지 ──
for (const k of Object.keys(env)) {
  if (!k.startsWith("NEXT_PUBLIC_")) continue;
  if (/(ADMIN|SERVICE_ROLE|SECRET|PRIVATE|ACCESS_TOKEN|API_TOKEN)/.test(k.slice("NEXT_PUBLIC_".length))) {
    fail(`client-exposed variable name looks secret-bearing: ${k}`);
  }
}
// service role 값이 NEXT_PUBLIC 변수에 복사되는 사고 방지(값 비출력 비교)
const sr = env.SUPABASE_SERVICE_ROLE_KEY;
if (sr) {
  for (const k of Object.keys(env)) {
    if (k.startsWith("NEXT_PUBLIC_") && env[k] === sr) fail(`service role value must never be client-exposed (${k})`);
  }
}

if (fails.length > 0) {
  console.error("[verify-environment] BUILD BLOCKED:");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`[verify-environment] OK (APP_ENV=${appEnv})`);
