// 여행 도시 키·표시 — 5개 서비스 도시 밖 여행(가져오기·내 장소)까지 같은 도시를 하나의 값으로 저장한다.
// (MYTRIP-FULL-TRIP-AI-WRITING-AND-ENTITLEMENT-CORRECTION §4 · 2026-09-30)
//
// 문제: 가져오기는 AI 가 원문에서 읽은 도시 이름을 그대로 저장했다 — 한국어 글은 "강릉", 영어 페이지는
// "gangneung". 같은 도시가 목록·필터·집계에서 둘로 갈리고, 한국어 화면에 "Gangneung" 이 보였다.
//
// 규칙
//  · 저장: tripCityKey() — 5개 도시는 기존 slug, 아래 표에 있는 도시는 로마자 key(예: "gangneung"),
//    표에 없으면 입력값 그대로(trim). 좌표·유사 문자열로 추정하지 않는다(fuzzy 0).
//  · 표시: tripCityLabel() — 5개 도시는 공식 표시명, 표의 도시는 언어별 공식 이름, 모르면 저장값 그대로.
//  · 기존 행은 고쳐 쓰지 않는다 — "강릉" 으로 저장된 행도 읽을 때 같은 key·같은 표시로 해석된다.
//  · 표는 공식 행정 명칭(시·군)만. 이름이 겹치는 곳(고성 2곳·광주 2곳, 바다 이름과 같은 동해·남해)은 넣지 않는다.
// import 의존성은 identity.ts 하나 — Functions 번들에도 그대로 쓴다.

import { resolveCitySlug, CITY_DISPLAY_NAMES, type CityLocale } from "./identity.ts";

type Names = Record<CityLocale, string>;
/** 5개 서비스 도시 밖의 시·군 — key = 로마자(개정 로마자 표기, 소문자) */
export const KR_OTHER_CITIES: Readonly<Record<string, Names>> = {
  incheon:    { ko: "인천", en: "Incheon", ja: "仁川", zh: "仁川" },
  daegu:      { ko: "대구", en: "Daegu", ja: "大邱", zh: "大邱" },
  daejeon:    { ko: "대전", en: "Daejeon", ja: "大田", zh: "大田" },
  ulsan:      { ko: "울산", en: "Ulsan", ja: "蔚山", zh: "蔚山" },
  sejong:     { ko: "세종", en: "Sejong", ja: "世宗", zh: "世宗" },
  suwon:      { ko: "수원", en: "Suwon", ja: "水原", zh: "水原" },
  paju:       { ko: "파주", en: "Paju", ja: "坡州", zh: "坡州" },
  gapyeong:   { ko: "가평", en: "Gapyeong", ja: "加平", zh: "加平" },
  yangpyeong: { ko: "양평", en: "Yangpyeong", ja: "楊平", zh: "杨平" },
  chuncheon:  { ko: "춘천", en: "Chuncheon", ja: "春川", zh: "春川" },
  gangneung:  { ko: "강릉", en: "Gangneung", ja: "江陵", zh: "江陵" },
  sokcho:     { ko: "속초", en: "Sokcho", ja: "束草", zh: "束草" },
  yangyang:   { ko: "양양", en: "Yangyang", ja: "襄陽", zh: "襄阳" },
  pyeongchang:{ ko: "평창", en: "Pyeongchang", ja: "平昌", zh: "平昌" },
  jeongseon:  { ko: "정선", en: "Jeongseon", ja: "旌善", zh: "旌善" },
  samcheok:   { ko: "삼척", en: "Samcheok", ja: "三陟", zh: "三陟" },
  wonju:      { ko: "원주", en: "Wonju", ja: "原州", zh: "原州" },
  cheongju:   { ko: "청주", en: "Cheongju", ja: "清州", zh: "清州" },
  chungju:    { ko: "충주", en: "Chungju", ja: "忠州", zh: "忠州" },
  danyang:    { ko: "단양", en: "Danyang", ja: "丹陽", zh: "丹阳" },
  gongju:     { ko: "공주", en: "Gongju", ja: "公州", zh: "公州" },
  buyeo:      { ko: "부여", en: "Buyeo", ja: "扶余", zh: "扶余" },
  boryeong:   { ko: "보령", en: "Boryeong", ja: "保寧", zh: "保宁" },
  taean:      { ko: "태안", en: "Taean", ja: "泰安", zh: "泰安" },
  cheonan:    { ko: "천안", en: "Cheonan", ja: "天安", zh: "天安" },
  andong:     { ko: "안동", en: "Andong", ja: "安東", zh: "安东" },
  pohang:     { ko: "포항", en: "Pohang", ja: "浦項", zh: "浦项" },
  ulleung:    { ko: "울릉", en: "Ulleung", ja: "鬱陵", zh: "郁陵" },
  changwon:   { ko: "창원", en: "Changwon", ja: "昌原", zh: "昌原" },
  tongyeong:  { ko: "통영", en: "Tongyeong", ja: "統営", zh: "统营" },
  geoje:      { ko: "거제", en: "Geoje", ja: "巨済", zh: "巨济" },
  jinju:      { ko: "진주", en: "Jinju", ja: "晋州", zh: "晋州" },
  gimhae:     { ko: "김해", en: "Gimhae", ja: "金海", zh: "金海" },
  yeosu:      { ko: "여수", en: "Yeosu", ja: "麗水", zh: "丽水" },
  suncheon:   { ko: "순천", en: "Suncheon", ja: "順天", zh: "顺天" },
  mokpo:      { ko: "목포", en: "Mokpo", ja: "木浦", zh: "木浦" },
  damyang:    { ko: "담양", en: "Damyang", ja: "潭陽", zh: "潭阳" },
  gunsan:     { ko: "군산", en: "Gunsan", ja: "群山", zh: "群山" },
  namwon:     { ko: "남원", en: "Namwon", ja: "南原", zh: "南原" },
};

