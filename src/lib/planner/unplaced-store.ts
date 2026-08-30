// 여행별 미배정 보관 — 기간을 줄여 Day 에서 빠진 장소를 **그 여행(itinerary id) 에 묶어** 이 기기에 둔다.
// (TASK-MY-TRIP-FINAL-CLOSURE-CHECK-V1)
//
// 왜 This Trip(koreamate_cart) 이 아닌가: 보관함은 **도시** 단위다. 같은 도시의 다른 여행(Trip B)을 열면
// Trip A 에서 빠진 장소가 그 여행의 후보·새 일정 생성 입력으로 섞여 들어간다. 미배정은 그 여행의 것이다.
// 저장 포맷(__v:2 · scheduled · unscheduled)은 건드리지 않는다 — 서버 레코드는 그대로고, 이 저장소는
// 보관함과 같은 localStorage 계층이다(같은 기기에서 저장·재오픈 뒤에도 남는다).
//
// 항목은 보관함 항목(CartItem) 모양 그대로다 — 추가 패널이 같은 코드로 그리고, 되돌릴 때 같은 경로로 배치한다.

import type { CartItem } from "@/lib/cart";

export const UNPLACED_KEY = "koreamate_unplaced_v1";
export const UNPLACED_EVENT = "koreamate-unplaced-updated";

type Store = Record<string, CartItem[]>;

function readAll(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(UNPLACED_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : {};
  } catch { return {}; }
}

function writeAll(store: Store): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(UNPLACED_KEY, JSON.stringify(store)); } catch { /* quota — 조용히 둔다 */ }
  try { window.dispatchEvent(new Event(UNPLACED_EVENT)); } catch { /* ignore */ }
}

/** 이 여행의 미배정 항목. 여행 id 가 없으면(아직 저장 전) 빈 목록. */
export function readUnplaced(itinId: string | null | undefined): CartItem[] {
  if (!itinId) return [];
  return readAll()[itinId] ?? [];
}

/** 같은 sourceKey 는 한 번만 — 두 번 줄여도 같은 장소가 두 줄이 되지 않는다. 돌려준 값은 실제로 추가된 수. */
export function addUnplaced(itinId: string, items: CartItem[], keyOf: (i: CartItem) => string): number {
  const store = readAll();
  const cur = store[itinId] ?? [];
  const seen = new Set(cur.map(keyOf));
  let n = 0;
  for (const it of items) {
    const k = keyOf(it);
    if (seen.has(k)) continue;
    seen.add(k); cur.push(it); n++;
  }
  store[itinId] = cur;
  writeAll(store);
  return n;
}

/** 다시 Day 에 배치했을 때 — 그 여행의 목록에서만 뺀다. */
export function removeUnplaced(itinId: string, sourceKey: string, keyOf: (i: CartItem) => string): void {
  const store = readAll();
  const cur = store[itinId];
  if (!cur) return;
  const next = cur.filter(i => keyOf(i) !== sourceKey);
  if (next.length === 0) delete store[itinId]; else store[itinId] = next;
  writeAll(store);
}
