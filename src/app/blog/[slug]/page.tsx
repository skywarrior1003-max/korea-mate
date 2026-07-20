import { getPostData, getSortedPostsData, type PostData } from "@/lib/posts";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import fs from "fs";
import path from "path";
import AdBanner from "@/components/AdBanner";
import { KLOOK, VIATOR, KTX } from "@/config/affiliates";

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

interface BlogCard {
  emoji: string;
  provider: string;
  title: string;
  desc: string;
  url: string;
}

function getBlogAffiliateCards(post: PostData): BlogCard[] {
  const tags = post.tags.map((t) => t.toLowerCase());
  const hasTag = (...terms: string[]) => terms.some((t) => tags.includes(t));
  const img = post.image ?? "";

  const city = img.includes("/og/busan/") ? "busan"
    : img.includes("/og/jeju/") ? "jeju"
    : img.includes("/og/gyeongju/") ? "gyeongju"
    : "seoul";

  const cards: BlogCard[] = [];

  // Transportation guide: KTX + airport transfer
  if (hasTag("transportation", "ktx", "t-money")) {
    cards.push({
      emoji: "🚄",
      provider: "Klook",
      title: "Seoul → Busan KTX Train",
      desc: "Book Korea's fastest inter-city train in advance. 2hr 15min, from ₩59,800.",
      url: KTX.seoulBusanUrl,
    });
    cards.push({
      emoji: "✈️",
      provider: "Klook",
      title: "Incheon Airport Transfer",
      desc: "Limousine bus direct to Seoul city center. No transit hassle with luggage.",
      url: KLOOK.transferUrl,
    });
    return cards.slice(0, 2);
  }

  // eSIM guide: airport transfer as companion (avoid eSIM redundancy)
  if (hasTag("esim", "sim card", "connectivity")) {
    cards.push({
      emoji: "✈️",
      provider: "Klook",
      title: "Incheon Airport Transfer",
      desc: "Arrive connected and door-to-door. Limousine bus to Seoul city center.",
      url: KLOOK.transferUrl,
    });
  } else {
    // All other posts: eSIM is always first
    cards.push({
      emoji: "📱",
      provider: "Klook",
      title: "Korea eSIM — Stay Connected",
      desc: "Activate before landing. Fast 5G/LTE data from the moment you arrive at Incheon.",
      url: KLOOK.esimUrl,
    });
  }

  // City-specific tour card
  if (city === "seoul") {
    cards.push({
      emoji: "🎟️",
      provider: "Viator",
      title: "Seoul Tours & Day Trips",
      desc: "Palace tours, K-culture, Gangnam night tours — curated by local Seoul guides.",
      url: VIATOR.seoulHub(),
    });
  } else if (city === "busan") {
    cards.push({
      emoji: "🎟️",
      provider: "Viator",
      title: "Busan Tours & Day Trips",
      desc: "Haeundae, Gamcheon, seafood market tours — curated by local Busan guides.",
      url: VIATOR.busanHub(),
    });
  } else if (city === "jeju") {
    cards.push({
      emoji: "🚗",
      provider: "Klook",
      title: "Jeju Car Rental",
      desc: "Essential for Jeju island. From ₩35,000/day. International license accepted.",
      url: KLOOK.jejuCarRentalUrl,
    });
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
              <span className="text-[#D4AF37] text-3xl">🇰🇷</span> <span className="text-[#D4AF37]">gokoreamate</span>.com
            </Link>
          </div>
          <nav className="flex items-center gap-8">
            <Link
              href="/blog"
              className="text-base font-bold text-[#D4AF37] transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/survival-guide"
              className="text-base font-bold hover:text-[#D4AF37] transition-colors"
            >
              Survival Guide
            </Link>
            <Link
              href="/about"
              className="text-base font-bold hover:text-[#D4AF37] transition-colors"
            >
              About
            </Link>
          </nav>
        </div>
      </header>

      {/* Blog Article Layout */}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-12 flex-1">
        {/* Back Link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-base font-extrabold hover:text-[#D4AF37] transition-colors mb-8"
        >
          ← Back to Blog
        </Link>

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
            <span className="text-sm font-bold text-[#61554D]">
              📅 Published on {post.date}
            </span>
            <span className="text-sm font-bold text-[#61554D]">
              🔄 Last updated: {post.date}
            </span>
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

          {/* Contextual affiliate cards (Surface C) */}
          {(() => {
            const cards = getBlogAffiliateCards(post!);
            if (cards.length === 0) return null;
            return (
              <div className="mt-8 mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#8C6239] mb-3 flex items-center gap-1.5">
                  🇰🇷 gokoreamate partner network
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cards.map((card) => (
                    <a
                      key={card.title}
                      href={card.url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="flex items-start gap-3 p-4 rounded-2xl border border-[#E6DFD5] bg-[#FAF7F2] hover:border-[#D4AF37] hover:shadow-sm transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 bg-[#EAE3D2]">
                        {card.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wide text-[#8C6239]">
                          {card.provider}
                        </p>
                        <p className="text-sm font-black text-[#2C2520] leading-tight">
                          {card.title}
                        </p>
                        <p className="text-xs text-[#61554D] leading-relaxed mt-0.5 line-clamp-2">
                          {card.desc}
                        </p>
                      </div>
                      <span className="text-[#D4AF37] text-sm font-black shrink-0 mt-0.5 group-hover:underline">
                        →
                      </span>
                    </a>
                  ))}
                </div>
                <p className="text-[9px] text-[#B8A89A] mt-2 text-center">
                  Sponsored · Commission may be earned at no cost to you
                </p>
              </div>
            );
          })()}

          {/* AI Disclosure Warning */}
          <div className="mt-8 bg-[#FAF7F2] border border-[#E6DFD5] rounded-2xl p-6 text-sm sm:text-base text-[#61554D] leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 text-[#8C6239] mb-1">
              ⚠️ Content Notice
            </p>
            This post was written by AI based on data from the Korea Tourism Organization (
            <a
              href="https://visitkorea.or.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline hover:text-[#D4AF37]"
            >
              visitkorea.or.kr
            </a>
            ). Please verify details through the original source before your trip.
          </div>

          {/* Original Source Link */}
          <div className="mt-4 text-sm text-[#61554D]">
            <a
              href={sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline hover:text-[#D4AF37]"
            >
              Original Source
            </a>
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} gokoreamate.com. All rights reserved.</p>
          <p className="font-bold tracking-wide">
            Data provided by Korea Tourism Organization. AI-powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}
