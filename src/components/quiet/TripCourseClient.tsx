"use client";

// Official Recommended Trip 상세 — Story 와 같은 "여행 표현 DNA" 를 쓰는 코스 화면.
// (RECOMMENDED-TRIP-STORY-EXPRESSION-NORMALIZATION-V1)
//
// 같은 언어: 사진이 주인공(대표 이미지 = 코스가 실제로 연결하는 첫 장소의 카탈로그
// 대표 사진), stop 흐름은 세로 타임라인(이동감), 각 stop 은 장소 이미지·이름으로
// Place Detail 로 이어진다. 다른 점은 출처뿐 — Official course 표기(provenance)만
// 조용히 구분하고 Traveler Story 를 흉내내는 배지·꾸밈은 만들지 않는다.
//
// 데이터 안전: 기존 normalized 코스 그대로 — stop 순서·구성 무변경, 재수집 0.
// spotId 가 없는 stop 은 이름만 보여 준다(임의 매칭·가짜 링크 금지).

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { cityVisual } from "@/lib/city-visual";
import { getRecommendedTrips, tripDisplayTitle, type RecommendedTrip } from "@/data/regional/regional-recommendations";
import { adoptCourseDays, type AdoptSpotFacts } from "@/lib/trip-plan/course-adopt-core";
import { getDeviceId } from "@/lib/deviceId";
import { loadCitySpots, quietCity } from "./quiet-data";

/** 코스 대표 이미지 — 연결된 stop 중 카탈로그 사진이 있는 첫 장소. 지어내지 않는다. */
export function tripCoverSpot(trip: RecommendedTrip, byId: Map<number, CitySpot>): CitySpot | null {
  for (const s of trip.stops) {
    if (s.spotId === null) continue;
    const spot = byId.get(s.spotId);
    if (spot?.image) return spot;
  }
  return null;
}

