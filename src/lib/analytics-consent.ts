// 사용 통계(Google Analytics) 선택 동의 — GA-CONSENT-V1 (구조: GA-CONSENT-AND-AUTH-WORDING-CLOSEOUT-V1)
//
// 왜 동의를 먼저 받나
//   GA 는 서비스 제공에 꼭 필요한 처리가 아니다(통계 도구). 그래서 계약 이행에 필요한
//   처리위탁(개인정보 보호법 제28조의8①3호)으로 설명하지 않고, 이용자가 고른 경우에만 켠다.
//
// 동의는 두 개다 — 한 버튼으로 묶지 않는다
//   ① 수집·이용 동의(제15조①1호, 고지 사항 제15조②) ② 국외 이전 동의(제28조의8①1호 '별도의 동의',
//   동의 전 고지 사항 제28조의8②). 제22조①은 동의 사항을 구분해 각각 받도록 한다.
//   둘 다 켜져 있을 때만 GA 를 싣는다 — 하나만 켠 상태는 '수집 0'.
//
// 계약
//   - 선택이 없거나(처음 방문·나중에) 버전이 바뀌면 gtag 를 싣지 않는다 — Google 요청 0, _ga 쿠키 0.
//   - 두 동의가 모두 저장된 뒤에만 gtag.js 를 싣는다. 거부해도 모든 기능을 쓸 수 있다.
//   - 철회하면 즉시 전송을 끄고(ga-disable 플래그) 이 사이트의 _ga 쿠키를 지운다.
//     이미 Google 로 보낸 과거 통계는 Google 쪽 보관기간이 지나야 사라진다(즉시 삭제를 약속하지 않는다).
//   - 선택은 이 브라우저의 로컬 저장소에만 둔다(서버로 보내지 않는다).

/** 고지 항목(받는 자·항목·보관기간 등)이 바뀌면 올린다 — 이전 선택은 무효가 되고 다시 묻는다 */
export const ANALYTICS_CONSENT_VERSION = "ga-2026-09-30";
export const ANALYTICS_CONSENT_KEY = "gkm-analytics-consent";
/** 이전 형식(단일 허용/거부) — 읽지 않고 지운다 */
export const LEGACY_CONSENT_KEYS = ["gkm-analytics-consent-v1"];
/** '나중에' — 이번 세션 동안만 안내를 닫는다(결정 보류, 수집 0) */
export const ANALYTICS_CONSENT_LATER_KEY = "gkm-analytics-consent-later";
/** 선택이 바뀌면 같은 창의 다른 컴포넌트(설정 스위치 등)에 알린다 */
export const ANALYTICS_CONSENT_EVENT = "gkm:analytics-consent";

export interface AnalyticsConsentState {
  v: string;
  /** 수집·이용 동의 */
  collect: boolean;
  /** 국외 이전 동의 */
  transfer: boolean;
  /** 저장 시각(ISO) — 이 브라우저 안의 기록일 뿐 서버로 보내지 않는다 */
  at: string;
}

/** 현재 버전·정확한 형식만 유효. 그 밖(이전 버전·손상·문자열 참)은 '선택 없음' */
export function parseConsentState(raw: string | null | undefined): AnalyticsConsentState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<AnalyticsConsentState>;
    if (!o || o.v !== ANALYTICS_CONSENT_VERSION) return null;
    if (typeof o.collect !== "boolean" || typeof o.transfer !== "boolean") return null;
    return { v: o.v, collect: o.collect, transfer: o.transfer, at: typeof o.at === "string" ? o.at : "" };
  } catch { return null; }
}

/** GA 를 켜도 되는가 — 두 동의가 모두 있어야 한다 */
export function gaAllowed(s: AnalyticsConsentState | null): boolean {
  return !!s && s.collect === true && s.transfer === true;
}

export function readConsentState(): AnalyticsConsentState | null {
  try { return parseConsentState(localStorage.getItem(ANALYTICS_CONSENT_KEY)); } catch { return null; }
}

/** 저장된 값이 있는데 현재 버전으로 읽히지 않는가(이전 버전·이전 형식) — 다시 물어야 하고 남은 쿠키를 정리한다 */
export function hasStaleConsent(): boolean {
  try {
    const raw = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (raw && !parseConsentState(raw)) return true;
    return LEGACY_CONSENT_KEYS.some(k => localStorage.getItem(k) !== null);
  } catch { return false; }
}

export function clearStaleConsent(): void {
  try {
    const raw = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (raw && !parseConsentState(raw)) localStorage.removeItem(ANALYTICS_CONSENT_KEY);
    for (const k of LEGACY_CONSENT_KEYS) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

export function writeConsentState(choice: { collect: boolean; transfer: boolean }): AnalyticsConsentState {
  const s: AnalyticsConsentState = { v: ANALYTICS_CONSENT_VERSION, collect: choice.collect, transfer: choice.transfer, at: new Date().toISOString() };
  try { localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify(s)); } catch { /* 저장 불가 브라우저 — 이번 방문만 적용 */ }
  try { sessionStorage.removeItem(ANALYTICS_CONSENT_LATER_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: s })); } catch { /* ignore */ }
  return s;
}

export function deferConsent(): void {
  try { sessionStorage.setItem(ANALYTICS_CONSENT_LATER_KEY, "1"); } catch { /* ignore */ }
}

export function consentDeferred(): boolean {
  try { return sessionStorage.getItem(ANALYTICS_CONSENT_LATER_KEY) === "1"; } catch { return false; }
}

