"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import EventDetailModal from "@/components/EventDetailModal";
import SpotCard from "@/components/SpotCard";
import NaverMap, { type MapSpot } from "@/components/NaverMap";
import { haversineKm, isValidCoordinate } from "@/lib/geo";
import { fetchCitySpots } from "@/lib/city-spots";
import { dedupeByCanonical } from "@/data/city-spot-aliases";
import { citySpotSourceKey, localInfoSourceKey, eventSourceKey } from "@/lib/place-identity";
import { runCartIdentityMigration, toSourceCandidates } from "@/lib/cart-identity-migration";
import { addToCart, isInCart, getCart, CART_EVENT } from "@/lib/cart";
import { getItemSourceKey } from "@/lib/place-identity";
import { trackEvent } from "@/lib/analytics";
import type { EventItem } from "@/lib/cart";
import type { CityConfig, CitySpot } from "@/data/cities/types";

// ── Category tab values ──────────────────────────────────────────────────────

const SPOT_CATEGORY_VALUES = ["all", "attraction", "restaurant", "nature"] as const;

// ── CitySpot → EventItem adapter ────────────────────────────────────────────

function toEventItem(spot: CitySpot): EventItem {
  return {
    // id 는 저장 일정·공유 호환용이라 형식을 바꾸지 않는다. 판정은 sourceKey 로 한다.
    id: `local-${spot.id}`,
    sourceKey: spot.sourceKey ?? citySpotSourceKey(spot.id),
    type: spot.category,
    isAnchor: false,
    journeyCluster: `${spot.city.toLowerCase()}-explore`,
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: spot.relatedSurvivalGuides ?? [],
    transitFromAnchor: null,
    name: spot.name,
    shortName: spot.name,
    tags: spot.tags ?? [],
    city: spot.city,
    district: spot.district ?? "",
    address: spot.address,
    mapUrl: spot.mapUrl,
    naverMapUrl: spot.naverMapUrl,
    description: spot.description,
    whyItMatters: spot.whyItMatters ?? (spot.description ? spot.description.split(".")[0] + "." : ""),
    recommendedDurationMinutes: spot.durationMinutes ?? 60,
    bestTimeSlot: spot.bestTimeSlot ?? "anytime",
    openingHours: spot.openingHours ?? null,
    image: spot.image ?? null,
    startDate: null,
    endDate: null,
    isTrending: false,
    soloFriendly: spot.soloFriendly,
    foreignCardAccepted: spot.foreignCardAccepted,
    cashOnly: spot.cashOnly ?? false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 75,
    notice: null,
    lat: spot.lat,
    lng: spot.lng,
    // Trip-Flow Commerce (§14-1-A) — Explore 에서 만든 객체는 Modal·Cart·Saved·
    // 일정 입력으로 흘러간다. commerce 키를 아예 만들지 않는다. null 로 채우면
    // 키 이름이 JSON·localStorage 에 그대로 남는다.
  };
}

// ── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-lg">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-11 py-3.5 rounded-2xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors text-xs font-bold"
        >✕</button>
      )}
    </div>
  );
}

// ── Inner content (useSearchParams needs Suspense) ───────────────────────────

