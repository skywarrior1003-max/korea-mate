// S1 — Place Detail 본문 (design-system.md PlaceDetail·EssentialsStrip)
// 원칙: 방문 판단에 충분한 요약 + 공식 원문 링크(기관명 표시). 얕은 복제 금지.
// 데이터 없는 필드는 렌더하지 않는다 (unknown ≠ 불가). 가짜 수치·후기 금지.
// Save가 primary (일정 컨텍스트 없는 화면 — coral 1개 규칙), Start planning은 quiet.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TopNav, Card, Badge } from "@/components/ui";
import { getFavorites, toggleFavorite, cacheSavedSpot, uncacheSavedSpot } from "@/lib/favorites";
import type { CitySpotRow } from "@/lib/city-spots";
import type { EventItem } from "@/lib/cart";

// Explore(toEventItem)와 동일한 id 체계(local-<id>)로 저장 — Saved 패널·페이지와 호환
function toSavedEvent(s: CitySpotRow): EventItem {
  return {
    id: `local-${s.id}`,
    type: s.category as EventItem["type"],
    isAnchor: false,
    journeyCluster: `${s.city.toLowerCase()}-explore`,
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: [],
    transitFromAnchor: null,
    name: s.name,
    shortName: s.name,
    tags: s.tags ?? [],
    city: s.city,
    district: s.district ?? "",
    address: s.address ?? "",
    mapUrl: s.map_url ?? "",
    naverMapUrl: s.naver_map_url ?? undefined,
    description: s.description ?? "",
    whyItMatters: s.why_it_matters ?? "",
    recommendedDurationMinutes: s.duration_minutes ?? 60,
    bestTimeSlot: s.best_time_slot ?? "anytime",
    openingHours: s.opening_hours,
    image: s.image_url,
    startDate: null,
    endDate: null,
    isTrending: false,
    soloFriendly: s.solo_friendly,
    foreignCardAccepted: s.foreign_card_accepted,
    cashOnly: s.cash_only ?? false,
    englishMenu: false, // 확인되지 않은 사실 — 긍정 값 하드코딩 금지
    barrierFree: false,
    koreanSurvivalScore: 0,
    notice: null,
    lat: s.lat ?? undefined,
    lng: s.lng ?? undefined,
    commerce: {
      affiliateType: s.affiliate_url ? "booking" : null,
      hasAffiliate: !!s.affiliate_url,
      affiliatePartner: s.affiliate_provider,
      affiliateUrl: s.affiliate_url,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null,
    },
  };
}

// 공식 링크 출처 기관명 추출 (도메인 기반 — 알 수 없으면 도메인 자체 표기)
function officialSourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("visitbusan"))   return "Visit Busan";
    if (host.includes("visitseoul"))   return "Visit Seoul";
    if (host.includes("visitjeju"))    return "Visit Jeju";
    if (host.includes("gyeongju"))     return "Visit Gyeongju";
    if (host.includes("visitkorea") || host.includes("knto")) return "Visit Korea";
    return host;
  } catch {
    return "official site";
  }
}

const CATEGORY_EMOJI: Record<string, string> = {
  attraction: "🏛️", restaurant: "🍽️", nature: "🌿", event: "🎉", accommodation: "🏨",
};

// 표시용 첫 글자 대문자 (DB 값은 소문자 저장 — "busan" → "Busan")
function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

