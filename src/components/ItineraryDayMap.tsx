// Living Map — 일정의 회고 지도 (S2 handoff §2C·§2D → TASK-GOKOREAMATE-TRAVEL-MEMORY-PRODUCTION-V1)
//
// 같은 전국 지도 위 3-레이어: base(도시 장소 핀) + trip(방문 순서 마커·점선 순서선).
// 승인 시안(living_map_final) 계약을 이 컴포넌트가 구현한다:
//   - 마커 우선순위: 사용자 사진 → 카탈로그 대표사진 → 숫자 (living-map-core)
//   - 사진은 사각형 그대로 축소, 번호 배지 결합 (원형 crop 금지)
//   - Day / Whole Trip 전환 — Whole Trip 에서도 Day 마다 1부터 (누적 순번 금지)
//   - 마커 선택 → STOP 시트 (STOP n · 시각 · 장소 · 인용 · Directions · Add Photo)
//   - 이름 pill 상시 표시 없음 — 라벨 충돌 계약, 이름은 STOP 시트가 맡는다
// 실제 길찾기는 Naver/Google handoff(place-navigation) 그대로 — 자체 routing 없음.
// per-day 지도가 아니라 하나의 지도에 레이어를 얹는 구조. 저장 형식·스케줄러 무변경.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import NaverMap, { type MapSpot, type DayPlace } from "@/components/NaverMap";
import { fetchCitySpotsByIds } from "@/lib/city-spots";
import { uniqueNumericIds } from "@/lib/city-spots-paging";
import { dedupeByCanonical } from "@/data/city-spot-aliases";
import { localizedPlaceName } from "@/lib/planner/planning-view-core";
import { stopMarker, livingMapDayColor } from "@/lib/living-map/living-map-core";
import { stopKeyOf, stopCitySpotId } from "@/lib/trip-moments/stop-binding";
import { naverPlaceSearchUrl } from "@/lib/maps/place-navigation";
import type { StoryMomentInput } from "@/lib/share/private-story-adapter";
import type { CitySpot } from "@/data/cities/types";

export interface DayForMap {
  dayNumber: number;
  date: string;
  places: {
    name: string; time?: string; lat?: number; lng?: number; place_id?: string;
    /** Living Map 마커/결합에 쓰는 기존 저장 필드들 — 없던 일정도 그대로 열린다 */
    source?: string; sourceKey?: string; image?: string;
  }[];
}

interface Props {
  days: DayForMap[];
  city: string;
  /** 선택 Day 인덱스 (0-base) — 부모(일정 페이지)와 동기화 */
  selectedDay: number;
  onSelectDay: (idx: number) => void;
  /** 소유자일 때만 전달 — base 핀 프리뷰에 Add to this day 노출 */
  onAddToDay?: (spot: CitySpot, dayIdx: number) => void;
  /**
   * 바깥에 이미 Day 탐색이 있으면 false. 두 벌이 같이 보이면 어느 쪽이 진짜
   * 선택인지 알 수 없고, 스크린리더에는 Day 탭이 두 번 낭독된다.
   * 기본값 true — 이 컴포넌트를 단독으로 쓰던 곳은 그대로 동작한다.
   */
  showDayTabs?: boolean;
  /** 지도 높이 — 전체화면 overlay 는 화면 높이를 넘긴다. 기본 340. */
  mapHeight?: number | string;
  /** STOP 시트의 장소명 탭 — 기존 PlaceModal 상세로. (선택 Day 인덱스, places 인덱스) */
  onStopClick?: (dayIdx: number, placeIdx: number) => void;
  /** 사용자의 순간들 — 마커 사진 우선순위(사용자 사진→카탈로그→숫자)와 시트 인용에 쓴다 */
  moments?: StoryMomentInput[];
  /** STOP 시트의 Add Photo — 기존 순간 캡처 흐름을 그 stop 결합으로 연다 */
  onAddPhoto?: (dayNumber: number, stop: { placeName: string; citySpotId: number | null; stopKey: string | null }) => void;
  /**
   * "context" = Story 요약 등에 끼워 넣는 읽기 전용 Whole Trip 미니 지도 —
   * 토글·시트·base 핀 없이 전체 여정만 보여 준다. 기본 "full".
   */
  variant?: "full" | "context";
}

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  busan:    { lat: 35.1587, lng: 129.0603 },
  seoul:    { lat: 37.5665, lng: 126.9780 },
  jeju:     { lat: 33.4996, lng: 126.5312 },
  gyeongju: { lat: 35.8562, lng: 129.2247 },
};

