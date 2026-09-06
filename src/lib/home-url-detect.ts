// Home Search + Paste URL 단일 입력 — URL 자동 감지 (순수 모듈).
// (EVENT-UPCOMING-AND-HOME-AGREED-FIXES-V1 · P1-1 확정: 별도 URL 입력창을 만들지 않는다)
//
// 여기서는 "감지와 분류"만 한다. 외부 URL 분석/가져오기 엔진(P2-1)은 이 모듈의
// 범위가 아니다 — 외부 URL 은 external 로만 분류하고, 화면이 준비 중임을 말한다.
// GoKoreaMate 자기 링크(공유 여행 등)는 기존 canonical 경로로 그대로 이동한다.

export type DetectedUrl =
  | { kind: "internal"; path: string; shared: boolean }
  | { kind: "external"; url: string };

const INTERNAL_HOSTS = new Set(["gokoreamate.com", "www.gokoreamate.com"]);

/** 붙여넣은 입력이 URL 인가. 아니면 null — 일반 검색은 기존 흐름 그대로다. */
export function detectPastedUrl(raw: string): DetectedUrl | null {
  const s = (raw ?? "").trim();
  if (!s || /\s/.test(s)) return null; // 공백 포함이면 문장/검색어다
  let candidate = s;
  if (/^(gokoreamate\.com|www\.gokoreamate\.com)(\/|$)/i.test(s)) candidate = `https://${s}`;
  if (!/^https?:\/\//i.test(candidate)) return null;
  let u: URL;
  try { u = new URL(candidate); } catch { return null; }
  if (!u.hostname || !u.hostname.includes(".")) return null;
  if (INTERNAL_HOSTS.has(u.hostname.toLowerCase())) {
    const path = `${u.pathname}${u.search}` || "/";
    return { kind: "internal", path, shared: /^\/shared\//.test(u.pathname) };
  }
  return { kind: "external", url: u.toString() };
}
