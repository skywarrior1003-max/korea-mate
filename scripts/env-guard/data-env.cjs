// 데이터 환경 가드 — node 스크립트·next.config 용 CJS 사본
// (GOKOREAMATE-V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1)
//
// 원본 계약과 주석은 src/lib/env-guard/data-env-core.ts 를 본다.
// 이 파일에는 비밀을 넣지 않는다. Production ref 는 keepalive workflow 로 이미 공개.
// 두 사본의 동기화는 src/lib/env-guard/local-data-env-guard.test.ts 가 검사한다.
"use strict";

const fs = require("node:fs");

const PRODUCTION_SUPABASE_REF = "tfulaxxtorbxhlgupktc";

const BLOCK_MESSAGE =
  "Local development is blocked because the configured data environment is not verified as Staging or Local.";

/** url → "production" | "other" | "unknown" — 값을 오류·로그에 되돌려주지 않는다 */
function classifyDataEnv(url) {
  if (typeof url !== "string" || url.trim() === "") return "unknown";
  const m = url.trim().match(/^https:\/\/([a-z0-9]{16,24})\.supabase\.co\/?$/);
  if (!m) return "unknown";
  return m[1] === PRODUCTION_SUPABASE_REF ? "production" : "other";
}

/** Cloudflare Pages CI 빌드 판정 — Production/Preview CI 빌드만 가드를 지나친다 */
function isCloudflareCi(env) {
  return String(env.CF_PAGES ?? "") === "1";
}

/**
 * dotenv 파일에서 NEXT_PUBLIC_SUPABASE_URL 값만 읽는다(값은 반환만, 출력 금지).
 * 파일 부재·키 부재 → undefined (= classify "unknown" = fail-closed).
 */
function readEnvFileUrl(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  let url;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    if (t.slice(0, i).trim() === "NEXT_PUBLIC_SUPABASE_URL") url = t.slice(i + 1).trim();
  }
  return url;
}

/**
 * Local 실행 fail-closed 가드.
 *   · Cloudflare CI(CF_PAGES=1) → 통과(Production/Preview 빌드 계약)
 *   · 그 외(=Local): URL 이 "Production 아님이 확인된 Supabase" 가 아니면 throw
 * 오류 메시지에 URL·key·존재 여부를 넣지 않는다. source 는 검사 지점 이름만.
 */
function assertLocalDataEnv(env, opts) {
  if (isCloudflareCi(env)) return "ci";
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (classifyDataEnv(url) !== "other") {
    const where = opts && opts.source ? ` (checked: ${opts.source})` : "";
    throw new Error(`${BLOCK_MESSAGE}${where}`);
  }
  return "local-ok";
}

module.exports = {
  PRODUCTION_SUPABASE_REF,
  BLOCK_MESSAGE,
  classifyDataEnv,
  isCloudflareCi,
  readEnvFileUrl,
  assertLocalDataEnv,
};
