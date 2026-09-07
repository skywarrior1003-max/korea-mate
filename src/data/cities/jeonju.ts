import type { CityConfig } from "./types";

const jeonjuConfig: CityConfig = {
  slug: "jeonju",
  name: "Jeonju",
  nameKo: "전주",
  defaultCenter: { lat: 35.8242, lng: 127.1480 },
  seoDescription: "Home to Korea's best-preserved hanok village and the birthplace of bibimbap. Explore cobblestone lanes lined with 600-year-old tile-roofed houses, traditional hanji paper craft shops, a legendary late-night street food market, and temple-stay retreats just outside the old city walls.",
  emoji: "🍲",
  // JEONJU-PLANNER-PRODUCTION-V1: Owner 승인 활성화 — 기본 도착지 전주역(기존 프리셋),
  // published 211곳·컴팩트 동선 readiness 실측 후 열었다.
  planningReady: true,
  staticSpots: [],
};

export default jeonjuConfig;
