import AuthCallbackClient from "./AuthCallbackClient";

// Google 로그인 복귀 지점 (V2-MINIMAL-GOOGLE-AUTH-V1 §6)
// 정적 export 라 서버 로직이 없다 — code 교환·URL 정리·복귀는 전부
// AuthCallbackClient 가 브라우저에서 수행한다.
export const metadata = {
  title: "Signing in — gokoreamate",
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
