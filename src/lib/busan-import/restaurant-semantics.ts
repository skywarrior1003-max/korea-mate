// `category='restaurant'` 이 **실제로** 식음 영업 장소인지 판정한다.
//
// 왜 필요한가
//   기존 운영 데이터에 `Jeonpo Cafe Street`(거리) · `Jagalchi Market`(시장 전체) 이
//   restaurant 로 들어가 있다. 스케줄러가 이걸 "저녁 식사" 후보로 고른다.
//   신규 332건에도 쿠킹클래스·회타운·시장 소개글이 섞여 있었다.
//
// 이름 keyword 로 판정하면 안 된다 — 실측으로 확인된 오탐이다.
//   `부산`  에 '산'      이 들어간다 (부산족발, 부산대 …)
//   `Stone Street`      는 거리가 아니라 식당 상호다
//   `Park Hae-yun`      의 park 는 성씨다
//   반대로 `민락회타운` 은 town 이 들어가서가 아니라 **1층이 활어시장인 복합건물**이라 제외다
//
// 그래서 1차 근거는 provider taxonomy 다.
//   FoodService:*                 부산시 음식점 서비스 — 개별 인허가 업소
//   VisitBusanContent:food:*      VisitBusan 이 food 로 분류한 콘텐츠
// 그 위에 "개별 업소가 아닌 것"을 걸러내는 부정 신호를 얹는다.

export type SemanticClass =
  | "SEMANTIC_RESTAURANT_CONFIRMED"
  | "SEMANTIC_RESTAURANT_LIKELY"
  | "SEMANTIC_NOT_RESTAURANT"
  | "SEMANTIC_REVIEW_REQUIRED";

export interface SemanticInput {
  candidate_id: string;
  name_ko: string;
  name_en: string | null;
  description_ko: string | null;
  description_en: string | null;
  address: string;
  source_keys: readonly string[];
  primary_source: string | null;
}

export interface SemanticResult {
  candidate_id: string;
  klass: SemanticClass;
  reason: string;
  signals: {
    food_provider: boolean;
    activity: boolean;
    collective: boolean;
    article_name: boolean;
    individual_dining_text: boolean;
  };
}

// ── provider 신호 ────────────────────────────────────────────────────────────

/** 부산시 음식점 서비스 또는 VisitBusan food 분류에서 왔는가 */
export function hasFoodProviderSignal(sourceKeys: readonly string[]): boolean {
  return sourceKeys.some(k => k.startsWith("FoodService:") || k.startsWith("VisitBusanContent:food:"));
}

// ── 부정 신호 ────────────────────────────────────────────────────────────────
//
// 아래 목록은 "이름에 들어가면 제외" 가 아니다. **그 자체가 장소의 정체**일 때만 쓴다.
// 그래서 상호 안에 흔히 섞이는 글자(산·시장·거리)는 넣지 않고,
// 개별 업소로 성립할 수 없는 표현만 넣는다.

/** 식음 소비가 아니라 체험·수업인 곳 */
const ACTIVITY_KO = ["쿠킹클래스", "쿠킹하우스", "쿠킹 클래스", "원데이클래스", "요리교실", "체험교실"];
const ACTIVITY_EN = ["cooking class", "cooking house", "cooking studio", "culinary experience", "cooking experience"];

/** 개별 업소가 아니라 여러 가게의 묶음·건물·구역 */
const COLLECTIVE_KO = ["회타운", "먹거리타운", "맛집거리", "먹자골목", "음식특화거리", "시장맛집", "맛집들"];
const COLLECTIVE_EN = ["hoe town", "food town", "must-eat places", "restaurants in", "eateries in"];

function hasAny(text: string, needles: readonly string[]): boolean {
  const t = text.toLowerCase();
  return needles.some(n => t.includes(n.toLowerCase()));
}

export function isActivityVenue(i: SemanticInput): boolean {
  const ko = `${i.name_ko} ${i.description_ko ?? ""}`;
  const en = `${i.name_en ?? ""} ${i.description_en ?? ""}`;
  // 이름에 있으면 확정, 설명에만 있으면 이름과 함께 볼 때만 인정
  if (hasAny(i.name_ko, ACTIVITY_KO) || hasAny(i.name_en ?? "", ACTIVITY_EN)) return true;
  return hasAny(ko, ACTIVITY_KO) && hasAny(en, ACTIVITY_EN);
}

