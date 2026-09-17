"use client";

// PHASE 10 — 조용한 예약 보조 (Owner 승인 표면 전용, 2026-09-13)
// 2026-09-17 (Owner 합의) city-hub-essentials 는 "목적 선택형 여행 준비"로 변경:
//  · 기본 상태 = 목적 선택 항목만 조용히 제공(링크 스택을 펼쳐 놓지 않음,
//    특정 파트너를 기본 강조하지 않음).
//  · 선택 후 = 그 목적의 검증된 추천 1 + 대안 ≤1 만 표시(다른 목적과 동시 노출 0),
//    다시 접거나 다른 목적으로 전환 가능.
//  · 미검증 목적·언어 조합은 선택 항목 자체가 생기지 않는다(빈 항목 0).
// my-trip-prep 는 기존 스택 렌더 유지(기존 기능 보존 — 회귀만 확인).
//
// 불변 계약:
//  · isCommerceAllowedOnSurface 통과 표면에서만 anchor 생성.
//  · 링크는 partner-links 활성 매트릭스에서만 — 검증 안 된 조합은 렌더 0. 깨진 버튼 0.
//  · 가시적 제휴 고지 + rel=sponsored 병행(§14-1-B).
//  · 문구는 범위를 정직하게(도시 검색/전국 상품) — 날짜·개별 상품 맞춤 위장 금지.
//  · 구세대 링크가 섞이면 그리지 않는다(마지막 방어선).

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import AffiliateLink from "@/components/AffiliateLink";
import { isEditorialAffiliateEnabled } from "@/config/commerce-surfaces";
import {
  offersByPurpose, isLegacyAffiliateUrl, PARTNER_NAMES, type PartnerLocale,
} from "@/config/partner-links";

const SUPPORTED: readonly string[] = ["en", "ko", "ja", "zh"];
// 목적 순서 고정 — [선택칩 라벨 키, 노출 CTA 키(기존 정직 문구 재사용)]
const PURPOSES = [
  ["stay", "prepStay", "partnerStayCta"],
  ["activity", "prepActivity", "partnerActivityCta"],
  ["esim", "prepEsim", "partnerEsimCta"],
  ["rail", "prepRail", "partnerRailCta"],
  ["bus", "prepBus", "partnerBusCta"],
] as const;

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
  const [picked, setPicked] = useState<string | null>(null);
  if (!isEditorialAffiliateEnabled(surface)) return null;
  const locale = (SUPPORTED.includes(rawLocale) ? rawLocale : "en") as PartnerLocale;
  const by = offersByPurpose(citySlug, locale);
  const clean = (arr: typeof by.stay) => arr.filter(o => !isLegacyAffiliateUrl(o.href));
  const available = PURPOSES
    .map(([key, chipKey, ctaKey]) => ({ key, chipKey, ctaKey, offers: clean(by[key]) }))
    .filter(p => p.offers.length > 0);
  if (available.length === 0) return null;

  // 노출 링크 1묶음(추천 1 + 대안 ≤1) — 두 표면이 같은 마크업을 쓴다.
  const offerBlock = (ctaKey: string, offers: typeof by.stay) => {
    const offer = offers[0]!;
    const alt = offers[1] ?? null;
    return (
      <span className="min-w-0 block">
        <AffiliateLink
          href={offer.href} provider={offer.partner} title={`${offer.purpose}-${citySlug}`}
          city={citySlug} kind="affiliate" surface={surface} purpose={offer.purpose} locale={locale}
          className="gkm-focus block text-[14px] font-medium truncate"
        >
          {/* 사용자 목적이 앞, 파트너명은 보조 */}
          <span style={{ color: "var(--qh-ink, #16233B)" }}>{t(ctaKey, { city: cityLabel })}</span>
          <span style={{ color: "rgba(33,29,23,.62)" }}> · {PARTNER_NAMES[offer.partner]} →</span>
        </AffiliateLink>
        {alt && (
          <span className="block mt-0.5 text-[12px]" style={{ color: "rgba(33,29,23,.62)" }}>
            <AffiliateLink
              href={alt.href} provider={alt.partner} title={`${alt.purpose}-${citySlug}`}
              city={citySlug} kind="affiliate" surface={surface} purpose={alt.purpose} locale={locale}
              className="gkm-focus underline underline-offset-2"
            >
              {t("partnerAlt", { partner: PARTNER_NAMES[alt.partner] })}
            </AffiliateLink>
          </span>
        )}
      </span>
    );
  };

  if (surface === "my-trip-prep") {
    // 기존 동작 보존: 검증된 목적을 세로로(변경 없음 — 회귀 방지)
    return (
      <div className={`rounded-[4px] border px-4 py-3 flex flex-col gap-2 ${className}`}
        style={{ borderColor: "var(--qh-line, #DFE7F2)", backgroundColor: "var(--qh-surface, #fff)" }}>
        {available.map(p => <span key={p.key}>{offerBlock(p.ctaKey, p.offers)}</span>)}
        <span className="block text-[11.5px]" style={{ color: "rgba(33,29,23,.62)" }}>{t("partnerSponsored")}</span>
      </div>
    );
  }

  // city-hub-essentials: 목적 선택형
  const active = available.find(p => p.key === picked) ?? null;
  return (
    <div className={`rounded-[4px] border px-4 py-3 ${className}`}
      style={{ borderColor: "var(--qh-line, #DFE7F2)", backgroundColor: "var(--qh-surface, #fff)" }}>
      <span className="block text-[13px] font-semibold" style={{ color: "var(--qh-ink, #16233B)" }}>{t("tripPrepTitle")}</span>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("tripPrepTitle")}>
        {available.map(p => {
          const on = picked === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(on ? null : p.key)}
              className="gkm-focus rounded-full border px-3 py-1.5 min-h-9 text-[12.5px] font-medium"
              style={on
                ? { borderColor: "var(--qh-navy, #001654)", backgroundColor: "var(--qh-navy, #001654)", color: "#fff" }
                : { borderColor: "var(--qh-line, #DFE7F2)", backgroundColor: "transparent", color: "rgba(33,29,23,.72)" }}
            >
              {t(p.chipKey)}
            </button>
          );
        })}
      </div>
      {active && (
        <div className="mt-3">
          {offerBlock(active.ctaKey, active.offers)}
          <span className="block mt-1.5 text-[11.5px]" style={{ color: "rgba(33,29,23,.62)" }}>{t("partnerSponsored")}</span>
        </div>
      )}
    </div>
  );
}
