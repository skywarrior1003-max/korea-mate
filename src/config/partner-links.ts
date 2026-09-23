// PHASE 10 — Owner 승인 파트너 링크 빌더 + 활성 매트릭스 (2026-09-13)
//
// 근거 문서: docs/product/gokoreamate-phase10-partner-e2e-readiness-v1.md (v2).
// 원칙:
//  · Owner 가 대시보드에서 생성한 원본 링크의 **파라미터 규격만** 일반화한다.
//    도시 ID·언어 코드·도메인·상품 ID 는 검증분 외 추측하지 않는다 — 표에
//    없는 조합은 null 이고, null 은 화면에서 렌더 자체가 없다.
//  · 조립은 전부 URL/URLSearchParams API — 문자열 이어붙이기로 인코딩을
//    깨뜨리지 않는다. Klook k_site 는 "완성된 목적지 URL 을 통째로 한 번
//    인코딩" 구조(원본 실측)라 URLSearchParams 가 그 한 번을 담당한다.
//  · 구세대 자산(구 AID 41-763 · affiliate.klook.com/sl/* · redirect+aff_adid)은
//    이 모듈이 절대 생성하지 않으며, 활성 매트릭스 전체에 대해 테스트로
//    차단을 고정한다. Klook 은 V4(2026-09-14)부터 직접 `?aid=` 부착이 공식.
//  · 활성(ACTIVE) = 실브라우저 착지 검증을 통과한 조합만. 확인 막힌 조합은
//    OFF 유지, 우회 금지(§7).

export const AGODA_CID = "1972243";
export const TRIP_ALLIANCE_ID = "9901788";
export const TRIP_SID = "327852582";
export const TRIP_SUB3 = "D19787273";
export const KLOOK_AID = "123610";
export const KKDAY_CID = "26267";

export type PartnerId = "agoda" | "tripcom" | "klook" | "kkday";
export type PartnerPurpose = "stay" | "esim" | "rail" | "bus" | "activity";
export type PartnerLocale = "en" | "ko" | "ja" | "zh";

export const PARTNER_NAMES: Record<PartnerId, string> = {
  agoda: "Agoda", tripcom: "Trip.com", klook: "Klook", kkday: "KKday",
};

// ── Agoda — partnersearch 규격 (원본: 부산 hl=en-us · 규칙 ja/ko/zh 착지 검증) ──
const AGODA_HL: Record<PartnerLocale, string> = {
  en: "en-us", ko: "ko-kr", ja: "ja-jp", zh: "zh-cn",
};
/**
 * 검증된 도시 ID 만 — 추측 금지.
 * busan: Owner 원본. 나머지 4곳(2026-09-14): Agoda 자체 자동완성 API
 * (GetUnifiedSuggestResult, CityId 필드)에서 추출 — busan=17172 일치로 소스
 * 교차검증 — 후 partnersearch 착지 실측(200 + 해당 도시 호텔 목록 + hl 정상).
 */
const AGODA_CITY_IDS: Partial<Record<string, string>> = {
  busan: "17172",
  seoul: "14690",
  jeju: "16901",
  gyeongju: "17179",
  jeonju: "17831",
};

export function buildAgodaCitySearch(citySlug: string, locale: PartnerLocale): string | null {
  const cityId = AGODA_CITY_IDS[citySlug.toLowerCase()];
  if (!cityId) return null;
  const u = new URL("https://www.agoda.com/partners/partnersearch.aspx");
  u.searchParams.set("pcs", "1");
  u.searchParams.set("cid", AGODA_CID);
  u.searchParams.set("hl", AGODA_HL[locale]);
  u.searchParams.set("city", cityId);
  return u.toString();
}

// ── Trip.com — 호텔 목록 규격 (원본: 경주·전주 kr. · 규칙 www/jp 착지 검증) ──
/** locale → 검증된 도메인. zh 도메인은 공식 규격 미확인 — 지원하지 않는다. */
const TRIP_HOSTS: Partial<Record<PartnerLocale, string>> = {
  ko: "kr.trip.com", en: "www.trip.com", ja: "jp.trip.com",
};
/**
 * 경로 세그먼트 — Owner 원본(경주·전주) + 공식 Trip.com 페이지 실측으로 확보해
 * 착지 교차검증(200·도시명·Alliance 잔존)한 부산/서울/제주 (2026-09-13).
 * 추측으로 만든 값은 없다.
 */
