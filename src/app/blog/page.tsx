import { getSortedPostsData } from "@/lib/posts";
import Link from "next/link";

export const metadata = {
  title: "Korea Travel Blog — gokoreamate.com",
  description: "Tips, guides, and stories for foreign travelers in Korea.",
};

export default function BlogListPage() {
  const posts = getSortedPostsData();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
              <span className="text-[#D4AF37] text-3xl">🇰🇷</span> go<span className="font-extrabold">korea</span>mate
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

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-[#F3EEE3] to-[#FAF7F2] border-b border-[#E6DFD5] py-16 sm:py-20 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h1 className="text-4xl sm:text-5xl font-black text-[#2C2520] tracking-tight">
            Korea Travel Blog
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-[#61554D] font-bold">
            Tips, guides, and stories for foreign travelers in Korea
          </p>
        </div>
      </section>

      {/* Blog Cards List */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-16 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="bg-white rounded-3xl border border-[#E6DFD5] p-6 sm:p-8 hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black uppercase bg-[#EAE3D2] text-[#8C6239] px-2.5 py-0.5 rounded-md">
                    {post.category}
                  </span>
                  <span className="text-xs font-bold text-[#61554D]">
                    📅 {post.date}
                  </span>
                </div>

                <h2 className="text-2xl font-black text-[#2C2520] mb-3 hover:text-[#D4AF37] transition-colors leading-snug">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>

                <p className="text-base text-[#61554D] mb-6 leading-relaxed line-clamp-3">
                  {post.summary}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-bold bg-[#FAF7F2] text-[#8C6239] border border-[#E6DFD5] px-2.5 py-0.5 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center justify-center gap-1 px-4 py-2.5 text-sm font-black bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] hover:border-[#D4AF37] rounded-xl transition-all w-full text-center"
                >
                  Read Post →
                </Link>
              </div>
            </article>
          ))}
        </div>
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
