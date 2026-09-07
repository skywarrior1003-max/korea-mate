// Blog 상세 — 공식 기반 여행 이해 콘텐츠. (BLOG-OFFICIAL-TRAVEL-CONTENT-V1)
//
// 글은 src/data/blog/blog-posts-v1.ts 의 구조화 데이터다(마크다운 파일 없음).
// 4개 locale 전문 동봉 — 렌더는 client 가 현재 locale 로 그린다.
// metadata/JSON-LD 는 사이트 관례대로 영어 기본값.

import { notFound } from "next/navigation";
import { BLOG_POSTS, getBlogPost } from "@/data/blog/blog-posts-v1";
import BlogPostClient from "@/components/blog/BlogPostClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return BLOG_POSTS.map(post => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  const url = `https://gokoreamate.com/blog/${post.slug}/`;
  const image = `https://gokoreamate.com${post.heroImage}`;
  return {
    title: `${post.title.en} — gokoreamate.com`,
    description: post.summary.en,
    alternates: { canonical: url },
    openGraph: {
      title: post.title.en,
      description: post.summary.en,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: { card: "summary_large_image", title: post.title.en, description: post.summary.en, images: [image] },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title.en,
    description: post.summary.en,
    datePublished: post.date,
    inLanguage: ["ko", "en", "ja", "zh"],
    author: { "@type": "Organization", name: "gokoreamate.com" },
    publisher: { "@type": "Organization", name: "gokoreamate.com" },
    mainEntityOfPage: `https://gokoreamate.com/blog/${post.slug}/`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogPostClient slug={slug} />
    </>
  );
}