const TRIP_HOTEL_PATHS: Partial<Record<string, string>> = {
  busan: "busan-hotels-list-253",
  seoul: "seoul-hotels-list-274",
  jeju: "jeju-hotels-list-737",
  gyeongju: "gyeongju-hotels-list-3675",
  jeonju: "jeonju-si-hotels-list-61380",
};

export function buildTripcomHotels(citySlug: string, locale: PartnerLocale): string | null {
  const host = TRIP_HOSTS[locale];
  const path = TRIP_HOTEL_PATHS[citySlug.toLowerCase()];
  if (!host || !path) return null;
  const u = new URL(`https://${host}/hotels/${path}/`);
  u.searchParams.set("Allianceid", TRIP_ALLIANCE_ID);
  u.searchParams.set("SID", TRIP_SID);
  u.searchParams.set("trip_sub1", `gkm_hotel_${citySlug.toLowerCase()}`);
  u.searchParams.set("trip_sub3", TRIP_SUB3);
  return u.toString();
}

// ── Klook — 직접 AID 부착 규격 (Owner 대시보드 공식 안내, 2026-09-14 V4) ──
// 공식: www.klook.com URL 끝에 `?aid=123610` 을 직접 붙인다. redirect/aff_adid/
// 단축링크(s.klook.com)는 쓰지 않는다. 착지 검증은 Owner 로그인 크롬(실브라우저,
// 사람 확인 1회 통과)에서 수행 — 전 조합에서 aid 잔존 + Klook 이 스스로
// `utm_medium=affiliate-alwayson` 을 덧붙여 제휴 링크로 인식함을 확인했다.
//
// 검증 결과(2026-09-14):
//  · eSIM  /{ko|en-US|ja|zh-CN}/wifi-sim-card/?dest_id=1010  → 4/4 정상.
//    dest_id=1010 = 대한민국(검색창 프리필 + 전 상품 한국 유심/WiFi 로 확인).
//  · 검색  /{seg}/search/result/?query=…                      → 4/4 정상
//    (부산 ko/en/ja/zh + 도시축 Busan/Seoul/Jeonju 관측, 126~999+건).
//  · 기차  korea-rail/  → base(en)/ja/zh-CN 정상, /ko/ 는 404(경로 부재) → ko 없음.
//  · 버스  korea-bus/   → en-US/ja/zh-CN 정상, /ko/ 는 404 → ko 없음.
const KLOOK_SEG: Record<PartnerLocale, string> = {
  en: "en-US", ko: "ko", ja: "ja", zh: "zh-CN",
};

function klookUrl(path: string): string {
  const u = new URL(`https://www.klook.com${path}`);
  u.searchParams.set("aid", KLOOK_AID);
  return u.toString();
}

/** 한국 전역 eSIM/유심 카테고리 — 도시 무관, 4개 locale 전부 착지 검증 완료. */
export function buildKlookEsim(locale: PartnerLocale): string {
  return klookUrl(`/${KLOOK_SEG[locale]}/wifi-sim-card/?dest_id=1010`);
}

/**
 * 도시 검색어 — ID 가 아니라 자유 검색어. 라우트는 locale 축으로 검증됐고,
 * 표기는 Klook 페이지 자체 표기(ソウル·首尔 등) 관측 + 표준 지명 번역.
 */
const KLOOK_CITY_QUERY: Partial<Record<string, Record<PartnerLocale, string>>> = {
  busan: { en: "Busan", ko: "부산", ja: "釜山", zh: "釜山" },
  seoul: { en: "Seoul", ko: "서울", ja: "ソウル", zh: "首尔" },
  jeju: { en: "Jeju", ko: "제주", ja: "済州", zh: "济州" },
  gyeongju: { en: "Gyeongju", ko: "경주", ja: "慶州", zh: "庆州" },
  jeonju: { en: "Jeonju", ko: "전주", ja: "全州", zh: "全州" },
};

export function buildKlookCitySearch(citySlug: string, locale: PartnerLocale): string | null {
  const query = KLOOK_CITY_QUERY[citySlug.toLowerCase()]?.[locale];
  if (!query) return null;
  const u = new URL(`https://www.klook.com/${KLOOK_SEG[locale]}/search/result/`);
  u.searchParams.set("query", query);
  u.searchParams.set("aid", KLOOK_AID);
  return u.toString();
}

