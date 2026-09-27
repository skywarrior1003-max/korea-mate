"use client";

// This Trip 내구 동기화 v2 (THIS-TRIP-SYNC-DURABILITY-AND-CONCURRENCY-V1)
//
// 스냅숏 PUT + 700ms debounce 모델을 폐기했다. 이제:
//  · 카트의 모든 쓰기(writeStorage)가 **diff → 작업 단위 op** 로 변환된다
//    (add/remove/update 는 즉시, 연속 reorder 만 직전 reorder 를 교체·coalesce).
//  · op 는 localStorage pending queue(`koreamate_draft_ops_v1`)에 먼저 기록되고
//    순서대로 서버(/api/trip-draft/ops)에 전송된다 — 브라우저가 요청을 끝내지
//    못해도 queue 가 남아 다음 진입에서 재시도된다.
//  · 각 op 는 UUID op_id 를 가진다 — 응답 유실 후 재시도해도 서버가 한 번만
//    적용한다(revision 중복 증가 0·중복 항목 0).
//  · 재시도 시점: 작업 직후 · online 복귀 · hydrate 후 · visibility hidden ·
//    pagehide(keepalive fetch — 유일한 보장으로 삼지 않는다).
//  · 서버 항목 identity = tripCity|sourceKey (로컬 카트 모델과 1:1).
//
// 금지 준수: raw user UUID 저장 0 · 성공 op 재전송 0 · 무제한 queue 증가 없음
// (400 포이즌 op 는 폐기·정상 op 는 상한 도달 시 가장 오래된 것부터 유지 200개)
// · 로그아웃은 flushDraftOps 성공 후에만 진행(§7 — auth-client 가 강제).

import { withAuthHeader } from "@/lib/auth/device-auth-headers";
import { getDeviceId } from "@/lib/deviceId";
import {
  DRAFT_OPS_KEY, draftKeyOf, applyOpLocal, type DraftOp, type Item,
} from "@/lib/trip-draft/draft-ops-core";
export { DRAFT_OPS_KEY, draftKeyOf, applyOpLocal, type DraftOp } from "@/lib/trip-draft/draft-ops-core";


const MAX_QUEUE = 200;




// ── queue 저장 ───────────────────────────────────────────────────────────────
function readQueue(): DraftOp[] {
  try { const r = JSON.parse(localStorage.getItem(DRAFT_OPS_KEY) ?? "[]"); return Array.isArray(r) ? r : []; }
  catch { return []; }
}
function writeQueue(q: DraftOp[]): void {
  try { localStorage.setItem(DRAFT_OPS_KEY, JSON.stringify(q.slice(0, MAX_QUEUE))); } catch { /* storage 불가 — 메모리 전송만 */ }
}
export function pendingOpCount(): number { return readQueue().length; }

function enqueue(op: Omit<DraftOp, "id" | "ts">): void {
  const q = readQueue();
  // 연속 드래그 coalesce — 마지막이 reorder 고 새 op 도 reorder 면 교체(§6)
  if (op.type === "reorder_items" && q.length > 0 && q[q.length - 1].type === "reorder_items") {
    q[q.length - 1] = { ...q[q.length - 1], payload: op.payload, ts: Date.now() };
  } else {
    q.push({ id: crypto.randomUUID(), ts: Date.now(), ...op });
  }
  writeQueue(q);
}

// ── diff → ops (writeStorage 훅) ────────────────────────────────────────────
let applyingServer = false;

/** 카트 쓰기 하나를 작업 단위 op 로 변환해 queue 에 넣고 전송을 시작한다 */
export function recordCartChange(prevRaw: unknown[], nextRaw: unknown[]): void {
  const prev = prevRaw as Item[]; const next = nextRaw as Item[];
  if (typeof window === "undefined" || applyingServer) return;
  const prevMap = new Map(prev.map(i => [draftKeyOf(i), i]));
  const nextMap = new Map(next.map(i => [draftKeyOf(i), i]));

  if (next.length === 0 && prev.length > 1) {
    enqueue({ type: "clear_items", payload: {} });
    void flushDraftOps();
    return;
  }

  let membershipChanged = false;
  for (const [k] of prevMap) if (!nextMap.has(k)) { membershipChanged = true; enqueue({ type: "remove_item", payload: { key: k } }); }
  for (const [k, it] of nextMap) {
    if (!prevMap.has(k)) { membershipChanged = true; enqueue({ type: "add_item", payload: { item: it } }); }
    else {
      const before = prevMap.get(k)!;
      const a = { ...before, sortOrder: 0 }; const b = { ...it, sortOrder: 0 };
      if (JSON.stringify(a) !== JSON.stringify(b)) enqueue({ type: "update_item", payload: { key: k, item: it } });
    }
  }
  // 순서만 바뀐 경우 — membership 이 같을 때만 reorder(§3.2: 순서와 membership 분리)
  if (!membershipChanged && prev.length === next.length && prev.length > 1) {
    const po = prev.map(draftKeyOf).join(","); const no = next.map(draftKeyOf).join(",");
    if (po !== no) enqueue({ type: "reorder_items", payload: { keys: next.map(draftKeyOf) } });
  }
  void flushDraftOps();
}

/**
 * 서버에서 마지막으로 받아 반영한 context. applyingServer 플래그만으로는
 * 부족하다 — writeTripDraft 의 훅이 동적 import 뒤(microtask)에 실행되어
 * 플래그가 이미 풀린 시점에 도착하므로, 값 자체를 기억해 echo 를 걸러낸다.
 * (같은 값의 재전송은 어차피 서버 no-op 이라 거르는 것이 항상 옳다.)
 */
let lastServerContext: string | null = null;

