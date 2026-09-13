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
//  · 구세대 자산(aid=41763 · affiliate.klook.com/sl/*)은 이 모듈이 절대
//    생성하지 않으며, 활성 매트릭스 전체에 대해 테스트로 차단을 고정한다.
//  · 활성(ACTIVE) = Preview/실브라우저 착지 검증을 통과한 조합만. Klook·KKday
//    는 빌더까지만 두고 활성 0 — 자동화 접근이 봇 방어(403)로 막혀 착지를
//    직접 확인하지 못했다(§7: 확인 막힌 조합은 OFF 유지, 우회 금지).

export const AGODA_CID = "1972243";
export const TRIP_ALLIANCE_ID = "9901788";
export const TRIP_SID = "327852582";
export const TRIP_SUB3 = "D19787273";
export const KLOOK_AID = "123610";
/** Owner 생성 링크의 값 그대로 — 범용 재사용이 공식 확인되기 전까지 이 값만 쓴다 */
export const KLOOK_AFF_ADID = "1427383";
export const KKDAY_CID = "26267";

export type PartnerId = "agoda" | "tripcom" | "klook" | "kkday";
export type PartnerPurpose = "stay" | "esim" | "transport" | "activity";
export type PartnerLocale = "en" | "ko" | "ja" | "zh";

export const PARTNER_NAMES: Record<PartnerId, string> = {
  agoda: "Agoda", tripcom: "Trip.com", klook: "Klook", kkday: "KKday",
};

// ── Agoda — partnersearch 규격 (원본: 부산 hl=en-us · 규칙 ja/ko/zh 착지 검증) ──
const AGODA_HL: Record<PartnerLocale, string> = {
  en: "en-us", ko: "ko-kr", ja: "ja-jp", zh: "zh-cn",
};
/** 공식 별도 확보 전까지 검증된 도시 ID 만 — 추측 금지 */
const AGODA_CITY_IDS: Partial<Record<string, string>> = {
  busan: "17172",
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

// ── Klook — redirect 규격 (활성 0: 착지가 봇 방어로 미확인 — 실기기 확인 후) ──
/** 검증된 locale 경로 세그먼트만(원본 /ko/). 그 외 미확인 → null. */
const KLOOK_LOCALE_SEG: Partial<Record<PartnerLocale, string>> = { ko: "ko" };

export function buildKlookCitySearch(query: string, locale: PartnerLocale): string | null {
  const seg = KLOOK_LOCALE_SEG[locale];
  if (!seg || !query.trim()) return null;
  const dest = new URL(`https://www.klook.com/${seg}/search/result/`);
  dest.searchParams.set("query", query.trim());
  dest.searchParams.set("search_scope", "main_search");
  const u = new URL("https://affiliate.klook.com/redirect");
  u.searchParams.set("aid", KLOOK_AID);
  u.searchParams.set("aff_adid", KLOOK_AFF_ADID);
  u.searchParams.set("k_site", dest.toString()); // URLSearchParams 가 1회 인코딩
  return u.toString();
}

// ── KKday — cid 부착 규격 (활성 0: 착지가 봇 방어로 미확인) ──
const UD_ALNUM = /^[a-z0-9]+$/i;

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
/** 이 흔적이 있는 URL 은 새 활성 경로로 절대 나가지 않는다(테스트 고정). */
export const LEGACY_AFFILIATE_MARKERS = ["aid=41763", "affiliate.klook.com/sl/"] as const;

export function isLegacyAffiliateUrl(url: string): boolean {
  return LEGACY_AFFILIATE_MARKERS.some(m => url.includes(m));
}

// ── 활성 매트릭스 — 검증 통과 조합만 ────────────────────────────────────────
//
// Preview/브라우저 착지 검증(§1.5 + 이번 Preview) 통과분:
//   숙박: 부산=Agoda(en/ja/ko/zh) · 경주/전주=Trip.com(en/ja/ko — zh 규격 미확인)
// esim/transport/activity: Klook·KKday 착지 미확인 → 활성 0 (빌더만 존재).
// 하나만 유효하면 하나만 노출하고, 없으면 그 영역은 렌더하지 않는다.

export interface PartnerOffer {
  partner: PartnerId;
  purpose: PartnerPurpose;
  href: string;
}

/**
 * stay 후보 — Owner 정책 순서: Agoda → Trip.com.
 * [0]=추천, [1]=대안(있을 때만). 검증된 조합만 배열에 들어간다.
 *  · Agoda: 도시 ID 확보분(부산)만, 4locale.
 *  · Trip.com: 5도시 경로 확보, locale 은 검증 도메인(en/ja/ko)만 —
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
 * 표면 공통 진입점. 지금은 검증된 목적이 stay 뿐이다 —
 * esim/transport/activity 는 착지 검증 전이므로 어떤 조합도 만들지 않는다
 * (Klook·KKday 는 Owner 실기기 확인표 이후 활성).
 */
export function offersFor(citySlug: string, locale: PartnerLocale): PartnerOffer[] {
  return stayOffersFor(citySlug, locale);
}
