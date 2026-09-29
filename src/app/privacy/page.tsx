import LegalDocument from "@/components/legal/LegalDocument";
import { PRIVACY } from "@/lib/legal/privacy-content";

// 공개 개인정보처리방침. Auth 출시 때 같은 경로를 Google OAuth 검증 제출 URL 로 쓴다.
// 로그인 없이 항상 접근 가능해야 한다(정적 export — 인증 게이트 0).
// locale 은 About/More 와 같은 브라우저 결정 구조를 그대로 따른다.
export const metadata = {
  title: "Privacy Policy — gokoreamate",
  description:
    "How gokoreamate handles your information: travel content, photos, device identifier, inquiries, analytics and maps, retention, and your rights.",
  alternates: { canonical: "https://gokoreamate.com/privacy/" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <LegalDocument docs={PRIVACY} />;
}
