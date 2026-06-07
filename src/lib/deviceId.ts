export const DEVICE_ID_KEY = "koreamate_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(DEVICE_ID_KEY, id); } catch {}
    }
    return id ?? crypto.randomUUID();
  } catch {
    // incognito / storage blocked
    return crypto.randomUUID();
  }
}
