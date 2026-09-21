// Trend Pack 자동 큐레이션 규칙 (MULTILOCALE-TREND-DB V2 §4·§9·§10)
//
// Owner 는 개별 표현을 승인하지 않는다 — 이 모듈의 규칙이 자동 판정하고,
// 정치·혐오·성적·차별·외모 비하·브랜드 오인·법적 위험 같은 예외만
// manual_review 로 보낸다. DB(mytrip_trend_packs)가 SSOT 이며 이 모듈은
// 순수 규칙·상수·선택 로직만 담는다(런타임 웹 검색 0).

import type { TrendPromptEntry } from "./writing-core";

export type TrendLifecycle = "artist_fandom" | "fast_sns" | "established" | "colloquial";
export type TrendStatus =
  "candidate" | "experimental_active" | "active" | "cooling" | "archived" | "blocked" | "manual_review";

/** §4 재검증 주기 — 고정 30~60일 단일 만료를 쓰지 않는다 */
export const REVIEW_INTERVAL_DAYS: Record<TrendLifecycle, number> = {
  artist_fandom: 14,
  fast_sns: 30,
  established: 90,
  colloquial: 180,
};

/** §9 선택 기준 — 이 위험도보다 높은 row 는 요청에 싣지 않는다 */
export const TREND_RISK_MAX_FOR_SELECTION = 0.6;
export const TREND_MAX_PER_REQUEST = 5;

/**
 * §10 자동 품질 규칙(제안 초기값 — Production 확정 전 Preview 데이터로 재조정).
 * 최소 표본 전에는 자동 판정하지 않는다.
 */
export const TREND_QUALITY_RULE = {
  minSample: 20,                 // shown_count 기준
  promoteSelectRate: 0.25,       // 이상이면 experimental_active → active
  coolingRegenRate: 0.5,         // 제안 직후 재생성 비율이 이상이면 cooling
  coolingHeavyEditRate: 0.6,     // 대폭 수정 비율이 이상이면 cooling
} as const;

/** §10 '크게 수정' 판정 상수 — 메타 endpoint 가 쓴다(원문 미저장, 글자 수 변화만) */
export const HEAVY_EDIT_TITLE_DELTA = 8;
export const HEAVY_EDIT_MEMO_DELTA = 15;

export interface TrendRow extends TrendPromptEntry {
  locale: string;
  region_scope: string;
  status: TrendStatus;
  lifecycle_type: TrendLifecycle;
  next_review_at: string;      // date
  confidence_score: number;
  risk_score: number;
  brand_or_artist_related: boolean;
  pack_version: string;
}

/** UI locale → DB locale. zh 는 Simplified Chinese(감사 확정) → zh-CN 중립 간체만.
 *  zh-TW/zh-HK 는 지역 선택 기능 전까지 자동 혼합하지 않는다(§6). */
export const UI_TO_DB_LOCALE: Record<string, string | null> = {
  ko: "ko-KR", ja: "ja-JP", en: "en", zh: "zh-CN",
};

/** §9 요청당 선택 — active/experimental_active·재검증 기한 내·저위험·최대 5개 */
export function selectTrendForRequest(rows: TrendRow[], uiLocale: string, now = new Date()): TrendRow[] {
  const dbLocale = UI_TO_DB_LOCALE[uiLocale] ?? null;
  if (!dbLocale) return [];
  const today = now.toISOString().slice(0, 10);
  return rows
    .filter(r => r.locale === dbLocale &&
      (r.status === "active" || r.status === "experimental_active") &&
      r.next_review_at > today &&
      r.risk_score <= TREND_RISK_MAX_FOR_SELECTION)
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .slice(0, TREND_MAX_PER_REQUEST);
}

/** 캐시 키에 넣을 '실제 사용 pack 버전' — 보낸 row 집합이 바뀌면 키가 바뀐다(§9) */
export function trendVersionOf(rows: TrendRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.map(r => `${r.id}@${r.pack_version}`).sort().join(",");
}

/** §4 자동 활성화 입력 — curator 가 조사 결과를 이 모양으로 넘긴다 */
export interface TrendEvidence {
  recentUseConfirmed: boolean;        // 최근 사용 근거
  independentSources: number;         // 독립 출처 수
  originPlusSpread: boolean;          // 원출처 1 + 확산 근거 1 이상
  meaningConfirmed: boolean;          // 언어권 의미·맥락 확인
  travelFit: boolean;                 // 여행 사진 문구 적용 가능
  sensitive: boolean;                 // 정치·혐오·성적·차별·외모 비하
  looksLikeBrandAd: boolean;          // 공식 광고·협업 오인 소지
  regionalConflict: boolean;          // 지역별 의미 충돌
  forcedUseRateOk: boolean;           // 테스트 사진 억지 사용률 기준 이하
  sourcesRecorded: boolean;           // 출처 URL·확인일 보존
  artistOrFandomOrigin: boolean;
  lowSample: boolean;                 // 새 밈·표본 부족
  ambiguous: boolean;                 // 의미 모호·자동 판단 곤란
}

/** §4 자동 판정 — 예외만 manual_review, 나머지는 규칙으로 상태 결정 */
export function decideAutoStatus(e: TrendEvidence): TrendStatus {
  if (e.sensitive) return "blocked";
  if (e.looksLikeBrandAd || e.ambiguous || e.regionalConflict) return "manual_review";
  const evidenced = e.recentUseConfirmed && (e.independentSources >= 2 || e.originPlusSpread) &&
    e.meaningConfirmed && e.travelFit && e.forcedUseRateOk && e.sourcesRecorded;
  if (!evidenced) return "candidate";
  if (e.artistOrFandomOrigin || e.lowSample) return "experimental_active";
  return "active";
}

/** §10 집계 기반 자동 전이 — 표본 미달이면 손대지 않는다 */
export function decideQualityTransition(row: {
  status: TrendStatus; shown_count: number; selected_count: number;
  heavily_edited_count: number; regenerated_after_count: number;
}): TrendStatus | null {
  if (row.shown_count < TREND_QUALITY_RULE.minSample) return null;
  const sel = row.selected_count / row.shown_count;
  const regen = row.regenerated_after_count / row.shown_count;
  const heavy = row.selected_count > 0 ? row.heavily_edited_count / row.selected_count : 0;
  if (regen >= TREND_QUALITY_RULE.coolingRegenRate || heavy >= TREND_QUALITY_RULE.coolingHeavyEditRate) return "cooling";
  if (row.status === "experimental_active" && sel >= TREND_QUALITY_RULE.promoteSelectRate) return "active";
  return null;
}

export function nextReviewDate(lifecycle: TrendLifecycle, from = new Date()): string {
  const d = new Date(from.getTime() + REVIEW_INTERVAL_DAYS[lifecycle] * 86_400_000);
  return d.toISOString().slice(0, 10);
}
