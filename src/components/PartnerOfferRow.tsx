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
  offersFor, isLegacyAffiliateUrl, PARTNER_NAMES, type PartnerLocale,
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
  const offers = offersFor(citySlug, locale).filter(o => !isLegacyAffiliateUrl(o.href));
  if (offers.length === 0) return null;
  const offer = offers[0]!;      // 추천 1
  const alt = offers[1] ?? null; // 검증된 대안이 있을 때만(최대 1)

  return (
    <div className={`flex items-center justify-between gap-3 rounded-[4px] border px-4 py-3 ${className}`}
      style={{ borderColor: "var(--qh-line, #DFE7F2)", backgroundColor: "var(--qh-surface, #fff)" }}>
      <span className="min-w-0">
        <AffiliateLink
          href={offer.href}
          provider={offer.partner}
          title={`stay-${citySlug}`}
          city={citySlug}
          kind="affiliate"
          surface={surface}
          purpose={offer.purpose}
          locale={locale}
          className="gkm-focus block text-[14px] font-semibold truncate"
        >
          <span style={{ color: "var(--qh-ink, #16233B)" }}>
            {t("partnerStayCta", { city: cityLabel })} · {PARTNER_NAMES[offer.partner]} →
          </span>
        </AffiliateLink>
        {/* 사용자 눈에 읽히는 제휴 고지 — 항상 링크와 함께. 대안은 같은 줄의
            조용한 보조 링크(추천과 시각 위계 구분). */}
        <span className="block mt-0.5 text-[11px]" style={{ color: "var(--qh-faint, #8DA0BF)" }}>
          {t("partnerSponsored")}
          {alt && (
            <>
              {" · "}
              <AffiliateLink
                href={alt.href}
                provider={alt.partner}
                title={`stay-${citySlug}`}
                city={citySlug}
                kind="affiliate"
                surface={surface}
                purpose={alt.purpose}
                locale={locale}
                className="gkm-focus underline underline-offset-2"
              >
                {t("partnerAlt", { partner: PARTNER_NAMES[alt.partner] })}
              </AffiliateLink>
            </>
          )}
        </span>
      </span>
    </div>
  );
}
