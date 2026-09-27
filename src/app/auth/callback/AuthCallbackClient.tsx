"use client";

// /auth/callback — PKCE code 교환 + URL 정리 + 안전 복귀 (§6)
//
// 순서:
//  ① URL 에서 code 수신(없거나 error 면 교환 없이 정리·복귀)
//  ② supabase.auth.exchangeCodeForSession — PKCE verifier 는 SDK 가 관리
//  ③ history.replaceState 로 code·state 등 일회성 파라미터를 주소에서 제거
//     (뒤로가기·북마크·공유에 auth code 가 남지 않는다)
//  ④ sanitizeReturnPath 를 거친 내부 경로로만 복귀 — 실패·취소·중복 실행
//     전부 안전한 기본 화면으로 간다. 오류 화면에 code·token·provider 상세를
//     싣지 않는다.
//
// 중복 실행 안전: 같은 code 로 두 번 교환하면 두 번째는 SDK/서버가 거부한다.
// 그 경우에도 이미 세션이 있으면 성공으로, 없으면 일반 오류 문구로 처리한다.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import { sanitizeReturnPath, AUTH_RETURN_KEY } from "@/lib/auth/return-path";
import { activateAccount } from "@/lib/auth/consent-client";

export default function AuthCallbackClient() {
  const router = useRouter();
  const t = useTranslations("auth");
  const ranRef = useRef(false); // StrictMode 이중 마운트에서 교환 1회 보장
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const oauthError = url.searchParams.get("error"); // 사용자가 Google 화면에서 취소한 경우 등

      // ③ 일회성 파라미터 제거 — 성공/실패와 무관하게 가장 먼저 지운다
      try {
        for (const k of ["code", "state", "error", "error_description", "error_code"]) url.searchParams.delete(k);
        window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
      } catch { /* URL 정리는 최선 노력 — 실패해도 복귀는 진행 */ }

      let sessionOk = false;
      if (code && !oauthError) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          sessionOk = !error;
        } catch { sessionOk = false; }
      }
      if (!sessionOk) {
        // code 재사용·중복 실행 — 이미 세션이 확립돼 있으면 그것으로 충분하다
        try { sessionOk = Boolean((await supabase.auth.getSession()).data.session); } catch { sessionOk = false; }
      }

      let back = "/";
      try {
        back = sanitizeReturnPath(sessionStorage.getItem(AUTH_RETURN_KEY));
        sessionStorage.removeItem(AUTH_RETURN_KEY);
      } catch { back = "/"; }

      if (sessionOk) {
        // CONSENT-V1 §G — code 교환 성공 ≠ 활성 계정. 서버 활성화(동의 검증)를
        // 통과해야만 로그인 완료로 취급한다. 실패하면 즉시 signOut 하고
        // PII 없는 사유 코드와 함께 More 로 복귀한다(직접 OAuth 우회 차단).
        const activation = await activateAccount();
        if (activation.state === "active") {
          router.replace(back);
        } else {
          // scope:"local" — 이 브라우저에서 방금 만든 미활성 세션만 폐기한다.
          // 기본(global)이면 같은 계정으로 이미 활성인 다른 기기까지 끊는다.
          try { await supabase.auth.signOut({ scope: "local" }); } catch { /* 이미 없어도 무해 */ }
          const reason = activation.state === "inactive" && activation.reason === "consent_expired"
            ? "consent_expired"
            : activation.state === "inactive" && activation.reason === "link_conflict"
              ? "link_conflict" : "consent_required";
          router.replace(`/more?auth=${reason}`);
        }
      } else if (oauthError) {
        // 취소는 오류가 아니다 — 조용히 원래 화면으로
        router.replace(back);
      } else {
        setFailed(true); // 일반 문구만. 상세·code·token 없음
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      {failed ? (
        <>
          <p className="text-sm font-bold text-gray-800">{t("callbackFailed")}</p>
          <button
            onClick={() => router.replace("/")}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            {t("backToHome")}
          </button>
        </>
      ) : (
        <p className="text-sm text-gray-500">{t("signingIn")}</p>
      )}
    </div>
  );
}
