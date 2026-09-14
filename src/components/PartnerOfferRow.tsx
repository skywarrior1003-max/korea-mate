"use client";

// PHASE 10 — 조용한 예약 보조 1줄 (Owner 승인 표면 전용, 2026-09-13)
//
// 계약:
//  · isCommerceAllowedOnSurface 를 통과한 표면에서만 anchor 를 생성한다.
//  · 링크는 partner-links 활성 매트릭스에서만 온다 — 검증 안 된 조합은
//    이 컴포넌트가 null 을 그려서(렌더 자체 없음) 숨겨진다. 깨진 버튼 0.
//  · 가시적 제휴 고지(문구)를 항상 함께 그린다 — rel=sponsored 는 고지를
//    대체하지 않는다(§14-1-B 조건).
//  · 도시 검색 착지는 "숙소 찾아보기"처럼 범위를 정직하게 말한다 — 특정
//    상품 예약처럼 위장하지 않는다.
//  · 구세대 링크가 섞이면 그리지 않는다(마지막 방어선).

import { useLocale, useTranslations } from "next-intl";
import AffiliateLink from "@/components/AffiliateLink";
import { isEditorialAffiliateEnabled } from "@/config/commerce-surfaces";
import {
  offersByPurpose, isLegacyAffiliateUrl, PARTNER_NAMES, type PartnerLocale,
} from "@/config/partner-links";

const SUPPORTED: readonly string[] = ["en", "ko", "ja", "zh"];

export default function PartnerOfferRow({
  surface, citySlug, cityLabel, className = "",
}: {
  surface: "city-hub-essentials" | "my-trip-prep";
  citySlug: string;
  cityLabel: string;
  className?: string;
}) {
  const t = useTranslations("quiet");
  const rawLocale = useLocale();
  if (!isEditorialAffiliateEnabled(surface)) return null;
  const locale = (SUPPORTED.includes(rawLocale) ? rawLocale : "en") as PartnerLocale;
  const by = offersByPurpose(citySlug, locale);
  const clean = (arr: typeof by.stay) => arr.filter(o => !isLegacyAffiliateUrl(o.href));
  // 목적별 줄: [cta i18n 키, 추천, 대안]. 검증된 목적만 줄이 생긴다.
  // esim/rail/bus 는 한국 전역 카테고리 — 문구도 도시가 아니라 범위를 말한다.
  const rows = ([
    ["partnerStayCta", clean(by.stay)],
    ["partnerActivityCta", clean(by.activity)],
    ["partnerEsimCta", clean(by.esim)],
    ["partnerRailCta", clean(by.rail)],
    ["partnerBusCta", clean(by.bus)],
  ] as const).filter(([, offers]) => offers.length > 0);
  if (rows.length === 0) return null;

  return (
    <div className={`rounded-[4px] border px-4 py-3 flex flex-col gap-2 ${className}`}
      style={{ borderColor: "var(--qh-line, #DFE7F2)", backgroundColor: "var(--qh-surface, #fff)" }}>
      {rows.map(([ctaKey, offers]) => {
        const offer = offers[0]!;      // 추천 1
        const alt = offers[1] ?? null; // 검증된 대안 최대 1
        return (
          <span key={ctaKey} className="min-w-0 block">
            <AffiliateLink
              href={offer.href}
              provider={offer.partner}
              title={`${offer.purpose}-${citySlug}`}
              city={citySlug}
              kind="affiliate"
              surface={surface}
              purpose={offer.purpose}
              locale={locale}
              className="gkm-focus block text-[14px] font-semibold truncate"
            >
              <span style={{ color: "var(--qh-ink, #16233B)" }}>
                {t(ctaKey, { city: cityLabel })} · {PARTNER_NAMES[offer.partner]} →
              </span>
            </AffiliateLink>
            {alt && (
              <span className="block mt-0.5 text-[11px]" style={{ color: "var(--qh-faint, #8DA0BF)" }}>
                <AffiliateLink
                  href={alt.href}
                  provider={alt.partner}
                  title={`${alt.purpose}-${citySlug}`}
                  city={citySlug}
                  kind="affiliate"
                  surface={surface}
                  purpose={alt.purpose}
                  locale={locale}
                  className="gkm-focus underline underline-offset-2"
                >
                  {t("partnerAlt", { partner: PARTNER_NAMES[alt.partner] })}
                </AffiliateLink>
              </span>
            )}
          </span>
        );
      })}
      {/* 사용자 눈에 읽히는 제휴 고지 — 이 박스 전체가 제휴 영역임을 항상 명시 */}
      <span className="block text-[11px]" style={{ color: "var(--qh-faint, #8DA0BF)" }}>
        {t("partnerSponsored")}
      </span>
    </div>
  );
}
