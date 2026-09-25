// 로그인 복귀 경로 정화 (V2-MINIMAL-GOOGLE-AUTH-V1 §6)
//
// 로그인 전 있던 화면으로 돌아가되, open redirect 를 원천 차단한다.
// 허용되는 것은 "이 앱 안의 경로" 하나뿐이다 — 절대 URL·다른 origin·
// 프로토콜 스킴·역슬래시·이중 인코딩 우회 전부 기본 화면("/")으로 떨어진다.

const FALLBACK = "/";
/** callback 자신으로 되돌아가는 무한 반복 차단 */
const CALLBACK_PREFIX = "/auth/callback";

/** %XX 를 반복 해제한다 — 이중 인코딩(%252F%252F…) 우회를 평문으로 끌어낸다 */
function fullyDecode(raw: string): string | null {
  let cur = raw;
  for (let i = 0; i < 5; i++) {
    let next: string;
    try { next = decodeURIComponent(cur); } catch { return null; } // 깨진 인코딩 = 거부
    if (next === cur) return cur;
    cur = next;
  }
  return null; // 5회를 넘는 인코딩 중첩은 정상 경로가 아니다
}

export function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return FALLBACK;
  const decoded = fullyDecode(raw);
  if (decoded === null) return FALLBACK;
  // 제어문자·공백 시작·역슬래시 = 브라우저별 재해석 여지 — 전부 거부
  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return FALLBACK;
  const t = decoded.trim();
  // 내부 상대경로만: "/" 로 시작하되 "//"(protocol-relative)는 외부 이동이다
  if (!t.startsWith("/") || t.startsWith("//")) return FALLBACK;
  // "/x:..." 같은 형태는 없다 — 스킴 문자가 첫 세그먼트에 오면 거부(과잉 방어)
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return FALLBACK;
  // callback 자기 자신(쿼리·서브경로 포함) 금지 — 로그인 루프 차단
  if (t === CALLBACK_PREFIX || t.startsWith(CALLBACK_PREFIX + "/") || t.startsWith(CALLBACK_PREFIX + "?")) return FALLBACK;
  return t;
}

/** 로그인 직전 화면 저장 키 — 세션 스토리지(탭 한정·자동 소멸) */
export const AUTH_RETURN_KEY = "koreamate_auth_return_v1";
