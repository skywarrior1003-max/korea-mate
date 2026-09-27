"use client";

// This Trip 서버 동기화 (THIS-TRIP-SYNC-V1 §7)
//
// 서버(/api/trip-draft)가 진실이고 localStorage 카트는 화면 캐시다.
//  · hydrate: This Trip 표면 진입 시 서버 스냅숏을 읽어 로컬을 교체한다
//    (다른 기기의 변경이 새로고침/재진입으로 정확히 반영). 서버에 행이 없고
//    로컬만 있으면 — 서버 도입 전 기존 카트 — 1회 밀어올린다.
//  · push: 카트 쓰기(writeStorage)마다 디바운스로 전체 스냅숏 PUT.
//    linked device 의 무세션 요청은 서버가 거부하므로(401) 조용히 버려진다 —
//    회전 후 새 게스트 기기는 자기 축으로 다시 시작한다.
//  · 계정 device 목록을 받지 않고, 여러 device 를 반복 호출하지 않는다 —
//    owner 축 계산은 전부 서버 몫이다.
// 폴링·실시간 구독 없음(§7 계약). token·raw id 로그 없음.

import { withAuthHeader } from "@/lib/auth/device-auth-headers";
import { getDeviceId } from "@/lib/deviceId";

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let applyingServer = false; // hydrate 적용 중 push 루프 방지
let hydratedOnce = false;

async function headers(): Promise<Record<string, string>> {
  return withAuthHeader({ "content-type": "application/json", "x-device-id": getDeviceId() });
}

/** 카트 쓰기 훅 — cart.ts writeStorage 가 호출한다(700ms 디바운스 스냅숏) */
export function scheduleDraftPush(readSnapshot: () => unknown[]): void {
  if (typeof window === "undefined" || applyingServer) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void (async () => {
      const items = readSnapshot();
      await fetch("/api/trip-draft", {
        method: "PUT", headers: await headers(), body: JSON.stringify({ items }),
        keepalive: true,
      });
    })().catch(() => { /* best-effort — 다음 쓰기/hydrate 가 수렴시킨다 */ });
  }, 700);
}

/**
 * This Trip 표면 진입 시 1회 호출. 서버 스냅숏 → 로컬 교체.
 * applyServer 는 cart.ts 가 넘긴다(스토리지 형식·이벤트 발행을 카트가 소유).
 */
export async function hydrateTripDraft(
  applyServer: (items: unknown[]) => void,
  readLocal: () => unknown[],
): Promise<void> {
  if (typeof window === "undefined" || hydratedOnce) return;
  hydratedOnce = true;
  try {
    const res = await fetch("/api/trip-draft", { headers: await headers() });
    if (!res.ok) { hydratedOnce = false; return; } // 401(회전 전 잔존 세션 등)·5xx — 다음 진입에 재시도
    const body = (await res.json()) as { items?: unknown[]; updated_at?: string | null };
    const server = Array.isArray(body.items) ? body.items : [];
    if (body.updated_at === null && server.length === 0) {
      // 서버 도입 전 로컬 카트 — 최초 1회 이관
      const local = readLocal();
      if (local.length > 0) scheduleDraftPush(() => local);
      return;
    }
    applyingServer = true;
    try { applyServer(server); } finally { applyingServer = false; }
  } catch { hydratedOnce = false; /* 오프라인 — 로컬 캐시 그대로 */ }
}