/** 기차 카테고리 — en 은 base 경로만 검증됨(/en-US/ 미검증), /ko/ 는 404 라 없음. */
const KLOOK_RAIL_PATHS: Partial<Record<PartnerLocale, string>> = {
  en: "/korea-rail/", ja: "/ja/korea-rail/", zh: "/zh-CN/korea-rail/",
};
export function buildKlookRail(locale: PartnerLocale): string | null {
  const path = KLOOK_RAIL_PATHS[locale];
  return path ? klookUrl(path) : null;
}

/** 시외버스 카테고리 — /ko/ 는 404 라 없음. */
const KLOOK_BUS_PATHS: Partial<Record<PartnerLocale, string>> = {
  en: "/en-US/korea-bus/", ja: "/ja/korea-bus/", zh: "/zh-CN/korea-bus/",
};
export function buildKlookBus(locale: PartnerLocale): string | null {
  const path = KLOOK_BUS_PATHS[locale];
  return path ? klookUrl(path) : null;
}

// ── KKday — cid 부착 규격 (Owner 전용 링크 화면의 공식 안내 근거) ──
// v3(2026-09-13): 일반 브라우저(headed) 검증 — 도시 목적지
// `/{locale}/destination/kr-{city}` 가 5도시 × en/ja/ko/zh-cn 에서 200 착지,
// locale·도시 정확, cid/ud 잔존. zh-cn(간체) 경로 실존 — zh 사용자 공백 해소.
const UD_ALNUM = /^[a-z0-9]+$/i;

const KKDAY_LOCALE_SEG: Record<PartnerLocale, string> = {
  en: "en", ja: "ja", ko: "ko", zh: "zh-cn",
};
/** headed 검증 완료 도시(도시 축 en 전수 + locale 축 busan/seoul) — 추측 아님 */
const KKDAY_CITY_SLUGS: Partial<Record<string, string>> = {
  busan: "kr-busan", seoul: "kr-seoul", jeju: "kr-jeju",
  gyeongju: "kr-gyeongju", jeonju: "kr-jeonju",
};

export function buildKkdayCityActivity(citySlug: string, locale: PartnerLocale): string | null {
  const dest = KKDAY_CITY_SLUGS[citySlug.toLowerCase()];
  if (!dest) return null;
  return buildKkday(`/${KKDAY_LOCALE_SEG[locale]}/destination/${dest}`, `${citySlug.toLowerCase()}activity`);
}

export function buildKkday(pathname: string, ud2: string): string | null {
  // ud 태그는 영숫자만 — "test" 는 시험용이라 운영 조립을 거부한다.
  if (!UD_ALNUM.test(ud2) || ud2.toLowerCase() === "test") return null;
  const u = new URL(`https://www.kkday.com${pathname.startsWith("/") ? pathname : `/${pathname}`}`);
  u.searchParams.set("cid", KKDAY_CID);
  u.searchParams.set("ud1", "gokoreamate");
  u.searchParams.set("ud2", ud2.toLowerCase());
  return u.toString();
}

// ── 구세대 차단 ──────────────────────────────────────────────────────────────
/**
 * 이 흔적이 있는 URL 은 새 활성 경로로 절대 나가지 않는다(테스트 고정).
 * LEGACY-CLEANUP-V1: 마커를 host 기준으로 일반화 — 구세대는 전부
 * affiliate.klook.com(redirect?aid=…·sl/* 단축링크) 경유였고 신규 공식 규격은
 * www.klook.com 직접 부착이라, host 하나로 구 AID·단축링크를 모두 덮는다
 * (차단 범위는 종전 이상). 구 AID 숫자 리터럴은 minifier 상수 접기 때문에
 * 어떤 조립으로도 번들에 남아, 값 자체를 마커에서 제거했다.
 */
export const LEGACY_AFFILIATE_MARKERS = ["affiliate.klook.com/"] as const;

export function isLegacyAffiliateUrl(url: string): boolean {
  return LEGACY_AFFILIATE_MARKERS.some(m => url.includes(m));
}

