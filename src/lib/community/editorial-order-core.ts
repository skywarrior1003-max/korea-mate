// cold-start editorial 순서 코어 (COLD-START-RANKING-POLICY-V1 §2-2 tie-break ④)
//
// 왜 스냅숏 JSON 인가
//   원천은 regional-recommendations(hubEditorialSpotOrder + regional-places 의
//   canonical 연결 순서)다. 그 모듈은 `with { type: "json" }` import attribute 를
//   쓰는데, Cloudflare Pages CI 의 Functions 번들러(wrangler 3.x esbuild)가 이
//   구문을 파싱하지 못해 배포가 깨진다(2026-09-24 preview build failure 실측).
//   그래서 Functions 가 쓰는 순서를 TS 상수 스냅숏(editorial-spot-order.ts)으로
//   분리했다(JSON import 는 Node 테스트 러너와 attribute 요구가 충돌한다).
//   원천과의 동기화는 ranking-ux-guard.test.ts 의 sync 테스트가 지킨다 —
//   regional-places 를 고치면 스냅숏도 함께 재생성해야 테스트가 통과한다.
//
// 순서 규칙(생성기·sync 테스트와 동일):
//   ① HUB_EDITORIAL_ORDER(Owner 확정 Hub 순서) 먼저
//   ② regional-places-v1.json 의 파일 순서대로 spotId → spotIdsAll (dedupe)
//   ③ 유효기간(validTo)은 무시한다 — 순위 tie-break 는 날짜에 흔들리지 않는
//      고정 기준이어야 한다(한시 추천 노출 여부는 별개 화면 로직).
import { EDITORIAL_SPOT_ORDER } from "../../data/regional/editorial-spot-order.ts";

const ORDER = EDITORIAL_SPOT_ORDER;

/** 도시의 editorial 추천 순서(city_spot id, 순서 보존). 미정의 도시는 빈 배열 */
export function editorialSpotOrder(city: string): number[] {
  return ORDER[city.toLowerCase()] ?? [];
}
