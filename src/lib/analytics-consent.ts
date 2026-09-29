// 사용 통계(Google Analytics) 선택 동의 — GA-CONSENT-V1
//
// 왜 동의를 먼저 받나
//   GA 는 서비스 제공에 꼭 필요한 처리가 아니다(통계 도구). 그래서 계약 이행에 필요한
//   처리위탁(개인정보 보호법 제28조의8①3호)으로 설명하지 않고, 이용자가 고른 경우에만
//   켠다(제15조①1호 동의 + 제28조의8①1호 국외 이전 별도 동의 — 동의 전에 ② 각 호 사항 고지).
//
// 계약
//   - 선택이 없으면(처음 방문) gtag 를 싣지 않는다 — Google 로 가는 요청 0, _ga 쿠키 0.
//   - '동의' 후에만 gtag.js 를 싣는다. '동의 안 함'이어도 모든 기능을 쓸 수 있다.
//   - 철회하면 즉시 전송을 끄고(ga-disable 플래그) 이 사이트의 _ga 쿠키를 지운다.
//   - 선택은 이 브라우저의 로컬 저장소에만 둔다(서버로 보내지 않는다).

export type AnalyticsConsent = "granted" | "denied";

export const ANALYTICS_CONSENT_KEY = "gkm-analytics-consent-v1";
/** 선택이 바뀌면 같은 창의 다른 컴포넌트(설정 스위치 등)에 알린다 */
export const ANALYTICS_CONSENT_EVENT = "gkm:analytics-consent";
/** 설정 화면이 안내 배너를 다시 열 때 */
export const ANALYTICS_CONSENT_OPEN_EVENT = "gkm:analytics-consent-open";

export function parseConsent(v: string | null | undefined): AnalyticsConsent | null {
  return v === "granted" || v === "denied" ? v : null;
}

export function readConsent(): AnalyticsConsent | null {
  try { return parseConsent(localStorage.getItem(ANALYTICS_CONSENT_KEY)); } catch { return null; }
}

export function writeConsent(v: AnalyticsConsent): void {
  try { localStorage.setItem(ANALYTICS_CONSENT_KEY, v); } catch { /* 저장 불가 브라우저 — 이번 방문만 적용 */ }
  try { window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: v })); } catch { /* ignore */ }
}

/** GA 측정 ID 형식 — 스크립트 URL·전역 플래그 이름에 들어가므로 형식 밖 값은 쓰지 않는다 */
export const GA_ID_RE = /^G-[A-Z0-9]{4,16}$/;

type GaWindow = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } & Record<string, unknown>;

/** 동의된 경우에만 부른다. 두 번 불러도 스크립트는 한 번만 싣는다. */
export function loadGtag(gaId: string): void {
  if (!GA_ID_RE.test(gaId)) return;
  const w = window as unknown as GaWindow;
  w[`ga-disable-${gaId}`] = false;
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

/** 철회·거부 — 이미 실린 gtag 의 전송을 끄고 _ga 쿠키를 지운다 */
export function disableGtag(gaId: string): void {
  if (GA_ID_RE.test(gaId)) (window as unknown as GaWindow)[`ga-disable-${gaId}`] = true;
  for (const name of gaCookieNames(document.cookie)) {
    for (const d of cookieDomains(location.hostname)) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}
