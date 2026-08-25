// 하루를 하나의 연속 타임라인으로 펼치는 순수 로직.
//
// 예전에는 Morning/Lunch/Afternoon/Evening 마다 불투명 카드를 하나씩 그렸다.
// 그러면 하루가 네 덩어리로 보이고, 점선도 카드 안에서만 이어져 흐름이 끊긴다.
// 여기서는 슬롯 분류·정렬은 그대로 두고 **평평한 한 줄**로 만든 뒤, 각 항목이
// 위/아래로 선을 그려야 하는지와 슬롯 라벨을 달아야 하는지만 계산한다.
//
// 시각은 만들지 않는다. 스케줄러가 준 시간을 그대로 쓰거나, 없으면 슬롯 이름만
// 보조 라벨로 보여준다. "09:00" 같은 값을 여기서 지어내지 않는다.

/** 화면 순서 — 내부 분류·정렬은 기존 TIME_SLOTS 와 같다 */
export const SLOT_ORDER = ["morning", "lunch", "afternoon", "evening"] as const;
export type SlotKey = (typeof SLOT_ORDER)[number];

export interface TimelineInput<T> {
  item: T;
  /** 원래 배열에서의 위치 — 삭제·순서변경 handler 가 이 값을 쓴다 */
  index: number;
  slot: string;
}

export interface TimelineRow<T> {
  item: T;
  index: number;
  slot: SlotKey;
  /** 이 슬롯의 첫 항목일 때만 라벨을 붙인다 — 같은 슬롯에 두 번 찍지 않는다 */
  showSlotLabel: boolean;
  /** 아이콘 위쪽 선 — 첫 항목은 없다 */
  railAbove: boolean;
  /** 아이콘 아래쪽 선 — 마지막 항목은 없다 */
  railBelow: boolean;
}

function toSlotKey(v: string): SlotKey {
  const k = (v ?? "").toLowerCase().trim();
  return (SLOT_ORDER as readonly string[]).includes(k) ? (k as SlotKey) : "morning";
}

/**
 * 하루치 항목을 슬롯 순서대로 평평하게 편다.
 *
 * 슬롯 경계에서 선이 끊기지 않는다 — railAbove/railBelow 는 슬롯이 아니라
 * **하루 전체에서의 위치**로만 정해진다. 장소가 없는 슬롯은 아예 행이 없으므로
 * 빈 라벨도 생기지 않는다.
 */
export function buildTimeline<T>(
  items: readonly TimelineInput<T>[],
  /** 정렬 순서. 기본값은 SLOT_ORDER — 호출부가 기존 TIME_SLOTS 를 그대로 넘겨
   *  하나의 정의만 남기도록 한다. */
  order: readonly string[] = SLOT_ORDER,
): TimelineRow<T>[] {
  const rows: TimelineRow<T>[] = [];
  const labeled = new Set<SlotKey>();

  for (const slot of order.map(toSlotKey)) {
    for (const it of items) {
      if (toSlotKey(it.slot) !== slot) continue;
      rows.push({
        item: it.item,
        index: it.index,
        slot,
        showSlotLabel: !labeled.has(slot),
        railAbove: false,   // 아래에서 전체 길이를 보고 채운다
        railBelow: false,
      });
      labeled.add(slot);
    }
  }

  const last = rows.length - 1;
  for (let i = 0; i <= last; i++) {
    rows[i].railAbove = i > 0;
    rows[i].railBelow = i < last;
  }
  return rows;
}

/** 화면에 실제로 등장하는 슬롯만 — 감사·테스트용 */
export function visibleSlots<T>(rows: readonly TimelineRow<T>[]): SlotKey[] {
  return rows.filter(r => r.showSlotLabel).map(r => r.slot);
}

// ── B안 (TASK-MY-TRIP-TIMELINE-B-AND-DEDUP-V1-R1) ─────────────────────────────
// 화면은 하루를 3구간(오전·오후·저녁)으로만 나눈다. 내부 4슬롯은 그대로 두고
// 표시 구간으로만 접는다 — 점심은 오후다.
export const DISPLAY_SECTIONS = ["morning", "afternoon", "evening"] as const;
export type DisplaySection = (typeof DISPLAY_SECTIONS)[number];

export function displaySectionOf(slot: string): DisplaySection {
  const k = toSlotKey(slot);
  return k === "morning" ? "morning" : k === "evening" ? "evening" : "afternoon";
}

export interface OrderedRow<T> {
  item: T;
  /** 원래 배열 위치 = 화면 순번-1. 순번은 지도·편집 리스트와 같은 하나의 체계다. */
  index: number;
  section: DisplaySection;
  /** 구간 헤더를 이 행 위에 그린다 — 구간이 처음 나타날 때만 */
  showSectionLabel: boolean;
  railAbove: boolean;
  railBelow: boolean;
}

/**
 * 배열 순서를 그대로 편다(순서 계약이 이미 정한 순서다). 구간 헤더는 단조롭게만
 * 나온다 — 나중 항목의 구간이 앞선 구간보다 이르면(untimed 기본값 등) 새 헤더를
 * 만들지 않고 현재 구간 아래에 둔다. 순번을 재배열하지 않는다.
 */
export function buildOrderedTimeline<T>(items: readonly TimelineInput<T>[]): OrderedRow<T>[] {
  const rank = (s: DisplaySection) => DISPLAY_SECTIONS.indexOf(s);
  const rows: OrderedRow<T>[] = [];
  let current: DisplaySection | null = null;
  for (const it of items) {
    const sec = displaySectionOf(it.slot);
    const advance = current === null || rank(sec) > rank(current);
    if (advance) current = sec;
    rows.push({ item: it.item, index: it.index, section: current!, showSectionLabel: advance, railAbove: false, railBelow: false });
  }
  const last = rows.length - 1;
  for (let i = 0; i <= last; i++) { rows[i]!.railAbove = i > 0; rows[i]!.railBelow = i < last; }
  return rows;
}