/** GA 측정 ID 형식 — 스크립트 URL·전역 플래그 이름에 들어가므로 형식 밖 값은 쓰지 않는다 */
export const GA_ID_RE = /^G-[A-Z0-9]{4,16}$/;

/**
 * 이 빌드에서 GA 가 켜질 수 있는가(layout 의 환경 게이트와 같은 규칙) — 켜질 수 없는 빌드(Preview·로컬)에서는
 * 첫 방문 안내에 통계 선택을 보이지 않는다. NEXT_PUBLIC_* 는 빌드 때 굳는 공개 값이다(비밀 아님).
 */
export function configuredGaId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA4_ID ?? "";
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? "").toLowerCase();
  const mode = (process.env.NEXT_PUBLIC_ANALYTICS_MODE ?? "").toLowerCase();
  const allows = appEnv === "production" ? mode !== "off" : mode === "test";
  return allows && id !== "나중에_입력" && GA_ID_RE.test(id) ? id : null;
}

type GaWindow = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } & Record<string, unknown>;

/** 두 동의가 모두 있을 때만 부른다. 두 번 불러도 스크립트는 한 번만 싣는다. */
export function loadGtag(gaId: string): void {
  if (!GA_ID_RE.test(gaId)) return;
  const w = window as unknown as GaWindow;
  w[`ga-disable-${gaId}`] = false;
  blockGaTransport(false); // 같은 페이지에서 철회 뒤 다시 동의한 경우
  if (document.getElementById("gkm-gtag")) return;
  w.dataLayer = w.dataLayer || [];
  // gtag.js 는 dataLayer 항목이 배열이 아닌 Arguments 객체여야 명령으로 읽는다(공식 스니펫과 같은 형태)
  // eslint-disable-next-line prefer-rest-params
  w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", gaId);
  const s = document.createElement("script");
  s.id = "gkm-gtag";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(s);
}

/** 이 사이트 도메인에 걸린 GA 쿠키 이름(_ga, _ga_<스트림>) */
export function gaCookieNames(cookieHeader: string): string[] {
  return cookieHeader.split(";").map(c => c.trim().split("=")[0]).filter(n => n === "_ga" || n.startsWith("_ga_"));
}

/** 쿠키를 지울 도메인 후보 — 호스트 자신과 상위 도메인(GA 는 최상위 등록 도메인에 쿠키를 둔다) */
export function cookieDomains(hostname: string): string[] {
  const parts = hostname.split(".");
  const out = [""];
  for (let i = 0; i < parts.length - 1; i++) out.push("." + parts.slice(i).join("."));
  return out;
}

/** GA 수집 호스트 — 철회 뒤 이 페이지에서 나가는 요청을 막을 대상 */
export const GA_HOST_RE = /(^|\.)(google-analytics\.com|analytics\.google\.com)$/;

export function isGaCollectUrl(url: string): boolean {
  try { return GA_HOST_RE.test(new URL(url, location.href).hostname); } catch { return false; }
}

type TransportWindow = Window & { __gkmGaBlocked?: boolean; __gkmGaGuard?: boolean };

/**
 * 철회 직후 이 페이지의 GA 전송을 막는다.
 *
 * 왜 ga-disable 플래그만으로 부족한가
 *   화면을 옮긴 직후 gtag 가 page_view 를 몇 초 늦게 보내는 경우가 실측됐다(로컬 빌드, 2026-09-29).
 *   그 사이 철회하면 ga-disable 을 켜도 이미 줄에 선 page_view 1건이 철회 뒤에 나갔다.
 *   그래서 전송 수단(sendBeacon·fetch·XHR·이미지 픽셀)에서 GA 호스트만 막는다. 다른 요청은 건드리지 않는다.
 *   다시 동의하면 loadGtag 가 막음을 푼다. 다음 화면부터는 gtag 자체를 싣지 않는다.
 */
function blockGaTransport(on: boolean): void {
  const w = window as TransportWindow;
  w.__gkmGaBlocked = on;
  if (!on || w.__gkmGaGuard) return;
  w.__gkmGaGuard = true;
  const blocked = (u: unknown) => w.__gkmGaBlocked === true && isGaCollectUrl(String(u instanceof Request ? u.url : u));
  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => (blocked(url) ? true : beacon(url, data));
  }
  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    blocked(input) ? Promise.resolve(new Response(null, { status: 204 })) : origFetch(input, init)) as typeof fetch;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    // 막힌 GA 요청은 존재하지 않는 로컬 주소로 돌려 조용히 실패시킨다
    const target = blocked(url) ? "about:blank" : url;
    return (origOpen as (...a: unknown[]) => void).call(this, method, target, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (src?.set && src.get) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true, enumerable: src.enumerable, get: src.get,
      set(this: HTMLImageElement, v: string) { if (!blocked(v)) src.set!.call(this, v); },
    });
  }
}

/** 철회·거부 — 이미 실린 gtag 의 전송을 끄고 _ga 쿠키를 지운다(Google 에 이미 보낸 데이터는 지우지 못한다) */
export function disableGtag(gaId: string): void {
  if (GA_ID_RE.test(gaId)) (window as unknown as GaWindow)[`ga-disable-${gaId}`] = true;
  if (document.getElementById("gkm-gtag")) blockGaTransport(true);
  for (const name of gaCookieNames(document.cookie)) {
    for (const d of cookieDomains(location.hostname)) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}
