"use client";

// Blog Detail 에서 locale 이 필요한 조각만 모은 파일이다.
//
// 이 페이지의 본체(page.tsx)는 Server Component 로 남는다 — 마크다운 본문·
// frontmatter·generateMetadata·제휴 카드 선정이 전부 빌드 타임 fs 데이터에
// 의존하고, 기사 본문 HTML 이 정적 출력에서 빠지면 블로그 SEO 가 무너진다.
// 그래서 페이지를 통째로 client 로 바꾸지 않고, 번역이 필요한 UI 만 여기로
// 뺀다. 카드의 provider·url·선정 결과는 Server 가 정해서 props 로 넘긴다.

import { useLocale, useTranslations } from "next-intl";
import { PARTNER_LABEL, type ProductKey } from "@/config/affiliate-registry";
import { resolveOffer } from "@/lib/affiliate-resolve";

// ─── 제휴 카드 ────────────────────────────────────────────────────────────

// 카드 정체성은 제목이 아니라 이 id 다.
// transferTransport 와 transferEsim 은 제목이 "Incheon Airport Transfer" 로
// 같지만 설명과 맥락이 다르다. 제목을 키로 쓰면 두 문구가 조용히 합쳐진다.
export type BlogCardId =
  | "ktxSeoulBusan"
  | "transferTransport"
  | "transferEsim"
  | "esimKlook"
  | "carJeju";

// 서버가 넘기는 것은 "어떤 카드를, 어떤 상품으로" 까지다. 파트너와 링크는
// 아래에서 resolver 가 정한다.
export interface BlogCardProps {
  id: BlogCardId;
  emoji: string;
  product: ProductKey;
  /** 같은 상품에 링크가 여럿일 때만 (노선·도시). */
  variant?: string;
}

export function BlogAffiliateCards({ cards }: { cards: BlogCardProps[] }) {
  const t = useTranslations("blogAffiliate");
  const locale = useLocale();

  // policy 가 파트너를 고르지 않는 상품은 카드가 사라진다. 대체 카드를
  // 만들지 않는다 — 한 장만 남거나 아예 없는 것이 정상이다.
  const rendered = cards
    .map((card) => ({ card, offer: resolveOffer(card.product, locale, { variant: card.variant }) }))
    .filter((x): x is { card: BlogCardProps; offer: NonNullable<typeof x.offer> } => x.offer !== null);

  if (rendered.length === 0) return null;

  return (
    <div className="mt-8 mb-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#8C6239] mb-3 flex items-center gap-1.5">
        {t("partnerNetwork")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rendered.map(({ card, offer }) => (
          <a
            key={card.id}
            href={offer.url}
            target="_blank"
            // 수익 관계가 있을 때만 sponsored 를 붙인다.
            rel={offer.kind === "affiliate"
              ? "noopener noreferrer sponsored"
              : "noopener noreferrer"}
            className="flex items-start gap-3 p-4 rounded-2xl border border-[#E6DFD5] bg-[#FAF7F2] hover:border-[#D4AF37] hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 bg-[#EAE3D2]">
              {card.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#8C6239]">
                {PARTNER_LABEL[offer.partner]}
              </p>
              <p className="text-sm font-black text-[#2C2520] leading-tight">
                {t(`card.${card.id}.title`)}
              </p>
              <p className="text-xs text-[#61554D] leading-relaxed mt-0.5 line-clamp-2">
                {t(`card.${card.id}.desc`)}
              </p>
            </div>
            <span className="text-[#D4AF37] text-sm font-black shrink-0 mt-0.5 group-hover:underline">
              →
            </span>
          </a>
        ))}
      </div>
      <p className="text-[9px] text-[#B8A89A] mt-2 text-center">
        {t("sponsored")}
      </p>
    </div>
  );
}

// ─── 발행일 ───────────────────────────────────────────────────────────────

// post.date 는 "2026-06-10" 형태의 frontmatter 원문이다. 값 자체는 건드리지
// 않고 표시만 locale 을 따른다. UTC 로 고정해 파싱해야 시간대가 하루 앞뒤로
// 밀리지 않는다.
export function BlogPublishedDate({ date }: { date: string }) {
  const t = useTranslations("blogAffiliate");
  const locale = useLocale();

  const d = new Date(`${date}T00:00:00Z`);
  const shown = Number.isNaN(d.getTime())
    ? date
    : new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(d);

  return (
    <span className="text-sm font-bold text-[#61554D]">
      📅 {t("publishedOn", { date: shown })}
    </span>
  );
}

// BLOG-OFFICIAL-TRAVEL-CONTENT-V1 에서 제거된 것들
//  · BlogNotices — "Original Source" 링크가 항상 visitkorea 폴백으로 떨어져
//    eSIM·교통 글에까지 거짓 출처를 달았다. 출처는 이제 글 데이터의 sources 가
//    글별로 정확히 밝힌다.
//  · BlogFooterCredit — 모든 글에 "KTO 데이터 기반" 크레딧을 달았지만 사실이
//    아니었다. 같은 이유로 제거.
//  · BlogBackLink — 새 상세 화면이 quiet 톤으로 직접 그린다.
