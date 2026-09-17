// canonical city slug resolver — 구현은 경량 shared identity 모듈로 이동했다
// (TRIP-CITY-CONTRACT-FINAL-CLOSEOUT-V1). 이 파일은 기존 import 경로 호환용
// 재수출이다. 표시명·별칭·정규화 규칙의 SSOT 는 ./identity.ts 하나뿐이며,
// 클라이언트와 Cloudflare Functions 가 같은 모듈을 쓴다(번역 번들 의존 0).
export { resolveCitySlug, cityLabelKey, CITY_DISPLAY_NAMES, CITY_SLUGS, type CitySlug, type CityLocale } from "./identity.ts";
