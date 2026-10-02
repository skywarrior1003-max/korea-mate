// 서울 Worker 가 V2 요청을 안전하게 처리할 수 있는가 (배포 순서 호환, 2026-10-02)
//
// V2 Pages 는 요청마다 예약액 머리글·긴 시간 상한(x-provider-timeout-ms)·큰 본문 상한(x-provider-max-bytes)을 보낸다.
// 배포 전 옛 Worker(Production e940970d)는 이것을 모르고 8초·64,000자 고정이라, 가져오기는 시간 초과(보낸 뒤 실패 = 과금 불확실),
// 전체 여행 글쓰기는 본문 거절로 끝난다. 그래서 V2 Pages 는 Worker /health 의 할 수 있는 일 표시를 먼저 보고,
// 없으면 **사용권·회사 예약 전에** "지금은 쓸 수 없어요" 로 끝낸다(모델 호출 0 · 차감 0 · 원장 0).
// /health 는 모델을 부르지 않는다(비용 0). 결과는 이 isolate 에서 60초 기억한다.
import { WORKER_CAPS_HEADER, WORKER_CAPS } from "../../src/lib/ai-cost/provider-bound";

interface Env { AI_WRITING?: { fetch: typeof fetch }; INTERNAL_KEY?: string }

let cache: { at: number; ok: boolean } | null = null;
const TTL_MS = 60_000;

export async function workerSupportsV2(env: Env, now: number = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < TTL_MS) return cache.ok;
  let ok = false;
  try {
    const b = env.AI_WRITING;
    if (b && typeof b.fetch === "function" && env.INTERNAL_KEY) {
      const r = await b.fetch("https://ai-writing.internal/health", { method: "POST", headers: { "x-internal-auth": env.INTERNAL_KEY } });
      ok = r.ok && (r.headers.get(WORKER_CAPS_HEADER) ?? "").split(",").map(s => s.trim()).includes(WORKER_CAPS);
    }
  } catch { ok = false; }
  cache = { at: now, ok };
  return ok;
}

/** 테스트 전용 */
export function _resetWorkerCaps(): void { cache = null; }
