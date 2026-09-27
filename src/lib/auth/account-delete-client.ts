"use client";

// 계정 영구 삭제 클라이언트 (ACCOUNT-DELETE-V1 §2)
//
// 2단계 계약: ①delete-intent — 서버가 세션과 "최근 로그인"(GoTrue 기록)을
// 확인하고 10분짜리 의사 토큰을 준다. 오래된 세션이면 reauth_required —
// 기존 PKCE OAuth 로 다시 로그인하고 돌아와야 한다(암호·시각을 클라가
// 만들지 않는다). ②delete — 같은 세션 + 토큰으로 실행. 서버가 auth 사용자
// 까지 지운 뒤에만 ok 다(성공 위장 없음 — 실패는 stage 와 함께 재시도 가능).
//
// 성공 후 이 브라우저: 세션 제거 + 새 익명 기기 발급 + koreamate_* 개인
// 캐시 제거 + reload — 로그아웃과 같은 로컬 초기화 계약(§2.4)을 따른다.
// 계정이 이미 서버에서 사라졌으므로 signOut 실패는 무해하다.

import { supabase } from "@/lib/supabase";
import { deviceAuthHeaders } from "@/lib/auth/device-auth-headers";

export type DeleteIntentResult =
  | { ok: true; intent: string }
  | { ok: false; reason: "reauth" | "error" };

export async function requestDeleteIntent(): Promise<DeleteIntentResult> {
  try {
    const res = await fetch("/api/account/delete-intent", { method: "POST", headers: await deviceAuthHeaders() });
    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === "reauth_required") return { ok: false, reason: "reauth" };
      return { ok: false, reason: "error" };
    }
    if (!res.ok) return { ok: false, reason: "error" };
    const body = (await res.json()) as { intent?: string };
    return body.intent ? { ok: true, intent: body.intent } : { ok: false, reason: "error" };
  } catch { return { ok: false, reason: "error" }; }
}

export async function executeAccountDelete(intent: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { ...(await deviceAuthHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ intent }),
    });
    if (!res.ok) return { ok: false };
  } catch { return { ok: false }; }

  // 서버 삭제 완료 후에만 로컬 초기화 — 순서가 로그아웃(§7)과 반대가 아니다:
  // 여기는 flush 할 계정이 더 이상 없다(모든 서버 데이터가 방금 지워졌다).
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* 계정이 이미 없다 */ }
  const { rotateDeviceId } = await import("@/lib/deviceId");
  rotateDeviceId();
  try { window.location.reload(); } catch { /* 다음 내비게이션이 새 신원 */ }
  return { ok: true };
}
