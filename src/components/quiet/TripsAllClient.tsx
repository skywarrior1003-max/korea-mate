"use client";

// Trips View All — 인기|신규 (PAGINATION-AND-NEW-DISCOVERY-V1 §8-2)
//
//  · 인기: 여행자 추천 Story 의 서버 확정 전역 순위(24개 단위 더 보기) 위에,
//    기존 공식 추천 코스 섹션을 그대로 분리 유지(editorial 순번 `공식 추천 · N`).
//  · 신규: 최근 60일 승인 여행자 Story 만(서버 확정 순위). 0건이면 공식으로
//    채우지 않고 조용한 빈 상태 + 인기 복귀 진입점.
//  · 순위·페이지는 서버가 결정 — 클라이언트 재정렬·score 계산 없음.
//  · 신규 상태는 URL(?tab=new)로 직접 진입·공유·새로고침·뒤로 가기.

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { getRecommendedTrips, tripDisplayTitle } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";
import { tripCoverSpot, tripKindLabelKey } from "./TripCourseClient";
import { DEFAULT_PAGE_LIMIT } from "@/lib/community/ranking-page-core";

/** 서버 순위 Story 카드(rank = 전역 순위·score/싫어요는 응답에 없다) */
interface CommunityTripCard {
  id: string; title: string | null; days: number; stops: number;
  likeCount: number; copyCount: number; cover?: string | null; rank: number;
}
interface StoryPage { items: CommunityTripCard[]; page: number; total: number; hasMore: boolean }

type Tab = "popular" | "new";

// SSG HTML 은 항상 인기 탭으로 구워진다. 딥링크(?tab=new)에서 첫 클라이언트
// 렌더가 서버와 달라지면 hydration mismatch(#418)가 난다 — HomeClient hasTrip
// 선례와 같은 useSyncExternalStore 로 서버 스냅숏("" = 인기)을 첫 렌더에 쓰고,
// hydration 직후 실제 URL 값으로 갈아탄다(효과 내 동기 setState 없이).
const subscribeNav = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
function useUrlTab(searchFromRouter: string | null): Tab {
  const search = useSyncExternalStore(
    subscribeNav,
    () => window.location.search,
    () => "",
  );
  // 라우터 push 로 바뀐 값은 useSearchParams 재렌더 때 getSnapshot 이 다시 읽는다
  void searchFromRouter;
  return new URLSearchParams(search).get("tab") === "new" ? "new" : "popular";
}

