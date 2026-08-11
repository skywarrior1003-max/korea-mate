import { getPostData, getSortedPostsData, type PostData } from "@/lib/posts";
import { isEditorialAffiliateEnabled } from "@/config/commerce-surfaces";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import EditorialNav from "@/components/ui/EditorialNav";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import fs from "fs";
import path from "path";
import AdBanner from "@/components/AdBanner";
import {
  BlogAffiliateCards,
  BlogBackLink,
  BlogFooterCredit,
  BlogNotices,
  BlogPublishedDate,
  type BlogCardProps,
} from "@/components/blog/BlogDetailI18n";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  const posts = getSortedPostsData();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

const FALLBACK_OG = "https://gokoreamate.com/opengraph-image.png";

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getPostData(slug);
  if (!post) return {};

  const ogImage = post.image ?? FALLBACK_OG;

  return {
    title: `${post.title} — gokoreamate.com`,
    description: post.summary,
    alternates: {
      canonical: `https://gokoreamate.com/blog/${slug}/`,
    },
    openGraph: {
      title: `${post.title} — gokoreamate.com`,
      description: post.summary,
      type: "article",
      url: `https://gokoreamate.com/blog/${slug}/`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} — gokoreamate.com`,
      description: post.summary,
      images: [ogImage],
    },
  };
}

function getAffiliateLink(postTitle: string): string {
  try {
    const localInfoPath = path.join(process.cwd(), "public/data/local-info.json");
    const items: { name: string; affiliateLink: string }[] = JSON.parse(
      fs.readFileSync(localInfoPath, "utf8")
    );
    const titleLower = postTitle.toLowerCase();
    const match = items.find((item) =>
      item.name && titleLower.includes(item.name.toLowerCase())
    );
    if (match && match.affiliateLink && match.affiliateLink !== "#") {
      return match.affiliateLink;
    }
  } catch {
    // fall through to default
  }
  return "https://visitkorea.or.kr";
}

// 카드의 제목·설명은 여기 없다. locale 별 문구는 BlogDetailI18n 이 id 로 찾는다.
// URL·파트너도 여기 없다 — 서버는 "어떤 상품을 붙일지" 만 정하고, 실제 링크는
// 클라이언트가 resolver 로 해석한다. 이 파일은 Server Component 라 사용자가
// 고른 언어를 알 수 없기 때문이다.
function getBlogAffiliateCards(post: PostData): BlogCardProps[] {
  const tags = post.tags.map((t) => t.toLowerCase());
  const hasTag = (...terms: string[]) => terms.some((t) => tags.includes(t));
  const img = post.image ?? "";

  const city = img.includes("/og/busan/") ? "busan"
    : img.includes("/og/jeju/") ? "jeju"
    : img.includes("/og/gyeongju/") ? "gyeongju"
    : "seoul";

  const cards: BlogCardProps[] = [];

  // Transportation guide: KTX + airport transfer
  if (hasTag("transportation", "ktx", "t-money")) {
    cards.push({ id: "ktxSeoulBusan",     emoji: "🚄", product: "rail", variant: "seoulBusan" });
    cards.push({ id: "transferTransport", emoji: "✈️", product: "airport_transfer" });
    return cards.slice(0, 2);
  }

  // eSIM guide: 예전에는 이 글이 provider 를 순위로 나열했기 때문에 eSIM 카드를
  // 중복으로 보고 공항 이동만 붙였다. 그 글을 실용 가이드로 다시 쓰면서 본문의
  // 상품 추천이 사라졌으므로, 이제 이 글의 구매 연결은 eSIM 카드가 맡는다.
  if (hasTag("esim", "sim card", "connectivity")) {
    cards.push({ id: "esimKlook",     emoji: "📱", product: "esim" });
    cards.push({ id: "transferEsim",  emoji: "✈️", product: "airport_transfer" });
    return cards.slice(0, 2);
  }

  // All other posts: eSIM is always first
  cards.push({ id: "esimKlook", emoji: "📱", product: "esim" });

  // 도시별 카드. seoul·busan·gyeongju 자리에 있던 투어 카드는 Viator 소속이었고,
  // Viator 는 현재 승인 파트너가 아니라 제거했다. 빈자리를 다른 파트너로 메우지
  // 않는다 — 승인 파트너가 없으면 카드 없이 정보만 남는 것이 정상이다.
  if (city === "jeju") {
    cards.push({ id: "carJeju", emoji: "🚗", product: "car_rental", variant: "jeju" });
  }

  return cards.slice(0, 2);
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostData(slug);

  if (!post) {
    notFound();
  }

  const sourceLink = getAffiliateLink(post!.title);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-2xl font-black tracking-tight text-[#2C2520] flex items-center gap-1.5">
              <span className="text-[#D4AF37] font-black tracking-tight">gokoreamate</span>.com
            </Link>
          </div>
          <LanguageSwitcher variant="icon" className="sm:hidden text-[#2C2520]" />
          {/* 좁은 화면에서는 이 링크들이 하단 More 탭(/more)에 모여 있다.
              가로 폭이 이미 x=378 까지 차 있어 지구본과 공존할 수 없다. */}
          <EditorialNav active="blog" />
        </div>
      </header>

      {/* Blog Article Layout */}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-12 flex-1">
        {/* Back Link */}
        <BlogBackLink />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: post!.title,
              datePublished: post!.date,
              description: post!.summary,
              author: { "@type": "Organization", name: "gokoreamate.com" },
              publisher: { "@type": "Organization", name: "gokoreamate.com" },
            }),
          }}
        />
        <article className="bg-white rounded-3xl border border-[#E6DFD5] p-8 sm:p-12 shadow-sm">
          {/* Metadata info */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="text-xs font-black uppercase bg-[#EAE3D2] text-[#8C6239] px-2.5 py-0.5 rounded-md">
              {post.category}
            </span>
            {/* "Last updated" 행이 여기 있었다. 값이 post.date 라서 모든 글에서
                발행일과 같았고, frontmatter 에 실제 updated 필드가 없다.
                갱신된 적 없는 글에 갱신 신호를 붙이는 셈이라 지웠다. */}
            <BlogPublishedDate date={post.date} />
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-5xl font-black text-[#2C2520] leading-tight mb-8">
            {post.title}
          </h1>

          {/* Markdown Content */}
          <div className="prose prose-stone max-w-none prose-headings:font-black prose-headings:text-[#2C2520] prose-p:text-base sm:prose-p:text-lg prose-p:leading-relaxed prose-a:text-[#D4AF37] prose-strong:text-[#2C2520] prose-li:text-base sm:prose-li:text-lg prose-li:leading-relaxed pb-8 border-b border-[#E6DFD5]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
          </div>

          <AdBanner />

          {/* Contextual affiliate cards — Editorial Content Affiliate (§14-1-C)
              blog 는 승인된 표면이다. 가시적 제휴 고지(하단 Sponsored 문구)를 갖추고
              있고 일정·Cart·scheduler 와 데이터 연결이 없다. allowlist 판정을
              명시적으로 통과할 때만 렌더한다. */}
          {isEditorialAffiliateEnabled("blog") && (
            <BlogAffiliateCards cards={getBlogAffiliateCards(post!)} />
          )}

          {/* AI Disclosure Warning · Original Source */}
          <BlogNotices sourceLink={sourceLink} />
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4 mt-auto">
        <BlogFooterCredit />
      </footer>
    </div>
  );
}
