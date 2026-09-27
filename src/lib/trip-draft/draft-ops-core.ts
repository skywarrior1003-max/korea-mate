// This Trip draft op 순수 코어 — alias-free(node 가드/기능 공용)
// (THIS-TRIP-SYNC-DURABILITY-AND-CONCURRENCY-V1)

export const DRAFT_OPS_KEY = "koreamate_draft_ops_v1";

type OpType = "add_item" | "update_item" | "remove_item" | "reorder_items" | "clear_items" | "set_trip_context";
export interface DraftOp { id: string; type: OpType; payload: Record<string, unknown>; ts: number }

type Item = Record<string, unknown> & { sourceKey?: string; id?: string; tripCity?: string; sortOrder?: number };

/** 서버와 동일한 복합 identity — tripCity|sourceKey(없으면 id) */
export function draftKeyOf(it: Item): string {
  const sk = typeof it.sourceKey === "string" && it.sourceKey ? it.sourceKey : String(it.id ?? "");
  return `${typeof it.tripCity === "string" ? it.tripCity : ""}|${sk}`;
}

export type { Item };

/** 서버 RPC 와 같은 규칙의 로컬 미리보기 적용(뷰 전용) */
export function applyOpLocal(items: Item[], op: DraftOp): Item[] {
  if (op.type === "clear_items") return [];
  if (op.type === "add_item") {
    const it = op.payload.item as Item;
    const k = draftKeyOf(it);
    if (items.some(x => draftKeyOf(x) === k)) return items;
    const max = items.reduce((m, x) => Math.max(m, Number(x.sortOrder) || 0), 0);
    return [...items, { ...it, sortOrder: max + 1 }];
  }
  if (op.type === "remove_item") return items.filter(x => draftKeyOf(x) !== op.payload.key);
  if (op.type === "update_item") {
    return items.map(x => draftKeyOf(x) === op.payload.key
      ? { ...(op.payload.item as Item), sortOrder: x.sortOrder }
      : x);
  }
  if (op.type === "reorder_items") {
    const keys = op.payload.keys as string[];
    const byKey = new Map(items.map(x => [draftKeyOf(x), x]));
    const head = keys.map(k => byKey.get(k)).filter((x): x is Item => !!x);
    const rest = items.filter(x => !keys.includes(draftKeyOf(x)));
    return [...head, ...rest].map((x, i) => ({ ...x, sortOrder: i + 1 }));
  }
  return items;
}
