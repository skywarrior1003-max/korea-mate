// Blog 목록 — 공식 기반 여행 이해 콘텐츠. (BLOG-OFFICIAL-TRAVEL-CONTENT-V1)
//
// Server Component 는 metadata 만 담당하고 화면은 client 가 그린다 —
// 글 데이터에 4개 locale 전문이 동봉돼 있어 locale 전환이 즉시 반영된다.
// SEO metadata 는 사이트 전체 관례대로 영어 기본값이다.

import BlogListClient from "@/components/blog/BlogListClient";

export const metadata = {
  title: "Korea Travel Blog — gokoreamate.com",
  description:
    "Official-source travel reading for visiting Korea: seasons, city character, and where to find official guidebooks and maps.",
  alternates: { canonical: "https://gokoreamate.com/blog/" },
};

export default function BlogListPage() {
  return <BlogListClient />;
}
