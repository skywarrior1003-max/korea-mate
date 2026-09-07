"use client";

// Blog 목록 — Quiet Travel Editorial. (BLOG-OFFICIAL-TRAVEL-CONTENT-V1)
// 뉴스 포털식 밀도·"BEST 10" 과장 없이, 사진과 읽을거리가 주인공이다.

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { getBlogPostsSorted, pickL10n } from "@/data/blog/blog-posts-v1";

const CATEGORY_KEY: Record<string, string> = {
  seasons: "catSeasons",
  cities: "catCities",
  "official-resources": "catOfficial",
};

export default function BlogListClient() {
  const t = useTranslations("blog");
  const locale = useLocale();
  const posts = getBlogPostsSorted();

  return (
    <div className="qh min-h-screen" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-20">
        <header className="mb-10">
          <Link href="/" className="text-xs font-semibold tracking-wide" style={{ color: "var(--qh-faint)" }}>
            gokoreamate
          </Link>
          <h1 className="qh-serif text-3xl mt-3" style={{ color: "var(--qh-ink)" }}>
            {t("title")}
          </h1>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--qh-faint)" }}>
            {t("subtitle")}
          </p>
        </header>

        <div className="flex flex-col gap-10">
          {posts.map(post => (
            <Link key={post.slug} href={`/blog/${post.slug}/`} className="group block">
              <div
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: "var(--qh-line)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.heroImage}
                  alt={pickL10n(post.title, locale)}
                  className="w-full aspect-[1200/630] object-cover group-hover:scale-[1.01] transition-transform"
                />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mt-4" style={{ color: "var(--qh-clay)" }}>
                {t(CATEGORY_KEY[post.category] ?? "catSeasons")}
              </p>
              <h2 className="qh-serif text-xl mt-1.5 leading-snug" style={{ color: "var(--qh-ink)" }}>
                {pickL10n(post.title, locale)}
              </h2>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--qh-faint)" }}>
                {pickL10n(post.summary, locale)}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--qh-faint2)" }}>{post.date}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
