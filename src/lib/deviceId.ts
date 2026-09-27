export const DEVICE_ID_KEY = "koreamate_device_id";

let memoryDeviceId: string | null = null;

/** 로그아웃 rotation 에서 살아남는 비개인 선호 키(튜토리얼 상태) — 계정 데이터 아님 */
const ROTATION_PRESERVE = new Set([
  "koreamate_journey_guide_v1",
  "koreamate_this_trip_coach_v1",
]);

/**
 * 로그아웃 device rotation (LINKING-V1 §9) — 유일한 rotation 경로.
 * ① 새 익명 UUID 로 교체(기존 ID 재사용 금지) ② 개인 콘텐츠성 로컬 캐시
 * (koreamate_* — 보존 목록 제외)와 sessionStorage 제거.
 * 서버의 old device mapping 은 건드리지 않는다 — old ID 는 linked 로 남아
 * 무세션 접근이 서버에서 거부된다(§2.4).
 */
export function rotateDeviceId(): string {
  const next = crypto.randomUUID();
  memoryDeviceId = next;
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("koreamate_") && !ROTATION_PRESERVE.has(k)) drop.push(k);
    }
    for (const k of drop) localStorage.removeItem(k);
    localStorage.setItem(DEVICE_ID_KEY, next);
  } catch { /* storage 불가 환경 — memory rotation 만으로도 새 신원이다 */ }
  try { sessionStorage.clear(); } catch { /* 동일 */ }
  return next;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(DEVICE_ID_KEY, id); } catch {}
    }
    const resolved = id ?? crypto.randomUUID();
    memoryDeviceId = resolved;
    return resolved;
  } catch {
    // incognito / storage blocked — reuse module-level memory UUID for session stability
    if (!memoryDeviceId) {
      memoryDeviceId = crypto.randomUUID();
    }
    return memoryDeviceId;
  }
}
