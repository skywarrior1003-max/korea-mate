// 실제 provider 를 부르는 스크립트의 **안전 계약**. 순수 값과 순수 함수뿐이다.
//
// 스크립트 본체(scripts/ai-personalization-live-smoke.ts)에서 분리한 이유
//   본체는 배포 handler 를 import 하므로 단독으로 로드할 수 없다.
//   그러면 상한과 확인 토큰을 테스트로 고정할 수 없다.
//   돈이 나가는 경로의 상한은 반드시 테스트로 못 박아야 한다.

/** provider 호출 코드 상한. CLI 로 늘릴 수 없다. */
export const MAX_PROVIDER_CALLS = 3;

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
