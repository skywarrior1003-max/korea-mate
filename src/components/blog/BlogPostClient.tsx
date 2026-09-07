"use client";

// Blog 상세 — Quiet Travel Editorial. (BLOG-OFFICIAL-TRAVEL-CONTENT-V1)
//
//  · 본문·제목·요약은 글 데이터에 4개 locale 전문이 동봉돼 있다 — 실시간 번역 없음.
//  · 장소 연결은 canonical id 로만: /place/{id}. 없는 관계를 만들지 않는다.
//  · 외부 링크는 전부 공식 관광기관. 공식 원천이 언어판을 제공하면 locale 에 맞는
//    판으로 연결한다(pickHref).
//  · 실용 수치의 정본은 Travel Essentials — 이 화면은 맥락과 링크만 담당한다.

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { getBlogPost, pickL10n, pickHref } from "@/data/blog/blog-posts-v1";
import { BlogAffiliateCards, BlogPublishedDate, type BlogCardProps } from "@/components/blog/BlogDetailI18n";
import { isEditorialAffiliateEnabled } from "@/config/commerce-surfaces";
import type { ProductKey } from "@/config/affiliate-registry";
import AdBanner from "@/components/AdBanner";

const CATEGORY_KEY: Record<string, string> = {
  seasons: "catSeasons",
  cities: "catCities",
  "official-resources": "catOfficial",
};

export default function BlogPostClient({ slug }: { slug: string }) {
  const t = useTranslations("blog");
  const tAff = useTranslations("blogAffiliate");
  const locale = useLocale();
  const post = getBlogPost(slug);
  if (!post) return null;

  const cards: BlogCardProps[] = (post.affiliateCards ?? []).map(c => ({
    id: c.id, emoji: c.emoji, product: c.product as ProductKey, variant: c.variant,
  }));

  return (
    <div className="qh min-h-screen" style={{ backgroundColor: "var(--qh-paper)" }}>
      <article className="max-w-2xl mx-auto px-5 pt-8 pb-20">
        <Link href="/blog/" className="text-sm font-semibold" style={{ color: "var(--qh-faint)" }}>
          ← {tAff("backToBlog")}
        </Link>

        <p className="text-[11px] font-semibold uppercase tracking-widest mt-8" style={{ color: "var(--qh-clay)" }}>
          {t(CATEGORY_KEY[post.category] ?? "catSeasons")}
        </p>
        <h1 className="qh-serif text-3xl mt-2 leading-snug" style={{ color: "var(--qh-ink)" }}>
          {pickL10n(post.title, locale)}
        </h1>
        <div className="mt-3 text-xs" style={{ color: "var(--qh-faint2)" }}>
          <BlogPublishedDate date={post.date} />
        </div>
        <p className="text-base mt-5 leading-relaxed" style={{ color: "var(--qh-faint)" }}>
          {pickL10n(post.summary, locale)}
        </p>

        <div className="overflow-hidden rounded-2xl border mt-7" style={{ borderColor: "var(--qh-line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.heroImage} alt={pickL10n(post.title, locale)} className="w-full aspect-[1200/630] object-cover" />
        </div>

        {post.sections.map((s, i) => (
          <section key={i} className="mt-10">
            {s.heading && (
              <h2 className="qh-serif text-xl leading-snug" style={{ color: "var(--qh-ink)" }}>
                {pickL10n(s.heading, locale)}
              </h2>
            )}
            {pickL10n(s.body, locale).split("\n\n").map((para, j) => (
              <p key={j} className="text-[15px] mt-3 leading-[1.85]" style={{ color: "var(--qh-ink)" }}>
                {para}
              </p>
            ))}

            {s.places && s.places.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {s.places.map(p => (
                  <Link
                    key={p.id}
                    href={`/place/${p.id}/`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors hover:border-current"
                    style={{ borderColor: "var(--qh-line)", color: "var(--qh-navy)" }}
                  >
                    {pickL10n(p.name, locale)}
                    <span aria-hidden style={{ color: "var(--qh-clay)" }}>→</span>
                  </Link>
                ))}
              </div>
            )}

            {s.links && s.links.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {s.links.map((l, k) => {
                  const href = pickHref(l.href, locale);
                  const external = href.startsWith("http");
                  const inner = (
                    <>
                      <span className="underline underline-offset-4">{pickL10n(l.label, locale)}</span>
                      {l.langNote && (
                        <span className="text-[10px] font-semibold ml-1.5" style={{ color: "var(--qh-faint2)" }}>
                          {l.langNote}
                        </span>
                      )}
                      <span aria-hidden className="ml-1">→</span>
                    </>
                  );
                  return (
                    <li key={k} className="text-sm" style={{ color: "var(--qh-blue)" }}>
                      {external
                        ? <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
                        : <Link href={href}>{inner}</Link>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        {/* 공식 원천 — 이 글이 실제로 근거한 곳만 적는다 */}
        <div className="mt-12 rounded-2xl border p-5" style={{ borderColor: "var(--qh-line)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--qh-clay)" }}>
            {t("sources")}
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {post.sources.map(src => (
              <li key={src.url} className="text-sm">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                  style={{ color: "var(--qh-blue)" }}
                >
                  {src.name}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--qh-faint)" }}>
            {tAff("aiNotice")}
          </p>
        </div>

        {isEditorialAffiliateEnabled("blog") && cards.length > 0 && (
          <BlogAffiliateCards cards={cards} />
        )}

        <div className="mt-10">
          <AdBanner />
        </div>
      </article>
    </div>
  );
}