export default function ItineraryDayMap({
  days, city, selectedDay, onSelectDay, onAddToDay, showDayTabs = true,
  mapHeight = 340, onStopClick, moments, onAddPhoto, variant = "full",
}: Props) {
  const t = useTranslations("itin");
  const tModal = useTranslations("modal");
  const tMemo = useTranslations("memo");
  const locale = useLocale();
  const [citySpots, setCitySpots] = useState<CitySpot[]>([]);
  const [preview, setPreview] = useState<CitySpot | null>(null);
  const [addedFlash, setAddedFlash] = useState<string | null>(null);
  // Day ↔ Whole Trip. context variant 는 항상 whole 이다.
  const [mode, setMode] = useState<"day" | "whole">(variant === "context" ? "whole" : "day");
  // 선택된 stop — dayNumber + 그 Day places 배열 인덱스. 시트가 이걸 그린다.
  const [selectedStop, setSelectedStop] = useState<{ dayNumber: number; placeIdx: number } | null>(null);

  // base 레이어: 일정이 참조하는 place_id 의 city_spots 만 (좌표 보유분만)
  // Gate B: reference 조회(필터 없음). R1 SCALE: 도시 전량 대신 place_id 집합만 — 도시 장소 수와 무관.
  const hydrationKey = useMemo(() => uniqueNumericIds(days.flatMap(d => d.places.map(p => p.place_id))).join(","), [days]);
  useEffect(() => {
    let cancelled = false;
    fetchCitySpotsByIds(hydrationKey ? hydrationKey.split(",") : [])
      .then(rows => { if (!cancelled) setCitySpots(dedupeByCanonical(rows)); })
      .catch(() => { /* base 레이어 없이도 trip 레이어는 동작 */ });
    return () => { cancelled = true; };
  }, [city, hydrationKey]);

  const day = days[selectedDay];

  /** Day 하나 → 사진/번호 마커 목록. 번호는 그 Day 안에서 좌표 보유 stop 끼리 1..m. */
  const buildDayPlaces = useMemo(() => {
    const byId = new Map(citySpots.map(s => [String(s.id), s]));
    const byName = new Map(citySpots.map(s => [s.name.toLowerCase(), s]));
    return (d: DayForMap, opts: { whole: boolean }): DayPlace[] => {
      const out: DayPlace[] = [];
      let order = 0;
      d.places.forEach((p, idx) => {
        let lat = p.lat, lng = p.lng;
        const spot = (p.place_id ? byId.get(p.place_id) : undefined) ?? byName.get(p.name.toLowerCase());
        if ((lat == null || lng == null) && spot?.lat != null && spot?.lng != null) { lat = spot.lat; lng = spot.lng; }
        if (lat == null || lng == null) return;
        order += 1;
        const marker = stopMarker(
          { name: p.name, place_id: p.place_id, source: p.source, sourceKey: p.sourceKey, image: p.image ?? spot?.image ?? undefined },
          d.dayNumber,
          moments ?? [],
        );
        out.push({
          name: localizedPlaceName(p.name, spot?.nameL10n, locale),
          lat, lng, idx, order,
          photoUrl: marker.photoUrl,
          color: opts.whole ? livingMapDayColor(d.dayNumber) : undefined,
          groupKey: d.dayNumber,
          selected: selectedStop?.dayNumber === d.dayNumber && selectedStop?.placeIdx === idx,
        });
      });
      return out;
    };
  }, [citySpots, moments, locale, selectedStop]);

  const dayPlaces: DayPlace[] = useMemo(() => {
    if (mode === "whole") return days.flatMap(d => buildDayPlaces(d, { whole: true }));
    return day ? buildDayPlaces(day, { whole: false }) : [];
  }, [mode, days, day, buildDayPlaces]);

  // 이미 이 Day 일정에 있는 장소는 base 핀에서 제외 (중복 마커 방지).
  // 이름만으로는 부족하다 — 일정 항목 이름("Haeundae Beach: The Busan representative")과
  // canonical 이름("Haeundae Beach")이 달라 같은 자리에 번호 마커와 라벨 핀이
  // 겹쳐 "같은 장소가 반복" 되어 보였다. place_id 로도 제외한다.
  // Whole Trip 은 회고 모드다 — base 핀을 깔면 여정이 탐색 소음에 묻혀 끈다.
  const baseSpots: MapSpot[] = useMemo(() => {
    if (mode === "whole" || variant === "context") return [];
    const inDay = new Set(dayPlaces.map(p => p.name.toLowerCase()));
    const inDayIds = new Set((day?.places ?? []).map(p => p.place_id).filter(Boolean).map(String));
    return citySpots
      .filter((s): s is CitySpot & { lat: number; lng: number } => s.lat != null && s.lng != null)
      .filter(s => !inDay.has(s.name.toLowerCase()) && !inDayIds.has(String(s.id)))
      .map(s => ({ id: s.id, name: localizedPlaceName(s.name, s.nameL10n, locale), lat: s.lat, lng: s.lng, category: s.category, address: s.address }));
  }, [mode, variant, citySpots, dayPlaces, day, locale]);

  function handleBaseClick(m: MapSpot) {
    const spot = citySpots.find(s => s.id === m.id);
    if (spot) { setPreview(spot); setSelectedStop(null); }
  }

  function handleAdd() {
    if (!preview || !onAddToDay) return;
    onAddToDay(preview, selectedDay);
    setAddedFlash(t("added", { n: day?.dayNumber ?? selectedDay + 1 }));
    setPreview(null);
    setTimeout(() => setAddedFlash(null), 2500);
  }

  function handleStopMarker(p: DayPlace) {
    if (variant === "context") return;
    if (p.idx == null || p.groupKey == null) return;
    setPreview(null);
    setSelectedStop({ dayNumber: p.groupKey, placeIdx: p.idx });
  }

  // 시트가 그릴 선택 stop 의 실제 데이터
  const sheet = useMemo(() => {
    if (!selectedStop) return null;
    const d = days.find(x => x.dayNumber === selectedStop.dayNumber);
    const p = d?.places[selectedStop.placeIdx];
    if (!d || !p) return null;
    const dp = (mode === "whole" ? buildDayPlaces(d, { whole: true }) : (d === day ? dayPlaces : buildDayPlaces(d, { whole: false })))
      .find(x => x.idx === selectedStop.placeIdx);
    const marker = stopMarker(
      { name: p.name, place_id: p.place_id, source: p.source, sourceKey: p.sourceKey, image: p.image },
      d.dayNumber, moments ?? [],
    );
    return {
      dayNumber: d.dayNumber,
      order: dp?.order ?? null,
      name: dp?.name ?? p.name,
      rawName: p.name,
      time: (p.time ?? "").trim(),
      memo: marker.memo,
      photoUrl: marker.photoUrl,
      placeIdx: selectedStop.placeIdx,
      dayIdx: days.indexOf(d),
      citySpotId: stopCitySpotId({ place_id: p.place_id, source: p.source, sourceKey: p.sourceKey }),
      stopKey: stopKeyOf({ place_id: p.place_id, source: p.source, sourceKey: p.sourceKey }),
    };
  }, [selectedStop, days, day, dayPlaces, mode, moments, buildDayPlaces]);

  const geoCount = mode === "day" ? dayPlaces.length : (day ? buildDayPlaces(day, { whole: false }).length : 0);
  const totalCount = day?.places.length ?? 0;

  const mapBody = (
    <div className="relative rounded-card overflow-hidden border border-line">
      <NaverMap
        spots={baseSpots}
        dayPlaces={dayPlaces}
        dayMarkerStyle="photo"
        defaultCenter={CITY_CENTERS[city.toLowerCase()] ?? CITY_CENTERS.busan}
        height={mapHeight}
        className="relative w-full h-full"
        onSpotClick={handleBaseClick}
        onDayPlaceClick={handleStopMarker}
        hideInfoWindow
      />

      {/* Day / Whole Trip 토글 — 시안의 상단 중앙 pill. context 는 안 그린다. */}
      {variant === "full" && days.length > 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white rounded-full shadow-sm border border-line p-1 flex" role="tablist" aria-label={t("dayMap")}>
          <button
            type="button" role="tab" aria-selected={mode === "day"}
            onClick={() => { setMode("day"); setSelectedStop(null); }}
            className={`gkm-focus px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${mode === "day" ? "bg-[#0041C9] text-white" : "text-sub"}`}
          >
            Day {day?.dayNumber ?? selectedDay + 1}
          </button>
          <button
            type="button" role="tab" aria-selected={mode === "whole"}
            onClick={() => { setMode("whole"); setSelectedStop(null); setPreview(null); }}
            className={`gkm-focus px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${mode === "whole" ? "bg-[#0041C9] text-white" : "text-sub"}`}
          >
            {t("wholeTrip")}
          </button>
        </div>
      )}

      {/* Whole Trip — Day 색 범례. 번호는 Day 마다 1부터라는 계약을 색이 받친다.
          아래쪽에 둔다 — 상단 토글과 겹쳐 쌓이면 fitBounds 로 위쪽에 모인 마커를
          가린다(2026-09-08 blind 재검). */}
      {mode === "whole" && days.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-x-3 gap-y-1 px-3 py-1.5 rounded-full bg-white/90 border border-line shadow-sm max-w-[92%]">
          {days.map(d => (
            <span key={d.dayNumber} className="flex items-center gap-1 text-[11px] font-bold text-ink">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: livingMapDayColor(d.dayNumber) }} />
              Day {d.dayNumber}
            </span>
          ))}
        </div>
      )}

      {/* base 핀 프리뷰 → Add to this day
          모바일: BottomNav(h-14 + safe-area)에 가려지지 않도록 viewport-fixed로 그 위에 표시.
          데스크톱(md+): 기존대로 지도 컨테이너 하단 absolute. */}
      {preview && !sheet && (
        <div className="fixed md:absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-50 md:z-auto bg-surface/95 backdrop-blur-sm border-t border-line px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink truncate">{localizedPlaceName(preview.name, preview.nameL10n, locale)}</p>
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
            aria-label={tModal("closeAria")}
            className="gkm-focus shrink-0 text-faint hover:text-ink px-2 py-2"
          >✕</button>
        </div>
      )}

      {/* STOP 시트 — 승인 시안의 선택 마커 카드. 이름 pill 대신 여기가 이름을 말한다. */}
      {sheet && (
        <div className="fixed md:absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-50 md:z-auto bg-white/97 backdrop-blur-sm border-t border-line px-4 pt-3 pb-3 shadow-[0_-6px_20px_rgba(0,40,132,0.08)]">
          <div className="flex items-start gap-3">
            {sheet.photoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={sheet.photoUrl} alt="" className="w-14 h-11 rounded-lg object-cover border border-line shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: livingMapDayColor(sheet.dayNumber) }} />
                <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#0041C9" }}>
                  {mode === "whole" ? `Day ${sheet.dayNumber} · ` : ""}Stop {sheet.order ?? "–"}
                </span>
                {sheet.time && <span className="text-[11px] text-faint font-semibold">· {sheet.time}</span>}
              </p>
              {/* 이름 탭 → 기존 PlaceModal 상세. 새 상세 화면을 만들지 않는다. */}
              {onStopClick ? (
                <button
                  type="button"
                  onClick={() => onStopClick(sheet.dayIdx, sheet.placeIdx)}
                  className="gkm-focus text-left text-[15px] font-bold text-ink leading-snug line-clamp-2"
                >
                  {sheet.name}
                </button>
              ) : (
                <p className="text-[15px] font-bold text-ink leading-snug line-clamp-2">{sheet.name}</p>
              )}
              {sheet.memo && (
                <p className="text-xs text-sub italic truncate mt-0.5">{`“${sheet.memo}”`}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedStop(null)}
              aria-label={tModal("closeAria")}
              className="gkm-focus shrink-0 text-faint hover:text-ink px-2 py-1"
            >✕</button>
          </div>
          <div className="flex gap-2 mt-2.5">
            <a
              href={naverPlaceSearchUrl(sheet.rawName, city)}
              target="_blank" rel="noopener noreferrer"
              className="gkm-focus flex-1 min-h-10 rounded-control bg-[#001654] text-white text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.6 20.4L3.4 14a2 2 0 010-2.8l7.8-7.8a2 2 0 012.8 0l6.4 6.4a2 2 0 010 2.8l-7.8 7.8a2 2 0 01-2.8 0z" /><path d="M8.5 13.5l3-3 4 1.5" /></svg>
              {tModal("directions")}
            </a>
            {onAddPhoto && (
              <button
                type="button"
                onClick={() => onAddPhoto(sheet.dayNumber, { placeName: sheet.rawName, citySpotId: sheet.citySpotId, stopKey: sheet.stopKey })}
                className="gkm-focus flex-1 min-h-10 rounded-control border border-line bg-white text-ink text-sm font-bold flex items-center justify-center gap-1.5"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
                {tMemo("addMemory")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 추가 완료 토스트 */}
      {addedFlash && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-ink text-white text-sm font-semibold px-4 py-2 rounded-control shadow-modal">
          ✓ {addedFlash}
        </div>
      )}
    </div>
  );

  if (variant === "context") {
    return mapBody;
  }

  return (
    <section aria-label={t("dayMap")} className="mb-10">
      {/* Day 칩 */}
      {showDayTabs && (
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="tablist" aria-label={t("dayMap")}>
        {days.map((d, i) => (
          <button
            key={d.dayNumber}
            role="tab"
            aria-selected={i === selectedDay}
            onClick={() => { onSelectDay(i); setPreview(null); setSelectedStop(null); setMode("day"); }}
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
      )}

      {mapBody}

      {/* 좌표 없는 장소 안내 — 사실만 표기 */}
      {mode === "day" && totalCount > geoCount && (
        <p className="mt-2 text-xs text-faint">{t("noCoords", { n: totalCount - geoCount })}</p>
      )}
      {/* 선은 경로가 아니다 — 방문 순서 연결일 뿐. 실제 길찾기는 외부 지도(Naver/Google)로. */}
      {dayPlaces.length >= 2 && (
        <p className="mt-1.5 text-[11px] text-faint">{t("mapOrderHint")}</p>
      )}
    </section>
  );
}
