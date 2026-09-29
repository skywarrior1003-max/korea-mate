// GET /api/health/content — City Hub 행사·Travel Essentials 주간 확인이 밀렸는지 (REGIONAL-CONTENT-FRESHNESS-V1)
//
// 행사·Essentials 데이터는 저장소 JSON 이라 빌드에 구워진다. 주간 확인을 건너뛰어도 사이트는
// 조용히 옛 정보를 보여 준다. 이 엔드포인트는 배포된 빌드에 들어 있는 확인 기록과 데이터로
// 200(정상) / 503(확인 필요)을 답한다 — 외부 가동 감시가 /api/health/retention 과 함께 호출한다.
// 응답에는 상태명·날짜·건수만 있다.

import freshness from "../../../src/data/regional/content-freshness-v1.json";
import places from "../../../src/data/regional/regional-places-v1.json";
import essentials from "../../../src/data/regional/regional-essentials-v1.json";

import { judgeContentHealth, type Check, type Place, type Essential } from "../../../src/lib/regional/content-health";

export async function onRequestGet(): Promise<Response> {
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const r = judgeContentHealth(
    freshness as { cadence_days: number; grace_days: number; checks: Check[] },
    (places as unknown as { places: Place[] }).places,
    (essentials as unknown as { essentials: Essential[] }).essentials,
    today,
  );
  return new Response(JSON.stringify(r), {
    status: r.ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
