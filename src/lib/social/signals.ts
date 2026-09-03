// Social raw-signal 클라이언트 — 전부 fire-and-forget.
//
// 이 파일의 호출은 사용자 경험의 일부가 아니다. 실패해도(오프라인·테이블 미적용·
// 광고차단기) Save/Share 기능은 기기 안에서 그대로 동작한다. 그래서 어떤 호출도
// await 하지 않고, 어떤 에러도 화면으로 올리지 않는다.
//
// count 는 사용자에게 공개되지 않는다 — 여기는 기록만 한다(GET 없음).

import type { EventItem } from "@/lib/cart";
import { getItemSourceKey, parseCitySpotId } from "@/lib/place-identity";
import { getDeviceId } from "@/lib/deviceId";
import type { ShareMethod, ShareTargetType } from "./social-actions-core";

function fire(path: string, body: unknown): void {
  if (typeof window === "undefined" || typeof fetch === "undefined") return;
  try {
    void fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => { /* best-effort — 조용히 무시 */ });
  } catch { /* 동일 */ }
}

/**
 * Save/Unsave 의 서버측 ranking signal. DB 장소(city_spot)일 때만 —
 * local-info 등 파일 기반 항목은 서버 대상이 없어 보내지 않는다.
 */
export function reportPlaceSaveSignal(place: EventItem, saved: boolean): void {
  const id = parseCitySpotId(getItemSourceKey(place));
  if (!id) return;
  fire("/api/place-save", {
    target_type: "city_spot",
    target_key: id,
    action: saved ? "save" : "unsave",
  });
}

/** Share 행동 기록 — 공유 UI 에서 share/copy 가 일어났다는 사실만 */
export function reportShareEvent(
  targetType: ShareTargetType, targetKey: string, method: ShareMethod,
): void {
  if (!targetKey) return;
  fire("/api/share-event", { target_type: targetType, target_key: targetKey, method });
}

/** /shared/<uuid> 형태의 공유 URL 에서 여행 id 를 꺼낸다(없으면 null) */
export function shareIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/shared\/([0-9a-fA-F-]{36})/.exec(url);
  return m ? m[1].toLowerCase() : null;
}
