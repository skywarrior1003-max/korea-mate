// 언어·지역별 Trend Pack — ⚠ V2(MULTILOCALE-TREND-DB)부터 런타임 SSOT 아님.
// 런타임은 DB(mytrip_trend_packs)만 읽는다. 이 파일은 V1 조사 기록·타입 참고용으로만
// 남아 있으며 생성 경로에서 import 되지 않는다(curator seed 는 scripts/trend-candidates-*.json).
//
// 원칙
//  · 런타임 웹 검색 0 — 이 파일은 "주기 조사 → 사람 검수 → Owner 승인 → 활성화"
//    파이프라인의 산출물이다. 검수·승인 없이 항목을 verified_active 로 올리지 않는다.
//  · 활성 조건: status=verified_active + 유효기간 내 + ownerApproved.
//    Owner 승인 전 항목은 QA 환경 변수(MYTRIP_TREND_QA=1)에서만 활성 — 배포
//    Preview 기본값에서는 비활성이다(검증되지 않은 표현을 "현재 대세"로 노출 금지).
//  · 브랜드·아티스트 연관 표현은 자동 활성화 금지(공식 협업 오해 방지).
//  · zh 는 앱 locale 이 지역 미구분("zh")이므로 zh-TW/zh-HK 유행어를 임의 적용하지
//    않는다 — 구조만 준비하고 활성 0 을 유지한다(§F).
//  · 생성 요청당 최대 MAX_TREND_ENTRIES_PER_REQUEST 개만 프롬프트에 싣는다(§G).

export const TREND_PACK_VERSION = "tp-2026-09-21-r1";
export const MAX_TREND_ENTRIES_PER_REQUEST = 5;

export type TrendStatus = "owner_candidate" | "verified_active" | "expired" | "blocked";
export type TrendLocale = "ko-KR" | "ja-JP" | "en" | "zh" | "zh-TW" | "zh-HK";

export interface TrendEntry {
  id: string;
  locale: TrendLocale;
  region: string;
  phrase: string;
  meaning: string;
  usageExample: string;
  avoidWhen: string;
  sourceUrl: string;
  checkedAt: string;   // YYYY-MM-DD
  validFrom: string;   // YYYY-MM-DD
  validUntil: string;  // YYYY-MM-DD — 지나면 자동 선택 대상에서 제외
  status: TrendStatus;
  brandOrArtistRelated: boolean;
  ownerApproved: boolean;
}

