export const DEVICE_ID_KEY = "koreamate_device_id";

let memoryDeviceId: string | null = null;

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