export function isCollectiveVenue(i: SemanticInput): boolean {
  if (hasAny(i.name_ko, COLLECTIVE_KO) || hasAny(i.name_en ?? "", COLLECTIVE_EN)) return true;
  // 설명이 "여러 곳을 소개" 하는 글이면 개별 업소가 아니다
  const en = (i.description_en ?? "").toLowerCase();
  return /\b(various types of food|different kinds of places|a paradise where people can try)\b/.test(en);
}

/**
 * 장소명이 아니라 기사 제목이 들어온 경우.
 * 실측 사례: name_ko = `달콤한 부산의 매력,` (끝에 쉼표만 남은 헤드라인)
 */
export function isArticleTitle(i: SemanticInput): boolean {
  const ko = i.name_ko.trim();
  if (/[,·]$/.test(ko)) return true;
  const en = (i.name_en ?? "").toLowerCase();
  return / as seen on /.test(en) || /^must-eat\b/.test(en);
}

/**
 * 개별 식음 업소임을 분명히 말하는가 (provider 신호가 없을 때만 쓴다).
 * 이름과 설명을 **함께** 본다 — `감성 … 캠핑 컨셉 카페, 클래식 캠퍼` 처럼
 * 업태가 이름에만 드러나는 사례가 있다.
 * `café`(악센트)·`cafes`(복수)도 잡는다.
 */
export function hasIndividualDiningText(i: SemanticInput): boolean {
  const en = `${i.name_en ?? ""} ${i.description_en ?? ""}`.toLowerCase();
  const ko = `${i.name_ko} ${i.description_ko ?? ""}`;
  return /caf[eé]s?\b|\b(restaurant|bakery|dessert|bistro|diner|eatery)s?\b|sold at a small shop/.test(en)
      || /(카페|식당|음식점|베이커리|디저트|맛집|포차|주점)/.test(ko);
}

/**
 * 의미 판정. 보수적으로 간다 — 근거가 갈리면 CONFIRMED 를 주지 않는다.
 * CONFIRMED 만 Production allowlist 에 들어간다.
 */
export function classifySemantics(i: SemanticInput): SemanticResult {
  const food     = hasFoodProviderSignal(i.source_keys);
  const activity = isActivityVenue(i);
  const collect  = isCollectiveVenue(i);
  const article  = isArticleTitle(i);
  const dining   = hasIndividualDiningText(i);
  const signals  = { food_provider: food, activity, collective: collect, article_name: article, individual_dining_text: dining };

  const mk = (klass: SemanticClass, reason: string): SemanticResult =>
    ({ candidate_id: i.candidate_id, klass, reason, signals });

  // 체험·수업은 식사 장소가 아니다. provider 가 뭐라 하든 제외한다.
  if (activity) return mk("SEMANTIC_NOT_RESTAURANT", "체험·요리수업 공간 — 식음 소비 장소가 아님");
  // 여러 가게의 묶음·건물·구역
  if (collect)  return mk("SEMANTIC_NOT_RESTAURANT", "개별 업소가 아닌 복합·구역·다수 소개");
  // 장소명 자리에 기사 제목이 들어온 경우 — 이름을 그대로 노출할 수 없다
  if (article)  return mk("SEMANTIC_REVIEW_REQUIRED", "장소명이 아니라 기사 제목 형태 — 표시명 확정 필요");

  if (food) return mk("SEMANTIC_RESTAURANT_CONFIRMED", "음식점 provider(FoodService/VisitBusan food) 등록 · 부정 신호 없음");
  if (dining) return mk("SEMANTIC_RESTAURANT_LIKELY", "설명은 개별 식음 업소를 가리키나 음식점 provider 분류가 아님");
  return mk("SEMANTIC_REVIEW_REQUIRED", "음식점 provider 신호도, 개별 식음 근거도 부족");
}

export function classifyAllSemantics(rows: readonly SemanticInput[]): SemanticResult[] {
  return rows.map(classifySemantics);
}

/** Production allowlist — CONFIRMED 만. LIKELY 는 넣지 않는다. */
export function buildAllowlist(results: readonly SemanticResult[]): string[] {
  return results
    .filter(r => r.klass === "SEMANTIC_RESTAURANT_CONFIRMED")
    .map(r => r.candidate_id)
    .sort();
}