function TripsAllInner({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const city = quietCity(slug);
  const tab = useUrlTab(searchParams.toString());

  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  const [cards, setCards] = useState<CommunityTripCard[]>([]);
  const [pageMeta, setPageMeta] = useState<{ page: number; hasMore: boolean; loaded: boolean }>({ page: 0, hasMore: false, loaded: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);

  const fetchPage = useCallback(async (mode: Tab, page: number): Promise<StoryPage | null> => {
    try {
      const r = await fetch(`/api/recommendations/${slug}/stories?mode=${mode}&page=${page}&limit=${DEFAULT_PAGE_LIMIT}`);
      if (!r.ok) return null;
      const j = await r.json() as StoryPage;
      return Array.isArray(j.items) ? j : null;
    } catch { return null; }
  }, [slug]);

  useEffect(() => {
    let alive = true;
    fetchPage(tab, 1).then(j => {
      if (!alive) return;
      setCards(j?.items ?? []);
      setPageMeta({ page: j ? 1 : 0, hasMore: j?.hasMore ?? false, loaded: true });
    });
    return () => { alive = false; };
  }, [slug, tab, fetchPage]);

  const loadMore = async () => {
    if (busy || !pageMeta.hasMore) return;
    setBusy(true);
    const j = await fetchPage(tab, pageMeta.page + 1);
    if (j) {
      setCards(prev => [...prev, ...j.items]);
      setPageMeta({ page: j.page, hasMore: j.hasMore, loaded: true });
    }
    setBusy(false);
  };

  // 탭 전환은 Link 내비게이션(정적 export 에서 router.push 의 쿼리 갱신이
  // 신뢰되지 않는다) — URL 이 상태의 정본이므로 앱의 일반 링크 문법을 쓴다.
  const tabHref = (m: Tab) => `${pathname}?tab=${m === "new" ? "new" : "popular"}`;

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const trips = getRecommendedTrips(slug);
  const byId = new Map((spots ?? []).map(s => [Number(s.id), s]));

  const storyRow = (ct: CommunityTripCard) => (
    <li key={`${tab}-${ct.id}`}>
      <Link href={`/shared/?id=${ct.id}`} className="flex items-center gap-3.5 py-3 border-b border-[var(--qh-line)] gkm-focus min-h-11">
        {ct.cover && (
          <span className="relative flex-none w-[56px] h-[56px] rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
            <Image src={ct.cover} alt="" fill sizes="56px" className="object-cover" unoptimized />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-[var(--qh-ink)] truncate">
            {ct.title ?? t("communityTravelerCourse")}
          </span>
          <span className="block mt-0.5 text-[12px] text-[var(--qh-faint)] truncate">
            {/* 여행자 순위(`N위`)와 신규 순위는 각자의 목록 안 표기 — 혼합 없음 */}
            <span className="font-bold" style={{ color: "var(--qh-blue)" }}>
              {t(tab === "new" ? "communityNewRank" : "communityTravelerRank", { n: ct.rank })}
            </span>
            {ct.days >= 1 ? ` · ${ct.days}d` : ""}{ct.stops > 0 ? ` · ${ct.stops} stops` : ""}
            {` · ${t("communityLiked", { count: ct.likeCount })} · ${t("communityCopied", { count: ct.copyCount })}`}
          </span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {cityLabel}
        </Link>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)]">{t("tripsIn", { city: cityLabel })}</h1>

        {/* §8-2 인기|신규 전환 — URL 이 상태의 정본 */}
        <div role="tablist" aria-label={t("tripsIn", { city: cityLabel })} className="mt-3 inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--qh-line)", background: "#fff" }}>
          {(["popular", "new"] as const).map(m => (
            <Link key={m} href={tabHref(m)} scroll={false} role="tab" aria-selected={tab === m}
              className="gkm-focus inline-flex items-center rounded-full px-4 min-h-10 text-[13px] font-semibold"
              style={tab === m ? { background: "var(--qh-ink)", color: "var(--qh-paper)" } : { color: "var(--qh-faint)" }}>
              {t(m === "new" ? "tabNew" : "tabPopular")}
            </Link>
          ))}
        </div>

        {tab === "new" ? (
          pageMeta.loaded && cards.length === 0 ? (
            /* 신규 0건 — 공식 코스로 채우지 않는다(§8-2) */
            <div className="mt-8 text-center">
              <p className="text-[13.5px] text-[var(--qh-faint)]">{t("newStoriesEmpty")}</p>
              <Link href={tabHref("popular")} scroll={false}
                className="gkm-focus mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold" style={{ color: "var(--qh-blue)" }}>
                {t("backToPopular")} <span aria-hidden className="ml-1">→</span>
              </Link>
            </div>
          ) : (
            <ul className="mt-2">{cards.map(storyRow)}</ul>
          )
        ) : (
          <>
            {cards.length > 0 && (
              <>
                <h2 className="mt-5 text-[11px] font-black tracking-[.14em] uppercase" style={{ color: "var(--qh-blue)" }}>
                  {t("communityTravelerCourses")}
                </h2>
                <ul className="mt-1">{cards.map(storyRow)}</ul>
              </>
            )}
            {pageMeta.hasMore && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={loadMore} disabled={busy}
                  className="gkm-focus inline-flex min-h-11 items-center rounded-full border px-5 text-[13.5px] font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--qh-line)", color: "var(--qh-ink)", background: "#fff" }}>
                  {t("loadMore")}
                </button>
              </div>
            )}
            {/* 공식 코스는 별도 섹션·editorial 순번 — 여행자 순위와 절대 혼합 금지 */}
            {trips.length > 0 && (
              <h2 className="mt-6 text-[11px] font-black tracking-[.14em] uppercase" style={{ color: "var(--qh-faint)" }}>
                {t("communityEditorialCourses")}
              </h2>
            )}
            {trips.length === 0 ? (
              <p className="mt-5 text-[13px] text-[var(--qh-faint2)]">{t("tripsSoon", { city: cityLabel })}</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {trips.map((trip, ti) => {
                  const cover = tripCoverSpot(trip, byId);
                  const previewSource = trip.stops.length > 0
                    ? trip.stops.map(s => (locale !== "ko" && s.nameEn ? s.nameEn : s.name))
                    : (trip.legacyContent?.items ?? []).map(it => it.name);
                  const preview = previewSource.slice(0, 3).filter((n): n is string => Boolean(n));
                  const previewTotal = trip.stops.length > 0 ? trip.stops.length : (trip.legacyContent?.items.length ?? 0);
                  return (
                    <li key={trip.id} className="py-4 border-b border-[var(--qh-line)]">
                      <Link href={`/city/${slug}/trips/${trip.id}`} className="block gkm-focus rounded-[4px] min-h-11">
                        {cover?.image && (
                          <span className="relative block aspect-[16/9] rounded-[4px] overflow-hidden bg-[var(--qh-line)] mb-2.5">
                            <img src={cover.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          </span>
                        )}
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[16px] font-semibold text-[var(--qh-ink)] leading-snug">{tripDisplayTitle(trip, locale)}</span>
                          {trip.days && Number.isInteger(trip.days) && trip.days >= 1 && (
                            <span className="flex-none whitespace-nowrap text-[12px] text-[var(--qh-faint)]">
                              {trip.days}d{trip.stops.length > 0 ? ` · ${trip.stops.length} stops` : ""}
                            </span>
                          )}
                        </span>
                        <span className="block mt-0.5 text-[12px] text-[var(--qh-faint)]">
                          <span className="font-semibold">{t("communityOfficialRank", { n: ti + 1 })}</span>
                          {` · ${t(tripKindLabelKey(trip))}`}
                          {!Number.isInteger(trip.days) && trip.durationLabel && locale === "ko" ? ` · ${trip.durationLabel}` : ""}
                        </span>
                        {trip.theme ? (
                          <span className="block mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(33,29,23,.6)" }}>{trip.theme}</span>
                        ) : trip.legacyContent?.intro && locale === "ko" ? (
                          <span className="block mt-1 text-[13px] leading-relaxed line-clamp-2" style={{ color: "rgba(33,29,23,.6)" }}>
                            {trip.legacyContent.intro.split("\n")[0]}
                          </span>
                        ) : null}
                        {preview.length > 0 && (
                          <span className="block mt-1 text-[12px] text-[var(--qh-faint2)] truncate">
                            {preview.join(trip.stops.length > 0 ? " → " : " · ")}{previewTotal > preview.length ? " …" : ""}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TripsAllClient({ slug }: { slug: string }) {
  // useSearchParams 는 정적 export 에서 Suspense 경계가 필요하다
  return (
    <Suspense fallback={null}>
      <TripsAllInner slug={slug} />
    </Suspense>
  );
}
