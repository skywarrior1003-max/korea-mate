// cold-start editorial 순서 스냅숏 (COLD-START-V1 → PAGINATION-V1 에서 TS 상수화)
//
// 원천: regional-recommendations 의 HUB_EDITORIAL_ORDER + regional-places-v1.json
// 파일 순서의 canonical 연결(spotId → spotIdsAll, dedupe, validTo 무시).
// JSON 파일이 아니라 TS 상수인 이유: CF CI Functions 번들러(구형 esbuild)는
// `with { type: "json" }` 을 못 읽고, Node(테스트 러너)는 attribute 없는 JSON
// import 를 거부한다 — TS 상수는 모든 런타임에서 동일하게 동작한다.
// 원천과의 동기화는 ranking-ux-guard.test.ts 의 sync 테스트가 강제한다:
// regional-places 를 고치면 이 스냅숏도 함께 재생성해야 테스트가 통과한다.

export const EDITORIAL_SPOT_ORDER: Record<string, number[]> = {
  busan: [1081],
  seoul: [3228, 3593],
  jeju: [2906, 2606, 2171, 1878, 2715, 2877, 1893],
  gyeongju: [439, 425, 507, 506],
  jeonju: [743, 1098, 729, 749, 1109],
};