function ExploreCityContent({ city }: { city: CityConfig }) {
  const tE = useTranslations("explore");
  const tN = useTranslations("nav");

  const spotCategories = SPOT_CATEGORY_VALUES.map(v => ({
    value: v,
    label: tE(`categories.${v}` as "categories.all" | "categories.attraction" | "categories.restaurant" | "categories.nature"),
  }));

  const searchParams = useSearchParams();

  // Supabase가 primary source, staticSpots는 fetch 전 fallback
  const [spots,            setSpots]           = useState<CitySpot[]>(city.staticSpots);
  const [spotsLoading,     setSpotsLoading]    = useState(true);
  const [search,           setSearch]          = useState(searchParams.get("q") ?? "");
  const [selectedCategory, setSelectedCategory]= useState(searchParams.get("category") ?? "all");
  const [selectedEvent,    setSelectedEvent]   = useState<EventItem | null>(null);
  // Cart 는 여기서 한 번만 구독한다. 카드에는 boolean 만 내려보내 158개가
  // 담기 한 번에 전부 리렌더되지 않게 한다.
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(new Set());
  const tPicks = useTranslations("picks");
  const [liveMessage, setLiveMessage] = useState("");

  const [nearMeActive,    setNearMeActive]    = useState(false);
  const [userLocation,    setUserLocation]    = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError,   setLocationError]   = useState<string | null>(null);
  const [mapExpanded,     setMapExpanded]     = useState(false);

  // 모바일은 List ↔ Map 을 전환해 보여준다. 데스크톱은 기존 split 이
  // 둘 다 보여주므로 이 상태를 쓰지 않는다.
  // 기본값은 "list" — Explore 의 일감 목적은 장소 발견이고, 최종 디자인
  // explore_list_view_with_toggle_search 에서도 List 가 활성 상태다.
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  // 지도에서 고른 장소 — 하단 카드용. 상세 모달(selectedEvent)과는 별개다.
  const [mapPickedKey, setMapPickedKey] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setPickedKeys(new Set(getCart().map(getItemSourceKey)));
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);

  // Body scroll lock while map is full-screen
  useEffect(() => {
    document.body.style.overflow = mapExpanded ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mapExpanded]);

  // ── 모든 소스를 Promise.all로 병렬 로드 (race condition 방지) ──────────────
  // 우선순위: Supabase city_spots (1위) > local-info.json (2위) > events.json (3위)
  useEffect(() => {
    type RawEventSpot = {
      id?: unknown;
      name?: unknown; spotCategory?: unknown; city?: unknown;
      district?: unknown; address?: unknown; description?: unknown;
      whyItMatters?: unknown; mapUrl?: unknown;
      recommendedDurationMinutes?: unknown; bestTimeSlot?: unknown;
      openingHours?: unknown; tags?: unknown; relatedSurvivalGuides?: unknown;
      soloFriendly?: unknown; foreignCardAccepted?: unknown;
      cashOnly?: unknown; image?: unknown; lat?: unknown; lng?: unknown;
    };

    Promise.all([
      fetchCitySpots(city.name.toLowerCase()).catch((): CitySpot[] => []),
      fetch("/data/local-info.json").then(r => r.json()).catch(() => []),
      fetch("/data/events.json").then(r => r.json()).catch(() => []),
    ]).then(([supabaseSpots, localRaw, eventsRaw]: [CitySpot[], unknown, unknown]) => {
      const deduped = dedupeByCanonical(supabaseSpots);
      // 병합 시점이 소스를 아는 유일한 지점이다. 여기서 sourceKey 를 붙이지 않으면
      // 이후 `local-24` 만 남아 어느 소스였는지 복원할 수 없다.
      const result: CitySpot[] = (deduped.length > 0 ? deduped : city.staticSpots)
        .map(s => ({ ...s, sourceKey: s.sourceKey ?? citySpotSourceKey(s.id) }));
      const seen = new Set(result.map(s => s.name.toLowerCase()));

      // local-info.json: 런타임 타입 가드로 필수 필드 검증
      const localItems: unknown[] = Array.isArray(localRaw) ? localRaw : [];
      for (const raw of localItems) {
        if (
          typeof raw !== "object" || raw === null ||
          typeof (raw as Record<string, unknown>).id !== "number" ||
          typeof (raw as Record<string, unknown>).name !== "string" ||
          typeof (raw as Record<string, unknown>).description !== "string" ||
          typeof (raw as Record<string, unknown>).address !== "string" ||
          (raw as Record<string, unknown>).city !== city.name
        ) continue;
        const s = raw as CitySpot;
        if (!seen.has(s.name.toLowerCase())) {
          result.push({ ...s, sourceKey: localInfoSourceKey(city.name, s.id) });
          seen.add(s.name.toLowerCase());
        }
      }

      // events.json: GPS+spotCategory가 있는 항목만 CitySpot으로 변환
      const eventItems: RawEventSpot[] = Array.isArray(eventsRaw) ? (eventsRaw as RawEventSpot[]) : [];
      let evtIdx = 0;
      for (const e of eventItems) {
        if (
          e.city !== city.name || e.lat == null || e.lng == null ||
          e.spotCategory == null || typeof e.name !== "string" ||
          typeof e.address !== "string" || typeof e.description !== "string" ||
          typeof e.mapUrl !== "string"
        ) continue;
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        // id 는 3000+index 라 파일 순서가 바뀌면 달라진다. sourceKey 에는 절대
        // 쓰지 않고, events.json 이 이미 갖고 있는 안정적 문자열 id 를 쓴다.
        const rawEventId = typeof e.id === "string" && e.id.trim() ? e.id.trim() : null;
        result.push({
          sourceKey: rawEventId
            ? eventSourceKey(city.name, rawEventId)
            : localInfoSourceKey(city.name, `evt-noid-${evtIdx}`),
          id: 3000 + evtIdx++,
          name: e.name,
          category: (e.spotCategory as CitySpot["category"]) ?? "attraction",
          city: city.name,
          district:      typeof e.district      === "string" ? e.district      : undefined,
          address:       e.address,
          description:   e.description,
          whyItMatters:  typeof e.whyItMatters  === "string" ? e.whyItMatters  : undefined,
          mapUrl:        e.mapUrl,
          durationMinutes: typeof e.recommendedDurationMinutes === "number" ? e.recommendedDurationMinutes : 90,
          bestTimeSlot:  typeof e.bestTimeSlot  === "string" ? e.bestTimeSlot  : "anytime",
          openingHours:  (e.openingHours as CitySpot["openingHours"]) ?? null,
          tags:          Array.isArray(e.tags) ? (e.tags as string[]) : [],
          relatedSurvivalGuides: Array.isArray(e.relatedSurvivalGuides) ? (e.relatedSurvivalGuides as string[]) : [],
          soloFriendly:       e.soloFriendly === true,
          foreignCardAccepted: e.foreignCardAccepted === true,
          cashOnly:      e.cashOnly === true,
          image:         typeof e.image === "string" ? e.image : undefined,
          lat:           e.lat as number,
          lng:           e.lng as number,
        });
        seen.add(key);
      }

      // 개발 경고 — 같은 sourceKey 를 서로 다른 행이 만들면 병합 규칙이 깨진 것이다.
      // city_spot:24 와 local_info:busan:24 는 서로 다른 키이므로 경고 대상이 아니다.
      if (process.env.NODE_ENV !== "production") {
        const seenKeys = new Map<string, number>();
        for (const s of result) {
          const k = s.sourceKey ?? citySpotSourceKey(s.id);
          seenKeys.set(k, (seenKeys.get(k) ?? 0) + 1);
        }
        for (const [k, n] of seenKeys) {
          // 장소명·좌표는 출력하지 않는다
          if (n > 1) console.warn(`[explore] duplicate sourceKey: ${k} (${n} records)`);
        }
      }

      // 기존 브라우저의 Cart·Saved 에 sourceKey 를 채운다. 병합 목록이 곧
      // 후보 목록이므로 여기가 실행 지점이다. 멱등이라 매번 호출해도 된다.
      runCartIdentityMigration(toSourceCandidates(result));

      // 좌표가 없는 장소는 공개 목록에서 뺀다.
      //
      // 좌표가 없으면 스케줄러 후보(cart_hints)에 들어가지 못해 "담았는데
      // 일정에 안 들어오는" 상태가 된다. 실측(2026-07-30 부산): local-info
      // 64건이 좌표 0건. 카드만 숨기고 모달에는 담기가 남는 중간 상태를 만들지
      // 않기 위해 목록 단계에서 제외한다.
      //
      // 데이터 보강으로 좌표가 채워지면 이 조건이 저절로 통과하므로 코드를
      // 다시 고칠 필요가 없다. DB·파일 데이터는 건드리지 않는다.
      setSpots(result.filter(s => isValidCoordinate(s.lat, s.lng)));
    }).finally(() => setSpotsLoading(false));
  }, [city.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS Near Me
  function handleNearMe() {
    if (nearMeActive) {
      setNearMeActive(false);
      setUserLocation(null);
      setLocationError(null);
      return;
    }
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError(tE("locationUnsupported"));
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMeActive(true);
        setLocationLoading(false);
        setLocationError(null);
      },
      () => {
        setLocationError(tE("locationError"));
        setLocationLoading(false);
      },
      { timeout: 10000 }
    );
  }

  const distances = useMemo(() => {
    if (!nearMeActive || !userLocation) return new Map<number, number>();
    const m = new Map<number, number>();
    for (const s of spots) {
      if (s.lat != null && s.lng != null)
        m.set(s.id, haversineKm(userLocation.lat, userLocation.lng, s.lat, s.lng));
    }
    return m;
  }, [spots, nearMeActive, userLocation]);

  const filteredSpots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = spots
      .filter(s => s.city.toLowerCase() === city.name.toLowerCase())
      .filter(s => selectedCategory === "all" || s.category === selectedCategory)
      .filter(s => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
          (s.district ?? "").toLowerCase().includes(q)
        );
      });
    if (nearMeActive && userLocation) {
      return [...list].sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
    }
    return list;
  }, [spots, selectedCategory, search, nearMeActive, userLocation, distances, city.name]);

  const mapSpots = useMemo(
    () => filteredSpots.filter((s): s is CitySpot & { lat: number; lng: number } =>
      s.lat != null && s.lng != null
    ) as unknown as MapSpot[],
    [filteredSpots]
  );

  function handleAddSpot(spot: CitySpot) {
    const event = toEventItem(spot);
    const key   = getItemSourceKey(event);
    const already = isInCart(key);
    if (!already) addToCart(event);
    setPickedKeys(new Set(getCart().map(getItemSourceKey)));
    const picked = getCart().length;
    // 영어는 1개일 때 "place" 다. 기존 spotCount / spotCountPlural 와 같은 방식으로
    // 키를 나눠 쓴다 — 이 저장소에 ICU plural 전례가 없다.
    setLiveMessage(
      picked === 1
        ? tPicks("addedLiveOne", { name: spot.name })
        : tPicks("addedLive",    { name: spot.name, count: picked }),
    );
    trackEvent("place_add_to_itinerary", {
      city:         spot.city,
      category:     spot.category,
      source_type:  (spot.sourceKey ?? "").split(":")[0],
      cta_position: "explore-card",
      duplicate:    already,
      picked_count: picked,
    });
  }

  function handleMapSpotClick(spot: MapSpot) {
    // 병합 목록에는 같은 숫자 id 를 가진 다른 소스의 장소가 있다. 숫자로 찾으면
    // 마커를 눌렀을 때 엉뚱한 장소가 열린다. 좌표까지 함께 대조한다.
    const citySpot =
      filteredSpots.find(s => s.id === spot.id && s.lat === spot.lat && s.lng === spot.lng)
      ?? filteredSpots.find(s => s.id === spot.id);
    if (!citySpot) return;
    // 모바일 Map 모드에서는 하단 카드를 열어 지도를 가리지 않게 한다.
    // 데스크톱 split 과 List 모드는 기존 상세 모달 동작을 그대로 유지한다.
    if (viewMode === "map") setMapPickedKey(citySpot.sourceKey ?? String(citySpot.id));
    else setSelectedEvent(toEventItem(citySpot));
  }

  // 선택 장소는 키를 보관하되 항상 현재 결과에서 파생시킨다. 검색·카테고리가
  // 바뀌어 결과에서 빠지면 자동으로 null 이 돼 하단 카드가 사라진다 — 별도로
  // 상태를 지우는 effect 를 두지 않는다.
  const mapPickedSpot = mapPickedKey
    ? filteredSpots.find(s => (s.sourceKey ?? String(s.id)) === mapPickedKey) ?? null
    : null;

  // ── Shared controls (search + filter tabs) ──────────────────────────────────
  const viewToggle = (
    <div
      role="group"
      aria-label={tE("viewToggle")}
      className="lg:hidden inline-flex p-1 rounded-full bg-gray-100 border border-gray-200 mb-3"
    >
      {(["map", "list"] as const).map(m => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          aria-pressed={viewMode === m}
          className={`gkm-focus min-h-11 px-5 rounded-full text-sm font-bold transition-colors ${
            viewMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          {m === "map" ? `\u{1F5FA} ${tE("viewMap")}` : `\u2630 ${tE("viewList")}`}
        </button>
      ))}
    </div>
  );

  const controls = (
    <div className="mb-4">
      {viewToggle}
      <SearchBar value={search} onChange={setSearch} placeholder={tE("search.placeholder")} />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {spotCategories.map(cat => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className="gkm-focus px-4 py-2 min-h-11 rounded-full text-sm font-bold transition-all border cursor-pointer"
            style={selectedCategory === cat.value
              ? { backgroundColor: "var(--gkm-ink)", color: "white", borderColor: "var(--gkm-ink)" }
              : { backgroundColor: "var(--gkm-surface)", color: "var(--gkm-text-sub)", borderColor: "var(--gkm-line)" }
            }
          >{cat.label}</button>
        ))}
        <button
          onClick={handleNearMe}
          disabled={locationLoading}
          className="gkm-focus ml-auto px-4 py-2 min-h-11 rounded-full text-sm font-bold transition-all border cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          style={nearMeActive
            ? { backgroundColor: "var(--gkm-action-primary)", color: "white", borderColor: "var(--gkm-action-primary)" }
            : { backgroundColor: "var(--gkm-surface)", color: "var(--gkm-text-sub)", borderColor: "var(--gkm-line)" }
          }
        >
          {locationLoading ? tE("locating") : nearMeActive ? tE("nearMeActive") : tE("nearMe")}
        </button>
      </div>
      {locationError && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-semibold">
          ⚠️ {locationError}
        </div>
      )}
      {nearMeActive && userLocation && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-semibold flex items-center gap-2">
          <span>{tE("sortedByDistanceBanner")}</span>
          <button onClick={handleNearMe} className="ml-auto text-xs underline opacity-70 hover:opacity-100">{tE("turnOff")}</button>
        </div>
      )}
      {search && (
        <p className="mt-2 text-sm text-gray-500 font-semibold">
          {filteredSpots.length === 1
            ? tE("search.results", { count: filteredSpots.length, query: search })
            : tE("search.resultsPlural", { count: filteredSpots.length, query: search })}
        </p>
      )}
    </div>
  );

  // ── Cards grid ──────────────────────────────────────────────────────────────
  const cardsGrid = spotsLoading ? (
    // 스켈레톤 로딩 UI
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
          <div className="h-44 bg-gray-200" />
          <div className="p-4 space-y-3">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  ) : filteredSpots.length === 0 ? (
    <div className="text-center py-16">
      {spots.length === 0 ? (
        <>
          <p className="text-4xl mb-3">🚧</p>
          <p className="text-gray-900 font-black text-lg mb-2">{tE("comingSoon.title")}</p>
          <p className="text-sm text-gray-400 mb-4">{tE("comingSoon.description", { city: city.name })}</p>
          <p className="text-sm text-gray-400">{tE("comingSoon.guide", { city: city.name })}</p>
        </>
      ) : (
        <>
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 font-semibold">{tE("search.noResults", { query: search })}</p>
          <button onClick={() => setSearch("")} className="mt-3 text-sm text-orange-500 font-bold underline">{tE("search.clearSearch")}</button>
        </>
      )}
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
      {filteredSpots.map(item => (
        <SpotCard
          key={item.sourceKey ?? item.id}
          spot={item}
          distKm={distances.get(item.id)}
          isAdded={pickedKeys.has(getItemSourceKey(toEventItem(item)))}
          onAdd={() => handleAddSpot(item)}
          onClick={() => setSelectedEvent(toEventItem(item))}
        />
      ))}
    </div>
  );

  // ── Page header ─────────────────────────────────────────────────────────────
  const pageHeader = (
    <div className="flex items-center justify-between gap-4 mb-5">
      <p className="text-gray-500 text-sm">
        {filteredSpots.length === 1
          ? tE("spotCount", { count: filteredSpots.length })
          : tE("spotCountPlural", { count: filteredSpots.length })}
        {nearMeActive ? ` ${tE("sortedByDistance")}` : ` ${tE("clickForDetails")}`}
      </p>
      <Link href="/" className="shrink-0 text-sm font-bold text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:border-gray-400 transition-colors">
        {tN("home")}
      </Link>
    </div>
  );

  return (
    <>
      {/*
       * Single NaverMap + responsive layout:
       * Mobile  (< lg): flex-col — map top (h-72), cards below (scrolls naturally)
       * Desktop (≥ lg): flex-row — cards left (overflow-y-auto), map right (h-full sticky)
       */}
      <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden">

        {/* ── Map column ──
            모바일: viewMode==="map" 일 때만, 남은 영역 전체를 차지한다.
            데스크톱(lg+): 기존 split 그대로 오른쪽 460px 상시 표시.
            Full Screen: fixed overlay so Naver SDK gets guaranteed 100vw×100vh */}
        <div className={mapExpanded
          ? "fixed inset-0 z-40 bg-white"
          : `${viewMode === "map" ? "flex-1 min-h-[60vh]" : "hidden"} lg:block lg:h-full lg:w-[460px] lg:flex-none shrink-0 lg:order-2 lg:border-l lg:border-gray-200`
        }>
          <div className="relative w-full h-full">
            <NaverMap
              spots={mapSpots}
              userLocation={userLocation}
              nearMeActive={nearMeActive}
              defaultCenter={city.defaultCenter}
              height="100%"
              className="relative w-full h-full overflow-hidden"
              relayoutKey={mapExpanded ? 1 : 0}
              onSpotClick={handleMapSpotClick}
            />
            <button
              onClick={() => setMapExpanded(e => !e)}
              className="absolute top-3 right-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-lg transition-all active:scale-95"
              style={{ backgroundColor: mapExpanded ? "#ef4444" : "#1a1f36", opacity: 0.9 }}
              title={mapExpanded ? "Exit full screen" : "Full screen map"}
            >
              {mapExpanded ? "✕ Exit" : "⛶ Full Screen"}
            </button>
          </div>
        </div>

        {/* ── Cards column: below on mobile, left scrollable on desktop ── */}
        {!mapExpanded && (
          <div className={`${viewMode === "map" ? "shrink-0" : "flex-1"} lg:flex-1 lg:overflow-y-auto lg:h-full lg:order-1 px-4 lg:px-6 py-5 lg:py-6`}>
            {pageHeader}
            {controls}
            {/* Map 모드에서는 검색·필터만 남기고 카드 목록은 지도가 대신한다.
                데스크톱은 split 이므로 항상 함께 보인다. */}
            <div className={viewMode === "map" ? "hidden lg:block" : ""}>
              {cardsGrid}
              <div className="h-8" /> {/* bottom spacing */}
            </div>
          </div>
        )}
      </div>

      {/* 지도 선택 장소 하단 카드 — BottomNav(3.5rem+safe-area) 위에 둔다.
          마커를 바꿔 누르면 이 카드 내용만 갱신된다. */}
      {viewMode === "map" && !mapExpanded && mapPickedSpot && (
        <div className="lg:hidden fixed left-3 right-3 z-[45] bottom-[calc(4.25rem+env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex">
            <div className="w-24 shrink-0 bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mapPickedSpot.image ?? "/images/placeholder-spot.svg"}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/placeholder-spot.svg"; }}
              />
            </div>
            <div className="flex-1 min-w-0 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-black text-gray-900 text-sm leading-snug truncate">{mapPickedSpot.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                    📍 {mapPickedSpot.district || mapPickedSpot.city}
                  </p>
                </div>
                <button
                  onClick={() => setMapPickedKey(null)}
                  aria-label={tE("turnOff")}
                  className="gkm-focus shrink-0 w-7 h-7 rounded-full text-gray-300 hover:text-gray-600 flex items-center justify-center text-sm"
                >✕</button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {(() => {
                  const added = pickedKeys.has(getItemSourceKey(toEventItem(mapPickedSpot)));
                  return (
                    <button
                      onClick={() => handleAddSpot(mapPickedSpot)}
                      disabled={added}
                      className={`gkm-focus flex-1 min-h-10 rounded-xl text-xs font-black transition-colors ${
                        added ? "bg-emerald-50 text-emerald-600 cursor-default" : "text-white"
                      }`}
                      style={added ? undefined : { backgroundColor: "#FF4A2D" }}
                    >
                      {added ? `\u2713 ${tE("addedToPicks")}` : `+ ${tE("addToPicks")}`}
                    </button>
                  );
                })()}
                <button
                  onClick={() => setSelectedEvent(toEventItem(mapPickedSpot))}
                  className="gkm-focus shrink-0 min-h-10 px-3 rounded-xl text-xs font-bold text-gray-600 border border-gray-200"
                >
                  {tE("viewDetails")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {/* 담기 결과를 스크린리더에 알린다. 버튼 라벨만 바뀌면 시각적으로만
          전달되어 화면을 못 보는 사용자는 성공 여부를 알 수 없다. */}
      <p aria-live="polite" className="sr-only">{liveMessage}</p>
    </>
  );
}

// ── Public export ────────────────────────────────────────────────────────────

export default function ExploreCity({ city }: { city: CityConfig }) {
  const tE = useTranslations("explore");
  const tN = useTranslations("nav");
  const tF = useTranslations("footer");

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-gray-50 text-gray-900 font-sans antialiased">

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30 shrink-0">
        <div className="max-w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-normal text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            go<span className="font-extrabold">korea</span>mate
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("blog")}</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("foodGuide")}</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("survivalGuide")}</Link>
            <Link href="/my-trips"       className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">{tN("myTrips")}</Link>
            <Link href="/" className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: "#FF4A2D" }}>
              {tN("planMyTrip")}
            </Link>
          </nav>
          <div className="sm:hidden flex items-center gap-2">
            <Link href="/my-trips" className="px-3 py-2 rounded-lg text-sm font-bold text-orange-600 border border-orange-200 bg-orange-50">🧳</Link>
            <Link href="/" className="px-3 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#FF4A2D" }}>{tN("plan")}</Link>
          </div>
        </div>
      </header>

      {/* Main content: flex-1 so map fills remaining viewport on desktop */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* SEO: h1 + city description — server-rendered outside Suspense BAILOUT */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-4 lg:px-6 py-3">
          <h1 className="text-lg font-black text-gray-900">{tE("title", { city: city.name })}</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl leading-relaxed">{city.seoDescription}</p>
        </div>
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: "#FF4A2D" }} />
          </div>
        }>
          <ExploreCityContent city={city} />
        </Suspense>
      </main>

      {/* Footer: mobile only (desktop right side is the full-height map) */}
      <footer className="lg:hidden py-6 px-4 border-t border-gray-200 bg-white text-center text-sm text-gray-500 shrink-0">
        <p>{tF("copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
