import { getPostData, getSortedPostsData } from "@/lib/posts";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import fs from "fs";
import path from "path";
import AdBanner from "@/components/AdBanner";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  const posts = getSortedPostsData();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getPostData(slug);
  if (!post) return {};

  return {
    title: `${post.title} - KoreaMate Blog`,
    description: post.summary,
    openGraph: {
      title: `${post.title} - KoreaMate Blog`,
      description: post.summary,
      type: "article",
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
              <span className="text-[#D4AF37] text-3xl">🇰🇷</span> Korea<span className="text-[#D4AF37]">Mate</span>
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
              author: { "@type": "Organization", name: "KoreaMate" },
              publisher: { "@type": "Organization", name: "KoreaMate" },
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
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">
            Data provided by Korea Tourism Organization. AI-powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}
