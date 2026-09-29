import LegalDocument from "@/components/legal/LegalDocument";
import { PRIVACY } from "@/lib/legal/privacy-content";

// 개인정보처리방침 — Google OAuth 검증 제출 기준 URL: https://gokoreamate.com/privacy/ (2026-09-29 공개 서비스판 이후 Auth 판으로 개정)
// 로그인 없이 항상 접근 가능해야 한다(정적 export — 인증 게이트 0).
// locale 은 About/More 와 같은 브라우저 결정 구조를 그대로 따른다.
export const metadata = {
  title: "Privacy Policy — gokoreamate",
  description:
    "How gokoreamate handles your information: Google sign-in, travel content, photos, device identifier, inquiries, analytics and maps, retention, and your deletion rights.",
  alternates: { canonical: "https://gokoreamate.com/privacy/" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <LegalDocument docs={PRIVACY} />;
}