// 행정 단위 접미사만 떼고 비교한다(강릉시 · Gangneung-si · Gangneung City · 江陵市)
const SUFFIX = /(\s*(특별시|광역시|특별자치시|시|군))$|(\s*-?\s*(si|gun|city|county))$|(\s*(市|郡))$/i;
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

const OTHER_ALIAS: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [key, names] of Object.entries(KR_OTHER_CITIES)) {
    m.set(key, key);
    for (const n of Object.values(names)) m.set(norm(n), key);
  }
  return m;
})();

/** 표에 있는 도시면 로마자 key, 아니면 null (5개 서비스 도시는 resolveCitySlug 가 먼저 처리) */
export function resolveOtherCityKey(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const v = norm(input);
  if (!v) return null;
  return OTHER_ALIAS.get(v) ?? OTHER_ALIAS.get(norm(v.replace(SUFFIX, ""))) ?? null;
}

/** 저장용 도시 값 — 5개 도시 slug › 표의 key › 입력값 그대로 */
export function tripCityKey(input: string | null | undefined): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  return resolveCitySlug(raw) ?? resolveCitySlug(raw.replace(SUFFIX, "")) ?? resolveOtherCityKey(raw) ?? raw;
}

/** 표시용 도시 이름 — 5개 도시 공식 표시명 › 표의 언어별 이름 › 저장값 그대로 */
export function tripCityLabel(input: string | null | undefined, locale: string): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  const loc = (["ko", "en", "ja", "zh"].includes(locale) ? locale : "en") as CityLocale;
  const slug = resolveCitySlug(raw) ?? resolveCitySlug(raw.replace(SUFFIX, ""));
  if (slug) return CITY_DISPLAY_NAMES[slug][loc];
  const other = resolveOtherCityKey(raw);
  return other ? KR_OTHER_CITIES[other][loc] : raw;
}
