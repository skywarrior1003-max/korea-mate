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

// ── V4 §B·§D — 2단계 자동 승격(discovery → corroboration) ────────────────────
// 첫 발견은 출처 수·모델 confidence 와 무관하게 candidate 로만 저장한다.
// 승격은 "다른 시점의 후속 실행"에서, 독립 원본 출처가 확인된 경우에만 한다.

/** 해석된 출처 기록(§D) — source_urls jsonb 에 이 모양으로 저장한다(migration 불필요) */
export interface SourceRecord {
  redirect?: string | null;      // grounding redirect 원문(있으면)
  final_url: string | null;      // 해석된 최종 원본 URL(https)
  domain: string | null;         // 최종 도메인
  title?: string | null;
  published?: string | null;     // 발행일(확인 가능한 경우)
  evidence?: string | null;      // 표현을 뒷받침하는 짧은 근거(스니펫 아님, 요약)
  verified_at: string;           // 확인일
  resolved: boolean;             // redirect 해석 성공 여부
}

/** 정규화 도메인(www 제거) — 동일 기사 재배포·인용 복제 판별의 1차 기준 */
export function normalizeDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  return d.toLowerCase().replace(/^www\./, "") || null;
}

/** 독립 출처 수 — 해석 성공(resolved)한 최종 도메인만 센다. 같은 도메인은 1개. */
export function independentResolvedDomains(sources: readonly SourceRecord[]): number {
  const set = new Set<string>();
  for (const s of sources) {
    const d = normalizeDomain(s.domain);
    if (s.resolved && s.final_url?.startsWith("https://") && d) set.add(d);
  }
  return set.size;
}

export interface CorroborationInput {
  firstVerifiedAt: string;       // 최초 발견일(YYYY-MM-DD)
  runDate: string;               // 이번 실행일 — 최초 발견과 같은 날이면 승격 불가
  sources: readonly SourceRecord[]; // 누적 출처(이전+이번, 해석 결과 포함)
  hasPublishedDate: boolean;     // 최근 사용·발행일 확인
  meaningConsistent: boolean;    // 의미와 사용 예 충돌 없음
  travelFit: boolean;
  sensitive: boolean;
  brandRiskControlled: boolean;  // 브랜드·아티스트 오인 위험 통제됨
  regionalConflict: boolean;
  ambiguous: boolean;
  reviewNotPassed: boolean;      // next_review_at 이 지나지 않음
}

/**
 * §B-2 corroboration 판정. 결과:
 *  experimental_active — 전 조건 충족(같은 실행 내 승격은 구조적으로 불가:
 *                        firstVerifiedAt < runDate 필수)
 *  manual_review       — 고위험·출처/지역/브랜드 충돌·모호
 *  blocked             — 민감
 *  candidate           — 그 외 전부(조건 하나라도 미충족)
 */
export function decideCorroboration(e: CorroborationInput): TrendStatus {
  if (e.sensitive) return "blocked";
  if (!e.brandRiskControlled || e.regionalConflict || e.ambiguous) return "manual_review";
  const ok =
    e.firstVerifiedAt < e.runDate &&
    independentResolvedDomains(e.sources) >= 2 &&
    e.hasPublishedDate &&
    e.meaningConsistent &&
    e.travelFit &&
    e.reviewNotPassed;
  return ok ? "experimental_active" : "candidate";
}

// ── V4-1 §D·§F — 엔티티 분리·KST 주차 ────────────────────────────────────────

export const ENTITY_TYPES = ["phrase", "person", "artist", "group", "brand", "product", "work_title", "event", "unknown"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * §F — KST(UTC+9) 기준 그 주 월요일 날짜("YYYY-MM-DD").
 * 주간 Search slot 의 파티션 키다. UTC 일요일 15:00 = KST 월요일 00:00 경계.
 */
export function kstWeekKey(now: Date): string {
  const kstMs = now.getTime() + 9 * 3600_000;
  const kst = new Date(kstMs);
  const dow = kst.getUTCDay();               // KST 요일(UTC 게터로 읽는다 — 이미 +9h 보정됨)
  const daysFromMonday = (dow + 6) % 7;      // 월=0 … 일=6
  const monday = new Date(kstMs - daysFromMonday * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * §D — 모델 자기 신고(entity_type)를 그대로 믿지 않는 서버 보조 판정.
 * 결정적 신호만 본다: 의미·예문 부재(맨 고유명사), 의미문의 인물/그룹/브랜드
 * 지표 어휘, 출처 제목의 인물 프로필 지표. phrase 로 확정되지 않으면 자동
 * 활성 경로에 들어갈 수 없다(candidate 도 아님 — manual_review 또는 생략).
 */
export interface EntityJudgeInput {
  claimed: string | undefined;          // 모델 신고값
  canonical: string;
  meaning: string;
  usageExample: string;
  sourceTitles: readonly string[];
  artistOrFandomOrigin: boolean;
}
const PERSONISH_RE = /멤버|아이돌|배우|가수|선수|인플루언서|인물|프로필|born|member of|idol|actress|actor|singer|メンバー|俳優|歌手|成员|演员|歌手/i;
const GROUPISH_RE = /걸그룹|보이그룹|그룹|밴드|girl group|boy group|band|グループ|组合/i;
const BRANDISH_RE = /브랜드|출시|제품|판매|brand|launche?d?|product|发布|新品/i;
const WORKISH_RE = /드라마|영화|앨범|곡|웹툰|소설|drama|movie|film|album|song|track|漫画|电影/i;

export function judgeEntityType(e: EntityJudgeInput): EntityType {
  const claimed = (ENTITY_TYPES as readonly string[]).includes(e.claimed ?? "") ? e.claimed as EntityType : "unknown";
  // 맨 고유명사(의미·예문 실질 부재)는 phrase 신고여도 unknown 으로 강등
  const bare = !e.meaning.trim() || !e.usageExample.trim();
  const hay = e.meaning + "\n" + e.sourceTitles.join("\n");
  if (claimed !== "phrase") return claimed;                    // 비-phrase 신고는 그대로(활성 불가)
  if (bare) return "unknown";
  if (GROUPISH_RE.test(hay) && hay.includes(e.canonical)) return "group";
  if (PERSONISH_RE.test(hay) && e.canonical.length <= 4 && !e.usageExample.includes(e.canonical + "?") ) {
    // 짧은 한글 이름 + 인물 지표 어휘 → 인물명 의심. 단 예문이 문구로 실사용을
    // 보여주면(문장 내 활용) phrase 가능성을 남기고 manual 판단은 status 에서.
    if (!e.usageExample.includes(e.canonical)) return "person";
  }
  if (BRANDISH_RE.test(hay) && !e.artistOrFandomOrigin && hay.includes(e.canonical)) return "brand";
  if (WORKISH_RE.test(hay) && hay.includes(e.canonical) && !e.usageExample.includes(e.canonical)) return "work_title";
  return "phrase";
}

/** §D — 자동 활성(candidate 저장·corroboration 진입)이 허용되는 entity 인가 */
export function entityEligibleForTrend(t: EntityType): boolean {
  return t === "phrase";
}
