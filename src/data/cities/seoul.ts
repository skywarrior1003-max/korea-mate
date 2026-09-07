import type { CityConfig } from "./types";

const seoulConfig: CityConfig = {
  slug: "seoul",
  name: "Seoul",
  nameKo: "서울",
  defaultCenter: { lat: 37.5665, lng: 126.9780 },
  seoDescription: "South Korea's capital blends ancient palaces with restless street life. Explore royal Gyeongbokgung, the centuries-old hanok lanes of Bukchon, Dongdaemun's 24-hour fashion district, and the neon-lit streets of Hongdae and Itaewon. Seoul is a city of constant reinvention that always has more to discover.",
  emoji: "🏙️",
  // SEOUL-PLANNER-PRODUCTION-V1: Owner 승인 활성화 — 기본 도착지 서울역 +
  // far-airport 규칙 QA 통과 후 열었다.
  planningReady: true,
  staticSpots: [],
};

export default seoulConfig;
