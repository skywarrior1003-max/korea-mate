"use client";

// gokoreamate — Trips (My Trips) 목록
//
// TASK-MY-TRIPS-FINAL-UI-V1: 화면은 오너 최종 승인 시안
// `stitch_gokoreamate_trips/my_trips_final` 을 그대로 따른다.
//
//   My Trips (headline, serif)
//   TRAVELING NOW  — 진행 중인 여행 하나를 큰 사진 카드로 (날짜·도시 / 제목 / Today · 장소)
//   UPCOMING       — 예정 여행을 썸네일 한 줄로 반복
//   + New trip     — 점선 (기존 플래너 /#planner 로)
//   Past trips live in Story → — 지난 여행은 목록에 큰 카드로 반복하지 않는다.
//                   한 줄을 누르면 같은 줄 문법으로 펼쳐지고, 각 줄은 그 여행의 Story
//                   (`/itinerary?id=…&view=story`) 로 간다 — Story 진입 계약 보존.
//
// 바뀌지 않은 것: 데이터(/api/itineraries, device 소유), lifecycle 은 실제 날짜 하나로만
// 가른다(trips-lifecycle.ts), My Trip 진입(/itinerary?id=), 삭제(서버 삭제 뒤 목록에서
// 제거 + 이 여행의 로컬 캐시만 정리). 공개/비공개 전환과 공유 링크 복사는 My Trip
// 화면에 그대로 있다 — 목록 시안에는 없어 여기서는 그리지 않는다.
//
// 만들지 않는 것: 가짜 현재 위치(GPS 없음 — "Today · 장소"는 일정 시간으로만), 통계·
// 배지·emoji, 없는 도시 사진을 다른 도시 사진으로 메우기.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  apiFetchItinerariesByDevice,
  apiDeleteItinerary,
  apiFetchItinerary,
} from "@/lib/itinerary-api";
import type { ItineraryRow } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { visitedStorageKey } from "@/lib/visited";
import { cityVisual } from "@/lib/city-visual";
import { CITY_CONFIGS, cityLabelKey } from "@/data/cities";
import { classifyTrips, todayStopLabel, formatTripDates } from "@/lib/trips/trips-lifecycle";
import { seoulClock } from "@/lib/trips/seoul-clock";
import {
  TRIPS_COLORS as C, SP, RADIUS_XL,
  HEADLINE_LG_MOBILE, HEADLINE_LG, HEADLINE_MD, BODY_LG, BODY_MD, LABEL_LG,
} from "@/components/trips/trips-tokens";
import { SectionLabel, TripRow, DashedAction, InlineConfirm } from "@/components/trips/TripsPrimitives";
import TravelingNowHero from "@/components/trips/TravelingNowHero";

// ── 내부 Trip 모델 ────────────────────────────────────────────────────────────
interface Trip {
  id:        string;
  city:      string;
  startDate: string;
  endDate:   string;
  tripTitle: string | null;
  updatedAt: string;
}

function rowToTrip(r: ItineraryRow): Trip {
  return {
    id:        r.id,
    city:      r.city || "Korea",
    startDate: r.start_date ?? "",
    endDate:   r.end_date   ?? "",
    tripTitle: r.trip_title ?? null,
    updatedAt: r.updated_at ?? "",
  };
}

const cityCap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

