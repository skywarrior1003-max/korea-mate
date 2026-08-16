// 도시를 열기 전에 갖춰져 있어야 하는 것.
//
// `planningReady` 를 true 로 바꾸는 것은 데이터 수집을 시작하는 버튼이 아니라
// **사용자가 실제로 일정을 만들어도 된다**는 마지막 스위치다. 그런데 그 값은
// 한 줄이라 나머지가 비어 있어도 바뀐다. 그러면 도착지 목록이 빈 채로 열리거나,
// 더 나쁘게는 다른 도시 프리셋이 대신 뜬다 — 실제로 화면에는 부산 프리셋으로
// 떨어지는 폴백이 있다.
//
// 그래서 값 하나가 아니라 "그 값을 켜도 되는 상태인가" 를 검사한다.
//
// 무엇을 필수로 보는가
//   화면이 **실제로 호출하는 것만** 넣는다. 도시별 튜닝(Day1 금지 목록·최대
//   거리·공항 배너)은 없으면 기본 동작으로 떨어지므로 필수가 아니다. 없는 것을
//   필수라고 적으면 도시를 여는 사람이 필요 없는 값을 지어내게 된다.
//
// 여기서는 판단만 한다. 값을 만들어 채우지 않는다 — 도착지와 숙박 지역은 그
// 도시에 실제로 있는 장소라, 사람이 정확한 값을 넣는 것이 정상이다.

/** 숙박 지역으로 쓸 수 있는 프리셋 종류. `stay-core.ts` 의 같은 이름과 짝이다. */
export const STAY_AREA_TYPES = ["downtown", "tourist_area"] as const;

/** 도시 이름이 화면에 나가는 로케일. */
export const REQUIRED_LOCALES = ["en", "ko", "ja", "zh"] as const;

export interface ArrivalOptionLike {
  value: string;
  type:  string;
}

export interface CityReadinessInput {
  /** `CityConfig.name` — 프리셋과 로케일 키가 모두 이 이름을 쓴다. */
  name:            string;
  planningReady:   boolean;
  arrivalOptions:  readonly ArrivalOptionLike[];
  /** `CITY_ARRIVAL_DEFAULTS[name]` */
  arrivalDefault:  string | null | undefined;
  /** locale → `tripForm.city_{name}` */
  label:           Readonly<Record<string, string | undefined>>;
  /** locale → `cityLinks.desc{name}` */
  description:     Readonly<Record<string, string | undefined>>;
  /** 일정 생성이 쓰는 도시 중심 좌표가 있는가. 없으면 조용히 다른 도시로 떨어진다. */
  hasCenterCoord:  boolean;
}

/** 무엇이 없어서 열 수 없는가. 빈 배열이면 열어도 된다. */
export type ReadinessGap =
  | "arrival_options"
  | "stay_area"
  | "arrival_default"
  | "arrival_default_not_in_options"
  | "center_coord"
  | `label_${string}`
  | `description_${string}`;

const filled = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().length > 0;

/**
 * 도시 이름은 준비 여부와 무관하게 네 언어에 있어야 한다.
 *
 * 준비 중인 도시도 플래너·홈 카드·City Entry 에 이름이 나온다. 키가 없으면
 * next-intl 이 키 문자열(`city_Jeonju`)을 그대로 화면에 찍는다.
 */
export function missingLabels(input: CityReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  for (const loc of REQUIRED_LOCALES) {
    if (!filled(input.label[loc]))       gaps.push(`label_${loc}`);
    if (!filled(input.description[loc])) gaps.push(`description_${loc}`);
  }
  return gaps;
}

/**
 * 이 도시로 일정을 만들 수 있으려면 더 있어야 하는 것.
 *
 * `planningReady` 가 false 면 비어 있어도 정상이다 — 아직 열지 않은 도시다.
 */
export function missingForPlanning(input: CityReadinessInput): ReadinessGap[] {
  if (!input.planningReady) return [];

  const gaps: ReadinessGap[] = [];
  const options = input.arrivalOptions ?? [];

  if (options.length === 0) gaps.push("arrival_options");
  if (!options.some(o => (STAY_AREA_TYPES as readonly string[]).includes(o.type))) {
    gaps.push("stay_area");
  }
  if (!filled(input.arrivalDefault)) gaps.push("arrival_default");
  else if (!options.some(o => o.value === input.arrivalDefault)) {
    // 옵션에 없는 값이 기본값이면 선택 화면에 아무것도 선택돼 있지 않다.
    gaps.push("arrival_default_not_in_options");
  }
  if (!input.hasCenterCoord) gaps.push("center_coord");

  return gaps;
}

/** 이름 문구까지 합친 전체 판정. 도시를 열어도 되는가. */
export function readinessGaps(input: CityReadinessInput): ReadinessGap[] {
  return [...missingLabels(input), ...missingForPlanning(input)];
}

export function canActivate(input: CityReadinessInput): boolean {
  return missingForPlanning({ ...input, planningReady: true }).length === 0;
}
