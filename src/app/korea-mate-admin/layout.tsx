import type { Metadata } from "next";

// noindex: 보안 기능이 아닙니다 (크롤러가 무시할 수 있음).
// 실질적 보안은 서버 API 인증(ADMIN_KEY)으로 보장해야 합니다.
// 목적: 검색엔진 색인 방지 + Google Search Console에서 제외.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
