// 실제 provider 를 부르는 스크립트의 **안전 계약**. 순수 값과 순수 함수뿐이다.
//
// 스크립트 본체(scripts/ai-personalization-live-smoke.ts)에서 분리한 이유
//   본체는 배포 handler 를 import 하므로 단독으로 로드할 수 없다.
//   그러면 상한과 확인 토큰을 테스트로 고정할 수 없다.
//   돈이 나가는 경로의 상한은 반드시 테스트로 못 박아야 한다.

/**
 * provider 호출 코드 상한. CLI 로 늘릴 수 없다.
 *
 * 예전에는 3 이었다. 시나리오를 여러 개 돌려 보려던 값인데, 실제 호출은
 * 한 번에 하나만 보는 편이 낫다 — 무엇이 어떻게 나왔는지 섞이지 않고,
 * 실수로 돌렸을 때 나가는 돈도 최소가 된다.
 */
export const MAX_PROVIDER_CALLS = 1;

/** 실제 호출에 필요한 확인 토큰. --live 만으로는 부족하다. */
export const CONFIRM_TOKEN = "GEMINI-STAGING-LIVE-3";

/** 이 프로세스에만 주는 모드. Production Cloudflare env 는 그대로다. */
export const LIVE_MODE = "staging-live";

/** --live 와 confirm 토큰이 **둘 다** 있어야 부른다. */
export function isLiveAuthorized(argv: readonly string[]): boolean {
  return argv.includes("--live") && argv.includes(`--confirm=${CONFIRM_TOKEN}`);
}

/** 시나리오가 몇 개든 상한을 넘지 못한다. */
export function boundedScenarios<T>(all: readonly T[]): T[] {
  return all.slice(0, MAX_PROVIDER_CALLS);
}

/** `--only=<name>` 을 읽는다. 없으면 null. */
export function readOnlyFlag(argv: readonly string[]): string | null {
  for (const a of argv) {
    if (a.startsWith("--only=")) {
      const v = a.slice("--only=".length).trim();
      if (v) return v;
    }
  }
  return null;
}

/**
 * 실제로 부를 시나리오 하나를 고른다.
 *
 * live 에서는 `--only` 가 **필수**다. 목록의 첫 번째를 알아서 고르지 않는다 —
 * 돈이 나가는 호출의 대상을 도구가 대신 정하면 안 된다.
 */
export function selectLiveScenario<T extends { name: string }>(
  argv: readonly string[],
  all:  readonly T[],
): { ok: true; scenario: T } | { ok: false; reason: "only_required" | "unknown_scenario" } {
  const only = readOnlyFlag(argv);
  if (!only) return { ok: false, reason: "only_required" };
  const hit = all.find(s => s.name === only);
  if (!hit) return { ok: false, reason: "unknown_scenario" };
  return { ok: true, scenario: hit };
}
