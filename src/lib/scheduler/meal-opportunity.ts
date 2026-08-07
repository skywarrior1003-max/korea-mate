// 식사는 **비율**이 아니라 **기회**로 결정한다.
//
// 왜 비율이면 안 되나
//   부산에 식당 데이터가 327개 들어오자 후보 상위 30개의 80~93% 가 식당이 됐다.
//   그래서 직전 작업에서 후보를 카테고리별로 균등하게 잘라 33% 로 낮췄다.
//   그런데 33% 도 결국 고정 비율이다. DB 에 식당이 몇 개 있느냐가 하루에 밥을
//   몇 번 먹느냐를 정하는 구조는 그대로다.
//
// 사람은 그렇게 여행하지 않는다.
//   하루를 온전히 쓰면 아침·점심·저녁 세 번의 **기회**가 있다.
//   오후에 도착하면 아침과 점심 기회는 없다. 아침에 떠나면 그날 저녁은 없다.
//   그 시간대에 고정 일정이 있으면 그 끼니는 건너뛴다.
//   밥 먹으러 반대편 동네까지 갔다가 돌아오지 않는다.
//
// 그래서 이 모듈은 "그날 실제로 존재하는 식사 기회"만 계산한다.
// 몇 퍼센트를 채우라고 말하지 않는다.
//
// 지금 할 수 없는 것 — 영업시간을 모른다.
//   신규 부산 식당 326건의 opening_hours 는 전부 NULL 이고 HC-2 는 아직 stub 이다.
//   그래서 "이 시간에 실제로 문을 여는가" 는 강제하지 못한다. 시간대만 본다.
//   영업시간 parser 와 HC-2 가 붙으면 그때 결합한다.

/** 스케줄러 정책 값이다. 관광 사실이 아니다. 조정은 이 한 곳에서 한다. */
export type MealKind = "breakfast" | "lunch" | "dinner";

export const MEAL_KINDS: readonly MealKind[] = ["breakfast", "lunch", "dinner"];

/**
 * 끼니별 시간대(분). 여행자 기준의 일반적인 식사 시간이며 도시·문화별 최적값이 아니다.
 *   breakfast 07:00–10:00 · lunch 11:00–14:30 · dinner 17:00–21:00
 */
export const MEAL_TIME_RANGES: Readonly<Record<MealKind, readonly [number, number]>> = {
  breakfast: [7 * 60, 10 * 60],
  lunch:     [11 * 60, 14 * 60 + 30],
  dinner:    [17 * 60, 21 * 60],
};

/**
 * 이만큼도 겹치지 않으면 식사 기회로 세지 않는다.
 * 20:55 에 하루가 끝나는데 저녁을 끼워 넣는 일을 막는다.
 */
export const MIN_MEAL_OVERLAP_MINUTES = 45;

export interface MealWindow {
  kind:          MealKind;
  start_minutes: number;   // 하루 일정 창과 겹친 구간만
  end_minutes:   number;
}

/**
 * 그날 실제로 존재하는 식사 기회.
 *
 * dayStart/dayEnd 는 이미 도착·출발이 반영된 값이다(스케줄러 input.start_time/end_time).
 * 따라서 오후 도착이면 아침·점심이 자동으로 빠지고, 오전 출발이면 저녁이 빠진다.
 */
export function activeMealWindows(
  dayStartMinutes: number,
  dayEndMinutes: number,
): MealWindow[] {
  const out: MealWindow[] = [];
  for (const kind of MEAL_KINDS) {
    const [from, to] = MEAL_TIME_RANGES[kind];
    const start = Math.max(from, dayStartMinutes);
    const end   = Math.min(to,   dayEndMinutes);
    if (end - start >= MIN_MEAL_OVERLAP_MINUTES) {
      out.push({ kind, start_minutes: start, end_minutes: end });
    }
  }
  return out;
}

/** 이 시각이 어느 식사 기회에 속하는가. 어디에도 속하지 않으면 null. */
export function mealWindowAt(
  minutes: number,
  windows: readonly MealWindow[],
): MealWindow | null {
  return windows.find(w => minutes >= w.start_minutes && minutes < w.end_minutes) ?? null;
}

/** 스케줄러가 식음으로 취급하는 카테고리. taxonomy 에 없는 값을 만들지 않는다. */
const FOOD_CATEGORIES = new Set(["food", "cafe", "restaurant"]);

export function isFoodCategory(category: string | null | undefined): boolean {
  return FOOD_CATEGORIES.has(String(category ?? "").toLowerCase());
}

export interface AutoMealDecision {
  allowed: boolean;
  reason:  string;
  meal:    MealKind | null;
}

/**
 * **자동으로 채우는** 식당을 이 자리에 놓아도 되는가.
 *
 * 규칙은 둘뿐이다.
 *   ① 그 시각이 실제 식사 기회 안이어야 한다
 *   ② 그 끼니는 아직 자동 식당으로 채워지지 않았어야 한다 (끼니당 최대 1)
 *
 * 사용자가 직접 고른 식당(Selected)에는 이 규칙을 적용하지 않는다 — §6.
 * "이미 세 끼가 찼으니 네 번째 Selected 식당을 지운다" 는 하지 않는다.
 *
 * 비율은 어디에도 없다. 몇 퍼센트를 채우라고 말하지 않는다.
 */
export function canPlaceAutoMeal(
  startMinutes: number,
  windows: readonly MealWindow[],
  filledMeals: ReadonlySet<MealKind>,
): AutoMealDecision {
  const w = mealWindowAt(startMinutes, windows);
  if (!w) return { allowed: false, reason: "식사 기회 시간대가 아니다", meal: null };
  if (filledMeals.has(w.kind)) {
    return { allowed: false, reason: `${w.kind} 는 이미 채워졌다`, meal: w.kind };
  }
  return { allowed: true, reason: "열린 식사 기회", meal: w.kind };
}
