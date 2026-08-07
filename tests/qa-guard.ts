// 자동 QA 가 운영 데이터를 건드리지 못하게 막는 이중 방어.
//
// 왜 필요했나
//   로컬 `wrangler pages dev` 는 .dev.vars 의 **운영 Supabase 자격증명**을 그대로 쓴다.
//   그래서 QA 브라우저가 저장 API 를 부르면 운영 DB 에 진짜로 기록된다.
//   실제로 그렇게 QA 일정 14건이 운영에 저장됐다. 원인은 Playwright route 패턴이
//   `**/api/itinerary/**` 였다는 것 — 자동 저장은 하위 경로가 없는 `/api/itinerary`
//   (단수 root)로 나가서 매칭되지 않았다.
//
// 그래서 두 겹으로 막는다.
//   Guard A  운영 자격증명을 가진 자동 QA 는 **시작 전에** 실패시킨다.
//            route 패턴을 실수해도 write 자체가 일어날 수 없다.
//   Guard B  그래도 QA 가 도는 경우를 대비해 write method 를 경로가 아니라
//            **method + pathname** 으로 차단한다. glob 하나에 의존하지 않는다.
//
// 이 파일은 테스트 하네스 전용이다. Production runtime 에는 절대 적용하지 않는다 —
// 일반 사용자의 저장 기능을 막으면 안 된다.

/** 운영 Supabase project ref. 이 값이 보이면 자동 QA 를 시작하지 않는다. */
export const PRODUCTION_SUPABASE_REF = "tfulaxxtorbxhlgupktc";

/** 자동 QA 에서 절대 나가면 안 되는 method */
export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * 자동 QA 환경인가.
 * Playwright·CI·명시 플래그 중 하나라도 있으면 자동 QA 로 본다.
 * 사람이 직접 띄우는 로컬 개발은 여기에 걸리지 않는다.
 */
export function isAutomatedQa(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.PLAYWRIGHT_TEST_BASE_URL || env.PW_TEST || env.PLAYWRIGHT ||
    env.CI || env.GOKOREAMATE_QA === "1",
  );
}

/**
 * 주어진 문자열들 중 운영 backend 를 가리키는 것이 있는가.
 * URL·키·설정 문자열 어디에 들어 있든 잡는다.
 */
export function pointsAtProductionBackend(values: readonly (string | undefined)[]): boolean {
  return values.some(v => typeof v === "string" && v.includes(PRODUCTION_SUPABASE_REF));
}

/**
 * QA 가 write 를 안전하게 막고 있다고 보증되는가.
 * 명시적으로 선언한 경우에만 true — 기본은 "보증되지 않음" 이다.
 * 안전한 방향으로 실수하게 만든다.
 */
export function writeMockGuaranteed(env: Record<string, string | undefined>): boolean {
  return env.QA_WRITE_MOCK_GUARANTEED === "1";
}

export interface GuardDecision {
  shouldFail: boolean;
  reason: string;
}

/**
 * Guard A 판정.
 *
 * 자동 QA + 운영 backend + write 차단 미보증  →  실패.
 * 셋 중 하나라도 아니면 통과한다. 특히 **Production runtime 은 자동 QA 가 아니므로
 * 절대 걸리지 않는다** — 일반 사용자 저장은 그대로 동작해야 한다.
 */
export function evaluateQaBackendGuard(
  env: Record<string, string | undefined>,
  values: readonly (string | undefined)[],
): GuardDecision {
  if (!isAutomatedQa(env)) {
    return { shouldFail: false, reason: "not-automated-qa" };
  }
  if (!pointsAtProductionBackend(values)) {
    return { shouldFail: false, reason: "non-production-backend" };
  }
  if (writeMockGuaranteed(env)) {
    return { shouldFail: false, reason: "write-mock-guaranteed" };
  }
  return {
    shouldFail: true,
    reason:
      "자동 QA 가 운영 Supabase 를 가리키고 있고 write 차단이 보증되지 않았다. " +
      "QA 전용 backend 를 쓰거나, write 를 확실히 mock 한 뒤 QA_WRITE_MOCK_GUARANTEED=1 로 선언하라.",
  };
}

/**
 * Guard A 실행. 위반이면 던진다 — 테스트가 시작되기 전에 멈춘다.
 * secret 값은 절대 출력하지 않는다(길이·앞자리 포함).
 */
export function assertQaNotUsingProductionWriteBackend(
  env: Record<string, string | undefined> = process.env,
  values: readonly (string | undefined)[] = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_URL,
    env.QA_SUPABASE_URL,
  ],
): void {
  const d = evaluateQaBackendGuard(env, values);
  if (d.shouldFail) throw new Error("[QA GUARD] " + d.reason);
}

// ── Guard B — write 요청 차단 ────────────────────────────────────────────────

/** 자동 QA 에서 운영 데이터를 바꿀 수 있는 경로들 */
export const WRITE_GUARDED_PATHS = [
  "/api/itinerary",        // ← 사고의 원인. 하위 경로가 없는 root 저장 경로다.
  "/api/itineraries",
  "/api/trip-moments",
  "/api/user-spots",
  "/api/spots/reactions",
] as const;

/**
 * 이 요청을 막아야 하는가 — glob 이 아니라 method + pathname 으로 판단한다.
 * root(`/api/itinerary`)와 하위(`/api/itinerary/abc`)를 **둘 다** 잡는다.
 * GET·HEAD 등 읽기는 통과시킨다.
 */
export function shouldBlockQaRequest(method: string, url: string): boolean {
  if (!(WRITE_METHODS as readonly string[]).includes(method.toUpperCase())) return false;
  let path: string;
  try { path = new URL(url).pathname; } catch { return false; }
  return WRITE_GUARDED_PATHS.some(p => path === p || path.startsWith(p + "/"));
}
