import LegalDocument from "@/components/legal/LegalDocument";
import { TERMS } from "@/lib/legal/terms-content";

// Google OAuth 검증 제출 기준 URL: https://gokoreamate.com/terms/
// 로그인 없이 항상 접근 가능해야 한다(정적 export — 인증 게이트 0).
export const metadata = {
  title: "Terms of Service — gokoreamate",
  description:
    "The terms that govern using gokoreamate: accounts, user content, public sharing, affiliate links, and the limits of travel and AI-assisted information.",
  alternates: { canonical: "https://gokoreamate.com/terms/" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <LegalDocument docs={TERMS} />;
}
