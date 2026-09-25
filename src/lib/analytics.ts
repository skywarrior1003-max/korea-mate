declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  // V2-ENV-ISOLATION §11-1 — 비-production 빌드는 어떤 analytics 이벤트도
  // 전송하지 않는다(gtag 부재와 별개의 명시적 fail-closed 이중 차단).
  if ((process.env.NEXT_PUBLIC_APP_ENV ?? "").toLowerCase() !== "production") return;
  window.gtag?.("event", eventName, params);
}