export default function TripCourseClient({ slug, tripId }: { slug: string; tripId: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const router = useRouter();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);
  // 코스 채택(Owner 2026-09-12) — 날짜만 고르면 코스 순서 그대로 My Trip 이 된다.
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [adoptStart, setAdoptStart] = useState("");
  const [adoptEnd, setAdoptEnd] = useState("");
  const [adoptBusy, setAdoptBusy] = useState(false);
  const [adoptError, setAdoptError] = useState(false);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const trip = getRecommendedTrips(slug).find(tr => tr.id === tripId);
  if (!trip) {
    return (
      <div className="qh min-h-screen" style={{ backgroundColor: "var(--qh-paper)" }}>
        <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
          <Link href={`/city/${slug}/trips`} className="inline-flex items-center text-[13px] text-[var(--qh-faint)] py-2 min-h-11 gkm-focus">← {t("tripsIn", { city: cityLabel })}</Link>
          <p className="mt-4 text-[13px] text-[var(--qh-faint2)]">{t("tripsSoon", { city: cityLabel })}</p>
        </div>
      </div>
    );
  }

  const byId = new Map((spots ?? []).map(s => [Number(s.id), s]));
  const cover = tripCoverSpot(trip, byId);
  const v = cityVisual(slug);
  const coverSrc = cover?.image ?? v?.src ?? null;
  const metaLine = [
    trip.days && Number.isInteger(trip.days) && trip.days >= 1 ? `${trip.days}d` : (locale === "ko" ? trip.durationLabel : null),
    trip.stops.length > 0 ? `${trip.stops.length} stops` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      {/* ── Cover — 사진이 주인공, hub 와 같은 scrim 문법 ── */}
      <div className="relative h-[230px] md:h-[320px] overflow-hidden" style={{ backgroundColor: "#33566b" }}>
        {coverSrc && (
          coverSrc.startsWith("http")
            ? <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
            : <Image src={coverSrc} alt="" fill priority sizes="100vw" className="object-cover" style={v && !cover ? { objectPosition: v.objectPosition } : undefined} />
        )}
        <div className="absolute inset-x-0 top-0 h-[64px]" style={{ background: "linear-gradient(180deg,rgba(8,10,12,.5),transparent)" }} />
        <div className="absolute inset-x-0 bottom-0 h-[130px]" style={{ background: "linear-gradient(180deg,transparent,rgba(8,10,12,.74))" }} />
        <Link
          href={`/city/${slug}/trips`}
          className="absolute top-4 left-4 inline-flex items-center whitespace-nowrap text-white text-[14px] rounded-[4px] px-3.5 py-2.5 min-h-11 gkm-focus"
          style={{ background: "rgba(10,10,8,.38)", backdropFilter: "blur(4px)" }}
        >
          ← {cityLabel}
        </Link>
        <div className="absolute left-0 right-0 bottom-0 max-w-3xl mx-auto px-5 md:px-6 pb-4">
          <p className="text-[11px] font-medium tracking-[.14em] text-white/75 uppercase">{t("officialCourse")} · {cityLabel}</p>
          <h1 className="mt-0.5 text-white text-[22px] md:text-[30px] font-semibold leading-tight">{tripDisplayTitle(trip, locale)}</h1>
          {metaLine && <p className="mt-0.5 text-[12.5px] text-white/80">{metaLine}</p>}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        {/* 짧은 여행 설명 — 원문 theme 그대로(창작 없음) */}
        {trip.theme && (
          <p className="text-[14px] leading-relaxed" style={{ color: "rgba(33,29,23,.72)" }}>{trip.theme}</p>
        )}

        {/* ── 코스 흐름 — 세로 타임라인, Story 의 이동감 문법 ── */}
        {trip.stops.length > 0 ? (
          <ol className="mt-5">
            {trip.stops.map((stop, i) => {
              const spot = stop.spotId !== null ? byId.get(stop.spotId) : undefined;
              const name = spot
                ? displayPlaceName(spot.name, spot.nameL10n, locale)
                : (locale !== "ko" && stop.nameEn ? stop.nameEn : (stop.name ?? ""));
              const body = (
                <span className="flex items-center gap-3.5 min-w-0 flex-1">
                  <span className="relative flex-none w-[64px] h-[64px] rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
                    {spot?.image ? (
                      <img src={spot.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] leading-snug">{name}</span>
                    {spot?.district && <span className="block mt-0.5 text-[11.5px] text-[var(--qh-faint2)] truncate">{spot.district}</span>}
                  </span>
                  {spot && <span className="flex-none text-[13px] text-[var(--qh-faint)]" aria-hidden>→</span>}
                </span>
              );
              return (
                <li key={`${trip.id}-${i}`} className="relative pl-8">
                  {/* 흐름 선과 순서 점 — 지도 없이도 코스의 이어짐이 읽히게 */}
                  {i < trip.stops.length - 1 && (
                    <span aria-hidden className="absolute left-[9px] top-[34px] bottom-[-10px] w-px" style={{ backgroundColor: "var(--qh-line)" }} />
                  )}
                  <span aria-hidden className="absolute left-0 top-[24px] w-[19px] h-[19px] rounded-full text-[10px] font-semibold flex items-center justify-center"
                    style={{ backgroundColor: "var(--qh-ink)", color: "var(--qh-paper)" }}>{i + 1}</span>
                  {spot ? (
                    <Link href={`/place/${spot.id}/`} className="flex py-2.5 gkm-focus rounded-[4px] min-h-11">{body}</Link>
                  ) : (
                    <div className="flex py-2.5 min-h-11">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-5 text-[13px] leading-relaxed text-[var(--qh-faint2)]">{t("courseNoStops")}</p>
        )}

        {/* ── Primary CTA — 이 코스 그대로 내 일정으로 (Owner 2026-09-12, 업계형 코스=시드) ── */}
        <div className="mt-7 rounded-[4px] overflow-hidden" style={{ backgroundColor: "var(--qh-navy)" }}>
          <button
            type="button"
            onClick={() => { setAdoptOpen(v => !v); setAdoptError(false); }}
            aria-expanded={adoptOpen}
            className="w-full flex items-center justify-between px-4 py-3.5 gkm-focus text-left"
          >
            <span>
              <span className="block text-[15px] font-semibold" style={{ color: "var(--qh-paper)" }}>{t("adoptCourse")}</span>
              <span className="block text-[12px]" style={{ color: "rgba(247,243,236,.6)" }}>{t("adoptCourseSub", { count: trip.stops.length })}</span>
            </span>
            <span className="text-[17px]" style={{ color: "var(--qh-paper)" }} aria-hidden>{adoptOpen ? "▲" : "→"}</span>
          </button>
          {adoptOpen && (
            <div className="px-4 pb-4 flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: "rgba(247,243,236,.72)" }}>
                  {t("adoptStart")}
                  <input type="date" value={adoptStart} onChange={e => setAdoptStart(e.target.value)}
                    className="gkm-focus rounded-[4px] px-2.5 py-2 text-[13px] bg-white text-[#16233B]" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: "rgba(247,243,236,.72)" }}>
                  {t("adoptEnd")}
                  <input type="date" value={adoptEnd} min={adoptStart || undefined} onChange={e => setAdoptEnd(e.target.value)}
                    className="gkm-focus rounded-[4px] px-2.5 py-2 text-[13px] bg-white text-[#16233B]" />
                </label>
              </div>
              <button
                type="button"
                disabled={adoptBusy || !adoptStart || !adoptEnd || adoptEnd < adoptStart}
                onClick={async () => {
                  // 코스 stop 순서 그대로 Day 배분 — 스케줄러 미경유, 시각 발명 0.
                  const facts = new Map<number, AdoptSpotFacts>((spots ?? []).map(s => [Number(s.id), {
                    id: s.id, name: s.name, category: s.category, district: s.district ?? null,
                    lat: s.lat ?? null, lng: s.lng ?? null, image: s.image ?? null, mapUrl: s.mapUrl ?? null,
                  }]));
                  const days = adoptCourseDays(trip.stops, facts, adoptStart, adoptEnd);
                  if (!days) { setAdoptError(true); return; }
                  setAdoptBusy(true); setAdoptError(false);
                  const id = crypto.randomUUID();
                  try {
                    const res = await fetch("/api/itinerary", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
                      body: JSON.stringify({
                        id, city: cityLabel, start_date: adoptStart, end_date: adoptEnd,
                        travelers: "1", travel_style: "",
                        trip_title: tripDisplayTitle(trip, locale),
                        days,
                      }),
                    });
                    if (!res.ok) throw new Error(String(res.status));
                    router.push(`/itinerary?id=${id}`);
                  } catch {
                    setAdoptBusy(false); setAdoptError(true);
                  }
                }}
                className="gkm-focus min-h-11 rounded-[4px] text-[14px] font-bold disabled:opacity-40"
                style={{ backgroundColor: "var(--qh-paper)", color: "#16233B" }}
              >
                {adoptBusy ? "…" : t("adoptGo")}
              </button>
              {adoptError && (
                <p role="status" className="text-[12px]" style={{ color: "rgba(247,243,236,.8)" }}>{t("adoptError")}</p>
              )}
            </div>
          )}
        </div>
        {/* ── Secondary — 코스 없이 이 도시에서 빈 일정 시작(This Trip 승계 경로) ── */}
        <Link
          href={`/planner?city=${slug}`}
          className="mt-3 flex items-center justify-between rounded-[4px] px-4 py-3 gkm-focus border"
          style={{ borderColor: "var(--qh-line)", backgroundColor: "var(--qh-surface, #fff)" }}
        >
          <span>
            <span className="block text-[14px] font-semibold" style={{ color: "var(--qh-ink)" }}>{t("planCity", { city: cityLabel })}</span>
            <span className="block text-[12px]" style={{ color: "var(--qh-faint)" }}>{t("planCitySub")}</span>
          </span>
          <span className="text-[15px]" style={{ color: "var(--qh-faint)" }} aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