// ══════════════════════════════════════════════════════════════════════════════
export default function MyTripsPage() {
  const t      = useTranslations("trips");
  const tNav   = useTranslations("nav");
  const tPicks = useTranslations("picks");
  const tForm  = useTranslations("tripForm");
  const locale = useLocale();
  const [trips,      setTrips]      = useState<Trip[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pastOpen,   setPastOpen]   = useState(false);
  // 어느 여행의 것인지 같이 들고 있어야 여행이 바뀌어도 옛 장소가 잠깐 남지 않는다
  const [todayStop,  setTodayStop]  = useState<{ tripId: string; label: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetchItinerariesByDevice(getDeviceId()).then((itins) => {
      if (cancelled) return;
      const sorted = itins
        .map(rowToTrip)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setTrips(sorted);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLoading(false); setFetchError(true); } });

    return () => { cancelled = true; };
  }, []);

  const handleDelete = useCallback(async (trip: Trip) => {
    setDeleting(trip.id);
    setConfirmDel(null);

    // 목록에서 빼는 것도 서버가 실제로 지운 뒤에 한다. 먼저 지워 두면 요청이
    // 실패했을 때 여행은 서버에 그대로 남아 있는데 화면에서만 사라져,
    // 새로고침해야 다시 나타난다.
    const serverDeleted = await apiDeleteItinerary(trip.id, getDeviceId());
    if (!serverDeleted) { setDeleting(null); return; }

    setTrips(prev => prev.filter(t => t.id !== trip.id));

    // 이 여행에 속한 로컬 기록만 지운다.
    //
    // 예전에는 `koreamate_itin` 으로 시작하는 키를 **전부** 지웠다. 그 접두사는
    // 여행 하나가 아니라 모든 여행의 캐시를 덮어서, 여행 한 개를 지우면 남은
    // 여행들의 일정 캐시까지 같이 날아갔다.
    //
    // `koreamate_itin3_id_*` 는 키가 아니라 **값**이 여행 ID다(키는 URL 파라미터로
    // 만든다). 그래서 값이 이 여행일 때만 지운다. 구버전 `koreamate_itin_v2_*` ·
    // `koreamate_itin_id_*` 는 /itinerary 가 진입할 때마다 스스로 철거하므로
    // 여기서 건드리지 않는다.
    try {
      const toRemove = [
        `koreamate_moments_${trip.id}`,
        visitedStorageKey(trip.id),
        `koreamate_daydone_${trip.id}`,
      ];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("koreamate_itin3_id_") && localStorage.getItem(k) === trip.id) {
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    setDeleting(null);
  }, []);

  // 오늘 — 여행 날짜와 같은 한국 달력(Asia/Seoul). /itinerary 의 isPastTrip 과 같은 기준.
  // UTC 날짜를 쓰면 한국 아침(UTC 전날)에 8/22 시작 여행이 아직 Upcoming 으로 보였다.
  const todayISO = seoulClock().todayISO;
  const { traveling, upcoming, past } = useMemo(() => classifyTrips(trips, todayISO), [trips, todayISO]);
  const hero = traveling[0] ?? null;

  // "Today · 장소" — 진행 중 여행 하나의 일정만 소유자 GET 으로 받아 오늘 Day 의
  // 시간으로 고른다. 목록 API 는 days 를 주지 않는다. GPS 를 읽지 않는다.
  const heroId = hero?.id ?? null;
  useEffect(() => {
    if (!heroId) return;
    let cancelled = false;
    apiFetchItinerary(heroId, getDeviceId()).then(row => {
      if (cancelled) return;
      // 장소 time 은 한국 시각이다 — 지금도 같은 시계로 읽는다
      const { nowHHMM } = seoulClock();
      setTodayStop({ tripId: heroId, label: todayStopLabel(row?.days, todayISO, nowHHMM) });
    }).catch(() => { if (!cancelled) setTodayStop({ tripId: heroId, label: null }); });
    return () => { cancelled = true; };
  }, [heroId, todayISO]);
  const heroChip = hero && todayStop?.tripId === hero.id ? todayStop.label : null;

  // 도시 이름은 이미 있는 번역(tripForm.city_*)으로. 모르는 도시는 slug 를 대문자로.
  const cityLabel = (slug: string) => {
    const conf = CITY_CONFIGS[slug.toLowerCase()];
    return conf ? tForm(cityLabelKey(conf)) : cityCap(slug);
  };
  const titleOf = (trip: Trip) => trip.tripTitle || t("titleFallback", { city: cityLabel(trip.city) });
  const datesOf = (trip: Trip) => formatTripDates(trip.startDate, trip.endDate, locale);
  const confirmFor = (trip: Trip) => confirmDel === trip.id || deleting === trip.id ? (
    <InlineConfirm
      question={t("confirmDelete")}
      confirmLabel={tPicks("delete")}
      cancelLabel={tPicks("cancel")}
      busy={deleting === trip.id}
      onConfirm={() => handleDelete(trip)}
      onCancel={() => setConfirmDel(null)}
    />
  ) : undefined;
  const rowOf = (trip: Trip, href: string) => (
    <TripRow
      key={trip.id}
      href={href}
      title={titleOf(trip)}
      dates={datesOf(trip)}
      visual={cityVisual(trip.city)}
      cityLabel={cityLabel(trip.city)}
      onMore={() => setConfirmDel(prev => prev === trip.id ? null : trip.id)}
      moreLabel={t("moreActions")}
      confirm={confirmFor(trip)}
    />
  );

  const showEmpty = !loading && !fetchError && trips.length === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.surface, color: C.onSurface }}>

      {/* 시안의 상단 바는 데스크톱에만 있다(모바일은 바로 제목부터). 메뉴·검색 버튼은
          이 화면에 연결된 기능이 없어 그리지 않는다 — 브랜드 글자만 홈으로 간다. */}
      <header className="hidden md:flex items-center justify-center backdrop-blur-md"
              style={{ padding: `${SP.mobile}px ${SP.desktop}px`, backgroundColor: "rgba(248,249,250,0.8)" }}>
        <Link href="/" className="gkm-focus tracking-widest" style={{ ...BODY_LG, fontWeight: 300, color: C.primary }}>
          gokoreamate
        </Link>
      </header>

      {/* 한 열짜리 목록이다 — 넓은 화면에서도 모바일 위계를 유지하려고 본문을
          max-w-2xl(홈·More 가 쓰는 폭)로 가운데 모은다. 바깥 여백만 1280 셸. */}
      <main className="flex-1 w-full mx-auto max-w-2xl px-4 md:px-6 pt-8 md:pt-16" style={{ paddingBottom: SP.xl }}>

        {/* ── 제목 ── */}
        <div style={{ marginBottom: SP.lg }}>
          <h1 className="md:hidden" style={{ ...HEADLINE_LG_MOBILE, color: C.primary }}>{tNav("myTrips")}</h1>
          <h1 className="hidden md:block" style={{ ...HEADLINE_LG, color: C.primary }}>{tNav("myTrips")}</h1>
        </div>

        {/* ── 로딩 ── */}
        {loading && (
          <p role="status" style={{ ...BODY_MD, color: C.onSurfaceVariant }}>{t("loading")}</p>
        )}

        {/* ── 에러 ── */}
        {!loading && fetchError && (
          <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
            <p style={{ ...HEADLINE_MD, color: C.onSurface }}>{t("errorTitle")}</p>
            <p style={{ ...BODY_MD, color: C.onSurfaceVariant }}>{t("errorBody")}</p>
            <button
              type="button" onClick={() => window.location.reload()}
              className="gkm-focus self-start cursor-pointer"
              style={{ ...LABEL_LG, color: C.secondary, padding: `${SP.sm}px 0` }}
            >
              {t("errorRetry")}
            </button>
          </div>
        )}

        {/* ── TRAVELING NOW ── */}
        {!loading && hero && (
          <section style={{ marginBottom: SP.xl }}>
            <SectionLabel>{t("sectionTravelingNow")}</SectionLabel>
            <TravelingNowHero
              href={`/itinerary?id=${hero.id}`}
              eyebrow={[datesOf(hero), cityLabel(hero.city)].filter(Boolean).join(" · ")}
              title={titleOf(hero)}
              chip={heroChip ? t("todayAt", { place: heroChip }) : null}
              visual={cityVisual(hero.city)}
              cityLabel={cityLabel(hero.city)}
              onMore={() => setConfirmDel(prev => prev === hero.id ? null : hero.id)}
              moreLabel={t("moreActions")}
              confirm={confirmFor(hero)}
            />
            {/* 같은 기간에 겹치는 진행 중 여행이 더 있으면 같은 줄 문법으로 이어 둔다 */}
            {traveling.length > 1 && (
              <div className="grid grid-cols-1" style={{ gap: SP.sm, marginTop: SP.sm }}>
                {traveling.slice(1).map(trip => rowOf(trip, `/itinerary?id=${trip.id}`))}
              </div>
            )}
          </section>
        )}

        {/* ── UPCOMING + New trip ── */}
        {!loading && !fetchError && (
          <section>
            {upcoming.length > 0 && <SectionLabel>{t("sectionUpcoming")}</SectionLabel>}
            {showEmpty && (
              <div style={{ marginBottom: SP.md }}>
                <p style={{ ...HEADLINE_MD, color: C.onSurface, marginBottom: SP.xs }}>{t("emptyTitle")}</p>
                <p style={{ ...BODY_MD, color: C.onSurfaceVariant }}>{t("emptyBody1")} {t("emptyBody2")}</p>
              </div>
            )}
            <div className="grid grid-cols-1" style={{ gap: SP.sm }}>
              {upcoming.map(trip => rowOf(trip, `/itinerary?id=${trip.id}`))}
              {/* 여행을 만들러 가는 길 — Home 최상단이 아니라 플래너로 (Picks·Place Detail·
                  Explore·Trending 이 모두 /#planner 로 들어간다) */}
              <DashedAction href="/#planner">{t("newTrip")}</DashedAction>
            </div>

            {/* ── 지난 여행 → Story ── */}
            {past.length > 0 && (
              <div style={{ marginTop: SP.lg }}>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setPastOpen(o => !o)}
                    aria-expanded={pastOpen}
                    aria-controls="past-trips"
                    className="gkm-focus inline-flex items-center cursor-pointer transition-colors"
                    style={{ ...BODY_MD, color: C.tertiaryContainer, gap: SP.xs, borderRadius: RADIUS_XL }}
                  >
                    {t("pastTripsStory")}
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                         style={{ transform: pastOpen ? "rotate(90deg)" : undefined, transition: "transform 200ms" }}>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
                {pastOpen && (
                  <div id="past-trips" className="grid grid-cols-1" style={{ gap: SP.sm, marginTop: SP.md }}>
                    {past.map(trip => rowOf(trip, `/itinerary?id=${trip.id}&view=story`))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
