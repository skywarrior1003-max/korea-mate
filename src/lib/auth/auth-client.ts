"use client";

// 최소 Google 로그인 클라이언트 (V2-MINIMAL-GOOGLE-AUTH-V1)
//
// 범위는 §2 그대로다: Google 로그인·세션 확인·로그아웃·AI API 용 토큰 전달.
// 무료 횟수·크레딧·결제·계정 통합은 여기 없다(후속 TASK).
//
// 계약(§4):
//  · scope 는 Supabase Google provider 기본(openid·email·profile)만 — scopes
//    옵션을 지정하지 않는다. Drive/Calendar 등 추가 scope 금지.
//  · offline access(access_type=offline)·Google refresh token 요청 금지.
//  · Google provider token 은 저장·로그·전달하지 않는다.
//  · 내부 식별자는 Supabase auth.users.id 뿐이다. 이메일은 식별자가 아니다.

import { supabase } from "@/lib/supabase";
import { sanitizeReturnPath, AUTH_RETURN_KEY } from "./return-path";

export interface AuthUserView {
  /** Supabase auth.users.id — 서버 검증을 거치기 전엔 표시 용도로만 쓴다 */
  userId: string;
  /** 화면 표시용 최소 이름. 없으면 null — 이메일 전체를 노출하지 않는다(§12) */
  displayName: string | null;
}

function displayNameOf(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const name = meta["full_name"] ?? meta["name"];
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  // 이름이 없으면 이메일 local part 만(전체 이메일 미노출)
  const email = user.email ?? "";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : null;
}

/** 현재 세션의 사용자(없으면 null). SDK 저장 세션 계약을 그대로 읽는다 */
export async function getCurrentUser(): Promise<AuthUserView | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    return { userId: u.id, displayName: displayNameOf(u) };
  } catch { return null; }
}

/** 서버 AI API 호출에 붙일 Authorization 값(없으면 null). URL·로그 금지(§7) */
export async function getAccessTokenForApi(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

/**
 * Google 로그인 시작. returnPath 는 정화 후 sessionStorage 에 둔다 —
 * OAuth state/URL 에 싣지 않는다(로그·리퍼러 잔존 방지).
 */
export async function signInWithGoogle(returnPath: string): Promise<{ ok: boolean }> {
  try {
    try { sessionStorage.setItem(AUTH_RETURN_KEY, sanitizeReturnPath(returnPath)); } catch { /* 저장 실패해도 로그인은 진행 — 복귀만 기본 화면 */ }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // scopes 미지정 = provider 기본(openid email profile).
        // access_type/prompt 등 offline 계열 파라미터를 추가하지 않는다(§4).
      },
    });
    return { ok: !error };
  } catch { return { ok: false }; }
}

/** 로그아웃 — device 데이터는 건드리지 않는다(§11: 로그아웃≠데이터 삭제) */
export async function signOutUser(): Promise<void> {
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* 세션이 이미 없어도 무해 */ }
}

/**
 * 로그아웃 + 기기 신원 교체 (LINKING-V1 §2.4·§9) — 계정 UI 의 유일한 로그아웃 경로.
 * 순서: ①세션 종료(실패하면 rotation·초기화를 하지 않는다 — 성공 위장 금지)
 * ②새 익명 device 발급+개인 로컬 캐시 제거 ③전체 reload 로 새 게스트 상태 재조회.
 * 이후 이 브라우저의 요청은 새 unlinked device 라 이전 계정 데이터가 화면·API
 * 어디에도 남지 않는다. old device 의 서버 mapping 은 유지된다.
 */
export async function signOutAndReset(): Promise<{ ok: boolean; reason?: "unsaved" | "signout" }> {
  // DURABILITY-V1 §7 — 세션 종료 **전에** 미전송 draft 변경을 flush 한다.
  // 실패하면 성공 위장 없이 중단: session·device·queue 전부 유지(재시도 가능).
  try {
    const { flushDraftOps } = await import("@/lib/trip-draft-sync");
    const fl = await flushDraftOps();
    if (!fl.ok) return { ok: false, reason: "unsaved" };
  } catch { return { ok: false, reason: "unsaved" }; }
  try {
    // scope:"local" — 이 브라우저의 세션만 끝낸다. 기본값(global)은 같은 계정의
    // 다른 기기 세션(refresh token)까지 전부 revoke 해서, 한 기기의 로그아웃이
    // 다른 기기를 강제 로그아웃시키는 것이 실측됐다(SESSION-PARITY §1).
    // "모든 기기에서 로그아웃"은 별도 기능으로만 제공한다.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { ok: false, reason: "signout" };
  } catch { return { ok: false, reason: "signout" }; }
  const { rotateDeviceId } = await import("@/lib/deviceId");
  rotateDeviceId();
  try { window.location.reload(); } catch { /* 라우터 밖 — 다음 내비게이션이 새 신원 */ }
  return { ok: true };
}

/** 로그인 상태 변화 구독(멀티탭 동기화 포함 — SDK 계약) */
export function onAuthChange(cb: (user: AuthUserView | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
    const u = session?.user;
    cb(u ? { userId: u.id, displayName: displayNameOf(u) } : null);
  });
  return () => data.subscription.unsubscribe();
}