export const TREND_PACK: TrendEntry[] = [
  // ── ko-KR — 조사·사람 검수 완료, Owner 승인 대기 ──────────────────────────
  {
    id: "ko-neujoh-2026",
    locale: "ko-KR", region: "KR",
    phrase: "느좋",
    meaning: "'느낌 좋다'의 줄임 — 분위기·풍경·사진이 마음에 들 때 가볍게 쓰는 감탄.",
    usageExample: "조명 켜진 다리 느좋.",
    avoidWhen: "진지한 추모·역사 유적의 엄숙한 맥락, 문장 전체를 유행어로만 채우는 경우.",
    sourceUrl: "https://www.careet.net/Content/Series/1",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "verified_active", brandOrArtistRelated: false, ownerApproved: false,
  },
  {
    id: "ko-gamdasal-2026",
    locale: "ko-KR", region: "KR",
    phrase: "감 다 살았네",
    meaning: "구도·결과물이 좋아 '감각이 살아 있다'고 칭찬하는 표현(줄임: 감다살).",
    usageExample: "반영까지 담기다니, 감 다 살았네.",
    avoidWhen: "타인 사진 평가로 읽힐 수 있는 맥락, 반어로 들릴 수 있는 부정적 장면.",
    sourceUrl: "https://www.ogleogle.co.kr/ko/blog/korean-slang-2026",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "verified_active", brandOrArtistRelated: false, ownerApproved: false,
  },
  // ── Owner 제공 후보 — 공식 출처·의미·사용 범위 미확정 → 승격 보류(§F) ─────
  {
    id: "ko-dua-honna-candidate",
    locale: "ko-KR", region: "KR",
    phrase: "두아 혼나볼래?",
    meaning: "미확정 — '두아'는 2026-01 확산 밈으로 언급되나(손동작 계열), '혼나볼래' 결합형의 원출처·정확한 의미·현재 사용 범위를 공식 출처로 확인하지 못함.",
    usageExample: "(검증 전 사용 금지)",
    avoidWhen: "전면 — 아티스트('두아 리파' 등) 연관 오해 소지도 미해소.",
    sourceUrl: "https://www.instablank.com/meme?year=2026",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "owner_candidate", brandOrArtistRelated: true, ownerApproved: false,
  },
  {
    id: "ko-oishi-candidate",
    locale: "ko-KR", region: "KR",
    phrase: "오이쉬!",
    meaning: "미확정 — 일본어 おいしい 차용 감탄으로 추정되나 유행 근거·출처·사용 범위를 확인하지 못함.",
    usageExample: "(검증 전 사용 금지)",
    avoidWhen: "전면 — 음식 외 맥락에서 의미 불명.",
    sourceUrl: "",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "owner_candidate", brandOrArtistRelated: false, ownerApproved: false,
  },
  // ── ja-JP ──────────────────────────────────────────────────────────────────
  {
    id: "ja-gyun-2026",
    locale: "ja-JP", region: "JP",
    phrase: "ギュン",
    meaning: "「キュン」より強い、心をつかまれた瞬間の感嘆(2026 若者言葉として文書化).",
    usageExample: "水面の橋、ギュンときた。",
    avoidWhen: "荘厳・追悼の文脈。多用すると軽薄に見える。",
    sourceUrl: "https://lab.weiden-haus.com/column/wakamono-kotoba-2026/",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "verified_active", brandOrArtistRelated: false, ownerApproved: false,
  },
  {
    id: "ja-emoi-longlived",
    locale: "ja-JP", region: "JP",
    phrase: "エモい",
    meaning: "感情を揺さぶる、趣がある — 定着済みの口語(風景・写真キャプションに自然).",
    usageExample: "夜の橋、エモい。",
    avoidWhen: "厳粛な史跡説明。安易な多用。",
    sourceUrl: "https://weknowledge.jp/column/trend/post_4292",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "verified_active", brandOrArtistRelated: false, ownerApproved: false,
  },
  {
    id: "ja-sugite-metsu-candidate",
    locale: "ja-JP", region: "JP",
    phrase: "〇〇すぎて滅",
    meaning: "2026 Z世代流行語 1位로 보도 — 다만 아이돌 그룹 M!LK 가사 유래(아티스트 연관).",
    usageExample: "(자동 활성 금지 — 아티스트 연관)",
    avoidWhen: "전면 — 공식 협업 오해 소지.",
    sourceUrl: "https://news.yahoo.co.jp/articles/c8476b0002d9d92d22bce9a3a0763eb35eebf248",
    checkedAt: "2026-09-21", validFrom: "2026-01-01", validUntil: "2026-12-31",
    status: "owner_candidate", brandOrArtistRelated: true, ownerApproved: false,
  },
  // ── en — 국가 미구분이므로 global-safe 만 ──────────────────────────────────
  {
    id: "en-main-character-energy",
    locale: "en", region: "global",
    phrase: "main character energy",
    meaning: "Acting like the confident lead of your own story; romanticizing everyday scenes (documented: solo-trip captions).",
    usageExample: "Night bridge, full main character energy.",
    avoidWhen: "Somber or memorial contexts; overuse.",
    sourceUrl: "https://www.dictionary.com/culture/slang/main-character-energy",
    checkedAt: "2026-09-21", validFrom: "2024-01-01", validUntil: "2026-12-31",
    status: "verified_active", brandOrArtistRelated: false, ownerApproved: false,
  },
  // ── zh — 앱 locale 이 지역 미구분("zh") → 활성 0 유지. 구조 예비만. ─────────
  // (zh-TW·zh-HK 항목은 지역 선택 UI 도입 후 조사·승인 절차를 거쳐 추가한다.)
];

/** locale(UI) → pack locale 매핑 — zh 는 지역 미구분이라 어떤 지역 pack 도 쓰지 않는다 */
const UI_LOCALE_TO_PACK: Record<string, TrendLocale | null> = {
  ko: "ko-KR", ja: "ja-JP", en: "en", zh: null,
};

/**
 * 활성 Trend 항목 — 배포 기본값은 ownerApproved=true 만.
 * allowPendingOwner(QA 전용, MYTRIP_TREND_QA=1)는 "검수 완료·Owner 승인 대기"
 * 항목까지 허용한다 — Owner 가 Preview 에서 실제 결과를 보고 승인 판단하기 위한
 * 경로이며, 완료보고에 Owner 결정 항목으로 명시한다.
 */
export function activeTrendEntries(
  uiLocale: string,
  opts?: { now?: Date; allowPendingOwner?: boolean },
): TrendEntry[] {
  const packLocale = UI_LOCALE_TO_PACK[uiLocale] ?? null;
  if (!packLocale) return [];
  const now = opts?.now ?? new Date();
  const iso = now.toISOString().slice(0, 10);
  return TREND_PACK.filter(e =>
    e.locale === packLocale &&
    e.status === "verified_active" &&
    !e.brandOrArtistRelated &&
    e.validFrom <= iso && iso <= e.validUntil &&
    (e.ownerApproved || opts?.allowPendingOwner === true),
  ).slice(0, MAX_TREND_ENTRIES_PER_REQUEST);
}

/** 요청에 실을 trend pack version — 해당 locale 활성 항목이 없으면 null(캐시 키 안정) */
export function trendPackVersionFor(uiLocale: string, opts?: { now?: Date; allowPendingOwner?: boolean }): string | null {
  return activeTrendEntries(uiLocale, opts).length > 0 ? TREND_PACK_VERSION : null;
}
