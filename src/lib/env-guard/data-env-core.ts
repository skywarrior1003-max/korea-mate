// 데이터 환경 판정 코어 (GOKOREAMATE-V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1)
//
// 역할 계약:
//   · Production Cloudflare Pages  → Production Supabase (유일하게 허용)
//   · Cloudflare Preview           → Staging Supabase
//   · Local(next dev / pages dev)  → Staging 또는 완전히 격리된 Local Supabase
//
// 이 파일에는 비밀을 넣지 않는다. Production project ref 는 비밀이 아니다 —
// .github/workflows/supabase-keepalive.yml 로 이미 공개 저장소에 존재한다.
// API key·service role·Secret 파생값(길이·해시 포함)은 어떤 형태로도 금지.
//
// Staging ref 는 공개된 적이 없으므로 코드에 넣지 않는다. 따라서 판정은
// "Production 인가 / 아닌가 / 판정 불가인가" 3값이고, Local 은 "Production 아님이
// 확인된 Supabase URL"만 허용한다(판정 불가 = fail-closed).
//
// 동일 로직의 CJS 사본: scripts/env-guard/data-env.cjs (node 스크립트·next.config 용).
// 두 사본의 동기화는 src/lib/env-guard/local-data-env-guard.test.ts 가 검사한다.

export const PRODUCTION_SUPABASE_REF = "tfulaxxtorbxhlgupktc";

export const BLOCK_MESSAGE =
  "Local development is blocked because the configured data environment is not verified as Staging or Local.";

export type DataEnvClass = "production" | "other" | "unknown";

/** Supabase URL 을 3값으로 분류한다. 값을 로그·오류에 되돌려주지 않는다. */
export function classifyDataEnv(url: unknown): DataEnvClass {
  if (typeof url !== "string" || url.trim() === "") return "unknown";
  const m = url.trim().match(/^https:\/\/([a-z0-9]{16,24})\.supabase\.co\/?$/);
  if (!m) return "unknown";
  return m[1] === PRODUCTION_SUPABASE_REF ? "production" : "other";
}

/** wrangler pages dev 등 로컬 서빙 호스트 판정. 배포 host(*.pages.dev·gokoreamate.com)는 false */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost")
  );
}
