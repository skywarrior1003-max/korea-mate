// S2 — 일정 Day 지도 (handoff §2C·§2D)
// 같은 전국 지도 위 3-레이어: base(도시 장소 라벨 핀) + trip(선택 Day 번호 마커·점선 순서선).
// Day 칩으로 날짜 전환, base 핀 탭 → 미니 프리뷰 → "Add to this day".
// per-day 지도가 아니라 하나의 지도에 레이어를 얹는 구조. 저장 형식·스케줄러 무변경.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import NaverMap, { type MapSpot, type DayPlace } from "@/components/NaverMap";
import { fetchCitySpots } from "@/lib/city-spots";
import { dedupeByCanonical } from "@/data/city-spot-aliases";
import type { CitySpot } from "@/data/cities/types";

export interface DayForMap {
  dayNumber: number;
  date: string;
  places: { name: string; time?: string; lat?: number; lng?: number; place_id?: string }[];
}

interface Props {
  days: DayForMap[];
  city: string;
  /** 선택 Day 인덱스 (0-base) — 부모(일정 페이지)와 동기화 */
  selectedDay: number;
  onSelectDay: (idx: number) => void;
  /** 소유자일 때만 전달 — base 핀 프리뷰에 Add to this day 노출 */
  onAddToDay?: (spot: CitySpot, dayIdx: number) => void;
}

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  busan:    { lat: 35.1587, lng: 129.0603 },
  seoul:    { lat: 37.5665, lng: 126.9780 },
  jeju:     { lat: 33.4996, lng: 126.5312 },
  gyeongju: { lat: 35.8562, lng: 129.2247 },
};

export default function ItineraryDayMap({ days, city, selectedDay, onSelectDay, onAddToDay }: Props) {
  const t = useTranslations("itin");
  const [citySpots, setCitySpots] = useState<CitySpot[]>([]);
  const [preview, setPreview] = useState<CitySpot | null>(null);
  const [addedFlash, setAddedFlash] = useState<string | null>(null);

  // base 레이어: city_spots (좌표 보유분만)
  useEffect(() => {
    let cancelled = false;
    fetchCitySpots(city.toLowerCase())
      .then(rows => { if (!cancelled) setCitySpots(dedupeByCanonical(rows)); })
      .catch(() => { /* base 레이어 없이도 trip 레이어는 동작 */ });
    return () => { cancelled = true; };
  }, [city]);

  const day = days[selectedDay];

  // trip 레이어: 선택 Day의 장소 (배열 순서 = 방문 순서)
  // 좌표 없는 place는 city_spots에서 place_id → 이름 순으로 보강 (서버 place_map이
  // lat/lng를 내려주지 않는 현행 응답 형식을 클라이언트에서 보완 — API 무변경).
  const dayPlaces: DayPlace[] = useMemo(() => {
    const byId = new Map(citySpots.map(s => [String(s.id), s]));
    const byName = new Map(citySpots.map(s => [s.name.toLowerCase(), s]));
    const out: DayPlace[] = [];
    for (const p of day?.places ?? []) {
      let lat = p.lat, lng = p.lng;
      if (lat == null || lng == null) {
        const spot = (p.place_id ? byId.get(p.place_id) : undefined) ?? byName.get(p.name.toLowerCase());
        if (spot?.lat != null && spot?.lng != null) { lat = spot.lat; lng = spot.lng; }
      }
      if (lat != null && lng != null) out.push({ name: p.name, lat, lng });
    }
    return out;
  }, [day, citySpots]);

  // 이미 일정에 있는 장소는 base 핀에서 제외 (중복 마커 방지)
  const baseSpots: MapSpot[] = useMemo(() => {
    const inDay = new Set(dayPlaces.map(p => p.name.toLowerCase()));
    return citySpots
      .filter((s): s is CitySpot & { lat: number; lng: number } => s.lat != null && s.lng != null)
      .filter(s => !inDay.has(s.name.toLowerCase()))
      .map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, category: s.category, address: s.address }));
  }, [citySpots, dayPlaces]);

  function handleBaseClick(m: MapSpot) {
    const spot = citySpots.find(s => s.id === m.id);
    if (spot) setPreview(spot);
  }

  function handleAdd() {
    if (!preview || !onAddToDay) return;
    onAddToDay(preview, selectedDay);
    setAddedFlash(t("added", { n: day?.dayNumber ?? selectedDay + 1 }));
    setPreview(null);
    setTimeout(() => setAddedFlash(null), 2500);
  }

  const geoCount = dayPlaces.length;
  const totalCount = day?.places.length ?? 0;

  return (
    <section aria-label={t("dayMap")} className="mb-10">
      {/* Day 칩 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="tablist" aria-label={t("dayMap")}>
        {days.map((d, i) => (
          <button
            key={d.dayNumber}
            role="tab"
            aria-selected={i === selectedDay}
            onClick={() => { onSelectDay(i); setPreview(null); }}
            className={`gkm-focus shrink-0 min-h-11 px-4 rounded-full text-sm font-bold border transition-colors ${
              i === selectedDay
                ? "bg-action text-white border-action shadow-cta"
                : "bg-surface text-sub border-line"
            }`}
          >
            Day {d.dayNumber}
            <span className="ml-1.5 text-xs opacity-70">{d.places.length}</span>
          </button>
        ))}
      </div>

      <div className="relative rounded-card overflow-hidden border border-line">
        <NaverMap
          spots={baseSpots}
          dayPlaces={dayPlaces}
          defaultCenter={CITY_CENTERS[city.toLowerCase()] ?? CITY_CENTERS.busan}
          height={340}
          className="relative w-full h-full"
          onSpotClick={handleBaseClick}
          hideInfoWindow
        />

        {/* base 핀 프리뷰 → Add to this day
            모바일: BottomNav(h-14 + safe-area)에 가려지지 않도록 viewport-fixed로 그 위에 표시.
            데스크톱(md+): 기존대로 지도 컨테이너 하단 absolute. */}
        {preview && (
          <div className="fixed md:absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-50 md:z-auto bg-surface/95 backdrop-blur-sm border-t border-line px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink truncate">{preview.name}</p>
              <p className="text-xs text-faint truncate">{[preview.district, preview.category].filter(Boolean).join(" · ")}</p>
            </div>
            {onAddToDay && (
              <button
                onClick={handleAdd}
                className="gkm-focus shrink-0 min-h-11 px-4 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta"
              >
                {t("addToThisDay", { n: day?.dayNumber ?? selectedDay + 1 })}
              </button>
            )}
            <button
              onClick={() => setPreview(null)}
              aria-label="Close"
              className="gkm-focus shrink-0 text-faint hover:text-ink px-2 py-2"
            >✕</button>
          </div>
        )}

        {/* 추가 완료 토스트 */}
        {addedFlash && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-ink text-white text-sm font-semibold px-4 py-2 rounded-control shadow-modal">
            ✓ {addedFlash}
          </div>
        )}
      </div>

      {/* 좌표 없는 장소 안내 — 사실만 표기 */}
      {totalCount > geoCount && (
        <p className="mt-2 text-xs text-faint">{t("noCoords", { n: totalCount - geoCount })}</p>
      )}
    </section>
  );
}
