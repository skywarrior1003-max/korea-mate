// Blog 콘텐츠 계약 가드 (BLOG-OFFICIAL-TRAVEL-CONTENT-V1)
//
// Owner 확정 계약을 코드로 고정한다:
//  · 4 locale 전문 동봉(빈 locale 금지) — 페이지뷰마다 번역기를 부르지 않는다
//  · 요금·가격 수치 금지 — 실용 정본은 Travel Essentials 다
//  · 외부 링크는 공식 관광기관 도메인만
//  · 사용자-facing 명칭은 Blog 유지(Guides 로 바꾸지 않는다)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOG_POSTS, type L10n } from "./blog-posts-v1.ts";

const LOCALES = ["ko", "en", "ja", "zh"] as const;
const CATEGORIES = new Set(["seasons", "cities", "official-resources"]);

const OFFICIAL_HOSTS = [
  "visitbusan.net", "visitseoul.net", "visitjeju.net",
  "gyeongju.go.kr", "jeonju.go.kr", "visitkorea.or.kr", "seoul.go.kr", "busan.go.kr",
];

function everyL10n(v: L10n, label: string): void {
  for (const l of LOCALES) {
    assert.ok(typeof v[l] === "string" && v[l].trim() !== "", `${label}.${l} 이 비었다`);
  }
}

test("B1 모든 글에 4개 locale 전문이 있다", () => {
  assert.ok(BLOG_POSTS.length >= 3, "글이 3편 미만이다");
  for (const p of BLOG_POSTS) {
    everyL10n(p.title, `${p.slug}.title`);
    everyL10n(p.summary, `${p.slug}.summary`);
    for (const [i, s] of p.sections.entries()) {
      everyL10n(s.body, `${p.slug}.sections[${i}].body`);
      if (s.heading) everyL10n(s.heading, `${p.slug}.sections[${i}].heading`);
      for (const l of s.links ?? []) {
        everyL10n(l.label, `${p.slug}.sections[${i}].link.label`);
        if (typeof l.href !== "string") everyL10n(l.href, `${p.slug}.sections[${i}].link.href`);
      }
      for (const pl of s.places ?? []) everyL10n(pl.name, `${p.slug} place ${pl.id}`);
    }
  }
});

test("B2 요금표·가격 수치가 본문에 없다 — 정본은 Travel Essentials", () => {
  const priceLike = /₩\s?[\d,]+|\d+\s?(won|WON|ウォン|韩元|원)\b/;
  for (const p of BLOG_POSTS) {
    for (const s of p.sections) {
      for (const l of LOCALES) {
        assert.ok(!priceLike.test(s.body[l]), `${p.slug} 본문(${l})에 가격 수치가 있다`);
      }
    }
  }
});

test("B3 외부 링크는 공식 관광기관 도메인뿐이다", () => {
  const collect = (href: string | L10n): string[] =>
    typeof href === "string" ? [href] : LOCALES.map(l => href[l]);
  for (const p of BLOG_POSTS) {
    const urls: string[] = p.sources.map(s => s.url);
    for (const s of p.sections) for (const l of s.links ?? []) urls.push(...collect(l.href));
    for (const u of urls) {
      if (!u.startsWith("http")) continue; // 내부 경로
      assert.ok(u.startsWith("https://"), `${p.slug}: http 링크 ${u}`);
      const host = new URL(u).hostname;
      assert.ok(OFFICIAL_HOSTS.some(h => host === h || host.endsWith("." + h)),
        `${p.slug}: 비공식 도메인 ${host}`);
    }
  }
});

test("B4 구조 계약 — slug/카테고리/장소 id/출처", () => {
  const slugs = new Set<string>();
  for (const p of BLOG_POSTS) {
    assert.match(p.slug, /^[a-z0-9-]+$/, `slug ${p.slug}`);
    assert.ok(!slugs.has(p.slug), `slug 중복 ${p.slug}`);
    slugs.add(p.slug);
    assert.ok(CATEGORIES.has(p.category), `category ${p.category}`);
    assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.sources.length > 0, `${p.slug}: 공식 원천이 없다`);
    for (const s of p.sections) {
      for (const pl of s.places ?? []) {
        assert.ok(Number.isInteger(pl.id) && pl.id > 0, `${p.slug}: place id ${pl.id}`);
      }
    }
    assert.ok(p.heroImage.startsWith("/"), `${p.slug}: heroImage 는 사이트 내 자산이어야 한다`);
    // 제휴 카드 남발 금지 — 글당 최대 2
    assert.ok((p.affiliateCards ?? []).length <= 2, `${p.slug}: 제휴 카드가 2개를 넘는다`);
  }
});

test("B5 사용자-facing 명칭은 Blog 다 — Guides 로 바꾸지 않았다", () => {
  for (const L of LOCALES) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as {
      nav: Record<string, string>; blog: Record<string, string>;
    };
    assert.ok(typeof m.nav.blog === "string" && m.nav.blog.trim() !== "", `${L}.nav.blog`);
    assert.ok(!/guide/i.test(m.nav.blog), `${L}.nav.blog 이 Guide 로 바뀌었다: ${m.nav.blog}`);
    for (const k of ["title", "subtitle", "sources", "catSeasons", "catCities", "catOfficial"]) {
      assert.ok(typeof m.blog[k] === "string" && m.blog[k].trim() !== "", `${L}.blog.${k}`);
    }
  }
});

test("B6 레거시 편의정보 글 체계가 제거됐다", () => {
  // md 로더·생성 스크립트가 남아 있으면 계약 위반 콘텐츠가 되살아날 수 있다
  assert.throws(() => readFileSync("src/lib/posts.ts"), "src/lib/posts.ts 가 남아 있다");
  assert.throws(() => readFileSync("scripts/generate-blog-post.js"), "generate-blog-post.js 가 남아 있다");
});