/** '이 조건으로 시작' 확정 여행 조건 동기화(§8) */
export function recordTripContext(city: string, startDate: string, endDate: string): void {
  if (typeof window === "undefined" || applyingServer) return;
  if (JSON.stringify({ city, startDate, endDate }) === lastServerContext) return; // 서버 반영 echo
  enqueue({ type: "set_trip_context", payload: { context: { city, startDate, endDate } } });
  void flushDraftOps();
}

// ── 전송 ────────────────────────────────────────────────────────────────────
let inFlight: Promise<{ ok: boolean }> | null = null;

/**
 * 토큰 획득 유계 대기. 세션 SDK 내부가 어떤 이유로든 멈추면 여기서 무한히
 * 기다리는 대신 재시도로 돌린다 — inFlight 가 영구 고착되어 flush 파이프라인
 * 전체가 조용히 죽는 모드를 없앤다(§5: 어떤 실패도 유실·정지가 아니라 재시도).
 * 시간 초과 시 무인증 전송으로 폴백하지 않는다 — linked 기기는 서버가 401 로
 * 거부하므로(fail closed) 헛 요청만 늘린다.
 */
const TOKEN_WAIT_MS = 3000;

async function postOp(op: DraftOp, keepalive: boolean): Promise<"done" | "drop" | "retry"> {
  let headers: Record<string, string>;
  try {
    headers = await Promise.race([
      withAuthHeader({ "content-type": "application/json", "x-device-id": getDeviceId() }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("auth-timeout")), TOKEN_WAIT_MS)),
    ]);
  } catch { return "retry"; } // 토큰 획득 지연·실패 — queue 보존 후 다음 트리거
  let res: Response;
  try {
    res = await fetch("/api/trip-draft/ops", {
      method: "POST", headers, keepalive,
      body: JSON.stringify({ op_id: op.id, type: op.type, payload: op.payload }),
    });
  } catch { return "retry"; } // 네트워크 — queue 보존
  if (res.ok) return "done";
  if (res.status === 400 || res.status === 413) return "drop"; // 포이즌 op — queue 오염 방지
  return "retry"; // 401/403(세션 갱신 대기)·5xx — 보존 후 다음 트리거에서 재시도
}

/**
 * pending queue 를 순서대로 서버에 반영한다. 성공한 op 만 제거한다.
 * 반환 {ok:true} = queue 비움(로그아웃 flush 판정에 사용).
 */
export function flushDraftOps(opts: { keepalive?: boolean } = {}): Promise<{ ok: boolean }> {
  if (typeof window === "undefined") return Promise.resolve({ ok: true });
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      for (;;) {
        const q = readQueue();
        if (q.length === 0) return { ok: true };
        const r = await postOp(q[0], opts.keepalive ?? false);
        if (r === "retry") return { ok: false };
        const q2 = readQueue();
        if (q2.length > 0 && q2[0].id === q[0].id) { q2.shift(); writeQueue(q2); }
      }
    } finally { inFlight = null; }
  })();
  return inFlight;
}

// ── 재시도 트리거(§5) — 모듈 로드 시 1회 등록 ───────────────────────────────
let listenersOn = false;
export function ensureRetryListeners(): void {
  if (typeof window === "undefined" || listenersOn) return;
  listenersOn = true;
  window.addEventListener("online", () => { void flushDraftOps(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushDraftOps({ keepalive: true });
  });
  window.addEventListener("pagehide", () => { void flushDraftOps({ keepalive: true }); });
}

// ── hydrate ─────────────────────────────────────────────────────────────────
let hydratedOnce = false;

/** 서버 draft → 로컬(그 위에 pending op 를 재적용해 미전송 변경을 잃지 않는다) */
export async function hydrateTripDraft(
  applyServer: (items: unknown[]) => void,
  readLocal: () => unknown[],
  applyContext?: (ctx: { city: string; startDate: string; endDate: string }) => void,
): Promise<void> {
  if (typeof window === "undefined" || hydratedOnce) return;
  hydratedOnce = true;
  ensureRetryListeners();
  try {
    const headers = await withAuthHeader({ "x-device-id": getDeviceId() });
    const res = await fetch("/api/trip-draft", { headers });
    if (!res.ok) { hydratedOnce = false; void flushDraftOps(); return; }
    const body = (await res.json()) as { items?: Item[]; context?: { city?: string; startDate?: string; endDate?: string } | null; updated_at?: string | null };
    const server = Array.isArray(body.items) ? body.items : [];
    if (body.updated_at === null && server.length === 0) {
      // 서버 도입 전 기존 로컬 카트 — 항목 단위 op 로 1회 이관
      const local = readLocal() as Item[];
      for (const it of local) enqueue({ type: "add_item", payload: { item: it } });
      void flushDraftOps();
      return;
    }
    // 서버 기준 + 미전송 pending 재적용(§3.1: 실패해도 로컬 변경이 사라지지 않는다)
    let view = server;
    for (const op of readQueue()) view = applyOpLocal(view, op);
    applyingServer = true;
    try { applyServer(view); } finally { applyingServer = false; }
    const c = body.context;
    if (c && c.city && c.startDate && c.endDate && applyContext) {
      // 훅이 microtask 뒤에 실행돼 플래그가 이미 풀려 있으므로 값으로도 기억한다
      lastServerContext = JSON.stringify({ city: c.city, startDate: c.startDate, endDate: c.endDate });
      applyingServer = true; // 서버 값 반영이 다시 op 를 만들지 않게
      try { applyContext({ city: c.city, startDate: c.startDate, endDate: c.endDate }); }
      finally { applyingServer = false; }
    }
    void flushDraftOps();
  } catch { hydratedOnce = false; }
}