// ── 활성 매트릭스 — 검증 통과 조합만 ────────────────────────────────────────
//
// 실브라우저 착지 검증 통과분(v2~v5):
//   stay: 5도시=Agoda 추천(4locale, zh 포함)+Trip.com 대안(en/ja/ko — zh 규격 미확인)
//   activity: Klook 검색(4locale) 추천 + KKday 도시 목적지(4locale) 대안 — 5도시
//   esim: Klook(4locale) · rail/bus: Klook(en/ja/zh — ko 는 경로 부재)
// 하나만 유효하면 하나만 노출하고, 없으면 그 영역은 렌더하지 않는다.

export interface PartnerOffer {
  partner: PartnerId;
  purpose: PartnerPurpose;
  href: string;
}

/**
 * stay 후보 — Owner 정책 순서: Agoda → Trip.com.
 * [0]=추천, [1]=대안(있을 때만). 검증된 조합만 배열에 들어간다.
 *  · Agoda: 5도시 ID 확보(v5) — 추천, 4locale(zh 포함).
 *  · Trip.com: 5도시 경로 확보 — 대안, locale 은 검증 도메인(en/ja/ko)만 —
 *    zh 는 hk.trip.com 이 번체(zh-HK)라 간체 UI 와 불일치, 미지원 유지.
 */
export function stayOffersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  const slug = citySlug.toLowerCase();
  const out: PartnerOffer[] = [];
  const agoda = buildAgodaCitySearch(slug, locale);
  if (agoda) out.push({ partner: "agoda", purpose: "stay", href: agoda });
  const trip = buildTripcomHotels(slug, locale);
  if (trip) out.push({ partner: "tripcom", purpose: "stay", href: trip });
  return out.slice(0, 2); // 추천 1 + 대안 최대 1
}

/** @deprecated 추천만 필요할 때 — stayOffersFor 의 첫 항목 */
export function stayOfferFor(citySlug: string, locale: PartnerLocale): PartnerOffer | null {
  return stayOffersFor(citySlug, locale)[0] ?? null;
}

/**
 * activity 후보 — Owner 정책 순서 Klook → KKday (V4: Klook 직접 AID 검증 완료로
 * 추천 승격, KKday 는 검증된 대안으로 이동). Klook 이 없는 조합(미확보 도시)은
 * KKday 단독, 둘 다 없으면 렌더 없음.
 */
export function activityOffersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  const out: PartnerOffer[] = [];
  const klook = buildKlookCitySearch(citySlug, locale);
  if (klook) out.push({ partner: "klook", purpose: "activity", href: klook });
  const kkday = buildKkdayCityActivity(citySlug, locale);
  if (kkday) out.push({ partner: "kkday", purpose: "activity", href: kkday });
  return out.slice(0, 2);
}

/** esim — Klook 단독(4 locale 검증). 5도시 승인 도시에서만 노출한다. */
export function esimOffersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  if (!KKDAY_CITY_SLUGS[citySlug.toLowerCase()]) return []; // 승인 5도시 밖 렌더 0
  return [{ partner: "klook", purpose: "esim", href: buildKlookEsim(locale) }];
}

/** rail/bus — Klook 단독. 검증된 locale(en/ja/zh)만, ko 는 경로 부재로 없음. */
export function railOffersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  if (!KKDAY_CITY_SLUGS[citySlug.toLowerCase()]) return [];
  const href = buildKlookRail(locale);
  return href ? [{ partner: "klook", purpose: "rail", href }] : [];
}

export function busOffersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  if (!KKDAY_CITY_SLUGS[citySlug.toLowerCase()]) return [];
  const href = buildKlookBus(locale);
  return href ? [{ partner: "klook", purpose: "bus", href }] : [];
}

/**
 * 표면 공통 진입점 — 목적 순서대로 각 목적의 [추천, 대안?] 을 돌려준다.
 * 검증 안 된 조합은 배열이 비고, 빈 목적은 화면에서 줄 자체가 없다.
 */
export function offersByPurpose(
  citySlug: string, locale: PartnerLocale,
): Record<"stay" | "activity" | "esim" | "rail" | "bus", PartnerOffer[]> {
  return {
    stay: stayOffersFor(citySlug, locale),
    activity: activityOffersFor(citySlug, locale),
    esim: esimOffersFor(citySlug, locale),
    rail: railOffersFor(citySlug, locale),
    bus: busOffersFor(citySlug, locale),
  };
}

export function offersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  const by = offersByPurpose(citySlug, locale);
  return [...by.stay, ...by.activity, ...by.esim, ...by.rail, ...by.bus];
}