export default function PlaceDetailClient({ spot }: { spot: CitySpotRow }) {
  const t = useTranslations("place");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(getFavorites().includes(`local-${spot.id}`));
  }, [spot.id]);

  function handleSave() {
    const id = `local-${spot.id}`;
    const nowSaved = toggleFavorite(id);
    if (nowSaved) cacheSavedSpot(toSavedEvent(spot));
    else uncacheSavedSpot(id);
    setSaved(nowSaved);
  }

  const oneLiner = spot.why_it_matters ?? (spot.description ? spot.description.split(".")[0] + "." : null);
  const catLabel = [cap(spot.category), spot.subcategory].filter(Boolean).join(" · ");
  const mapHref = spot.naver_map_url || spot.map_url;

  return (
    <div className="min-h-screen bg-surface-dim flex flex-col">
      <TopNav />

      {/* 모바일 상단 바 */}
      <header className="md:hidden bg-surface border-b border-line px-4 h-14 flex items-center gap-3">
        <Link href={`/explore/${spot.city.toLowerCase()}`} className="gkm-focus text-sub text-lg" aria-label={t("backExplore")}>←</Link>
        <p className="font-bold text-ink truncate">{spot.name}</p>
      </header>

      {/* pb-24: 우하단 My Picks 드로어·모바일 BottomNav에 하단 버튼이 가려지지 않도록 */}
      <main className="flex-1 w-full max-w-[720px] mx-auto md:px-4 md:py-6 pb-24">
        <Card className="md:rounded-card rounded-none border-x-0 md:border-x">
          {/* 대표 사진 (fallback 내장) */}
          <div className="relative h-56 md:h-72 bg-surface-dim flex items-center justify-center overflow-hidden">
            {spot.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={spot.image_url} alt={spot.name} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-faint">
                <span className="text-4xl" aria-hidden>{CATEGORY_EMOJI[spot.category] ?? "📍"}</span>
                <span className="text-xs font-medium">Photo coming soon</span>
              </div>
            )}
          </div>

          <div className="p-5 md:p-7">
            {/* 이름·지역·카테고리 */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold text-ink leading-tight" style={{ textWrap: "balance" }}>
                  {spot.name}
                </h1>
                <p className="text-sm text-faint mt-1.5">
                  {[spot.district, cap(spot.city), catLabel].filter(Boolean).join(" · ")}
                </p>
              </div>
              {/* Save — 이 화면의 유일한 coral primary */}
              <button
                onClick={handleSave}
                aria-pressed={saved}
                className={`gkm-focus shrink-0 min-h-11 px-4 rounded-control text-sm font-bold transition-colors ${
                  saved
                    ? "bg-action-tint text-action"
                    : "bg-action text-white hover:bg-action-hover shadow-cta"
                }`}
              >
                {saved ? `✓ ${t("savedState")}` : `🔖 ${t("save")}`}
              </button>
            </div>

            {/* 한 줄 추천 이유 */}
            {oneLiner && (
              <p className="mt-4 text-[15px] text-sub leading-relaxed border-l-2 border-action pl-3">
                {oneLiner}
              </p>
            )}

            {/* 여행자 편의 chips — 확인된 사실만 (unknown은 렌더 안 함) */}
            <div className="flex flex-wrap gap-2 mt-4">
              {spot.solo_friendly && <Badge kind="editorial">{t("soloFriendly")}</Badge>}
              {spot.foreign_card_accepted && <Badge kind="editorial">{t("cardOk")}</Badge>}
              {spot.cash_only === true && <Badge kind="editorial-warm">{t("cashOnly")}</Badge>}
              {spot.source_type === "tourapi" && <Badge kind="source">Official info</Badge>}
            </div>

            {/* EssentialsStrip — 알려진 사실만, 빈 셸 금지 */}
            <dl className="mt-6 flex flex-col gap-3 text-sm">
              {spot.opening_hours && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-faint font-medium">{t("hours")}</dt>
                  <dd className="text-ink font-medium">{spot.opening_hours.open} – {spot.opening_hours.close}</dd>
                </div>
              )}
              {spot.entry_fee && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-faint font-medium">{t("entryFee")}</dt>
                  <dd className="text-ink font-medium">{spot.entry_fee}</dd>
                </div>
              )}
              {typeof spot.duration_minutes === "number" && spot.duration_minutes > 0 && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-faint font-medium">{t("duration")}</dt>
                  <dd className="text-ink font-medium">~{spot.duration_minutes} min</dd>
                </div>
              )}
              {spot.address && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-faint font-medium">{t("address")}</dt>
                  <dd className="text-ink">
                    {spot.address}
                    {mapHref && (
                      <a href={mapHref} target="_blank" rel="noopener noreferrer"
                         className="gkm-focus ml-2 text-official font-semibold whitespace-nowrap">
                        Map ↗
                      </a>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {/* 상세 설명 (요약 수준 — 전체 소개는 공식 원문으로) */}
            {spot.description && (
              <section className="mt-6">
                <h2 className="text-base font-bold text-ink mb-2">{t("details")}</h2>
                <p className="text-sm text-sub leading-relaxed">{spot.description}</p>
              </section>
            )}

            {/* 공식 원문 링크 — 기관명 명시 */}
            {spot.official_url && (
              <a
                href={spot.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="gkm-focus mt-6 flex items-center justify-between gap-3 p-4 rounded-control bg-official-tint text-official font-semibold text-sm"
              >
                <span>{t("officialLink", { source: officialSourceName(spot.official_url) })}</span>
                <span aria-hidden>↗</span>
              </a>
            )}

            {/* 일정 연결 — S1: quiet Start planning (Add to trip은 S2 일정 컨텍스트에서) */}
            <div className="mt-8 pt-5 border-t border-line flex items-center justify-between gap-3">
              <Link href={`/explore/${spot.city.toLowerCase()}`} className="gkm-focus text-sm font-semibold text-sub hover:text-ink">
                ← {t("backExplore")}
              </Link>
              <Link href="/#planner" className="gkm-focus text-sm font-semibold text-sub hover:text-ink border border-line rounded-control min-h-11 px-4 inline-flex items-center">
                {t("startPlanning")}
              </Link>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
