"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { displayPlaceName, displayPlaceText } from "@/lib/place-display-name";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import EventDetailModal from "@/components/EventDetailModal";
import SpotCard from "@/components/SpotCard";
import NaverMap, { type MapSpot } from "@/components/NaverMap";
import { haversineKm, isValidCoordinate } from "@/lib/geo";
import { fetchCitySpots } from "@/lib/city-spots";
import { dedupeByCanonical } from "@/data/city-spot-aliases";
import { citySpotSourceKey, localInfoSourceKey, eventSourceKey } from "@/lib/place-identity";
import { runCartIdentityMigration, toSourceCandidates, buildLegacyFingerprint } from "@/lib/cart-identity-migration";
import {
  getFavoriteSourceKeys, FAVORITES_EVENT,
} from "@/lib/favorites";
import { togglePlaceSaved } from "@/lib/place-actions/place-actions-core";
import { getItemSourceKey, parseCitySpotId } from "@/lib/place-identity";
import { selectionKey, resolveClickedSpot, resolveSelection, clickTarget, nextPickedKey } from "@/lib/explore/map-selection-core";
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
    nameL10n: spot.nameL10n ?? null,
    descriptionL10n: spot.descriptionL10n ?? null,
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
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg></span>
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
          className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
        ><svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      )}
    </div>
  );
}

// ── Inner content (useSearchParams needs Suspense) ───────────────────────────

function ExploreCityContent({ city }: { city: CityConfig }) {
  const locale = useLocale();
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
  // 검색어·카테고리를 주소(?q=&category=)에 그대로 적어 둔다 — 카드 → /place 로 갔다가 뒤로 오면
  // 위의 useState 초기값이 주소에서 다시 살아난다(실측 2026-09-01: 뒤로가기 후 검색어가 비어 있었다).
  // replaceState 라 history 항목이 늘지 않고, 화면 전환도 없다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const q = search.trim();
    if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
    if (selectedCategory && selectedCategory !== "all") url.searchParams.set("category", selectedCategory);
    else url.searchParams.delete("category");
    const next = url.pathname + url.search + url.hash;
    if (next === window.location.pathname + window.location.search + window.location.hash) return;
    try { window.history.replaceState(window.history.state, "", next); } catch { /* ignore */ }
  }, [search, selectedCategory]);
  // Cart 는 여기서 한 번만 구독한다. 카드에는 boolean 만 내려보내 158개가
  // 담기 한 번에 전부 리렌더되지 않게 한다.
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
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
  // NaverMap 은 마커를 [spots] 에만 의존해 다시 만든다. 그랬서 마커 클릭
  // 콜백은 만들어질 당시의 viewMode 를 그대로 물고 있다 — 모드를 바꿔도
  // 예전 값으로 동작한다(실측: Map 모드에서 상세 모달이 열렸다).
  // 마커를 다시 만들지 않고 현재 값을 읽기 위해 ref 로 경유한다.
  const viewModeRef = useRef<"list" | "map">("list");
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  // 지도에서 고른 장소 — 하단 카드용. 상세 모달(selectedEvent)과는 별개다.
  const [mapPickedKey, setMapPickedKey] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSavedKeys(new Set(getFavoriteSourceKeys()));
    sync();
    window.addEventListener(FAVORITES_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_EVENT, sync);
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
      // staticSpots 는 Supabase 가 비었을 때만 쓰는 Version 1 정적 목록이고,
      // 그 id 는 local-info 파일 ID 다 — canonical city_spots.id 가 아니다.
      // 한 map 안에서 두 소스에 같은 키를 붙이면 fallback 이 걸릴 때마다
      // 엉뚱한 DB 장소로 귀속된다. 소스를 아는 이 자리에서 갈라 준다.
      const fromCanonical = deduped.length > 0;
      const result: CitySpot[] = (fromCanonical ? deduped : city.staticSpots)
        .map(s => ({
          ...s,
          sourceKey: s.sourceKey ?? (fromCanonical
            ? citySpotSourceKey(s.id)
            : localInfoSourceKey(city.name, s.id)),
        }));
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
      // V1 Home 이 심어 둔 잘못된 city_spot 키를 되돌린다. 판정에는 지금 막
        // 받아 온 local-info 원본이 지문으로 필요하다 — 여기 말고는 후보 목록과
        // 지문이 동시에 손에 있는 지점이 없어서 실행 위치를 옮기지 않았다.
        runCartIdentityMigration(
          toSourceCandidates(result),
          undefined,
          buildLegacyFingerprint(localRaw),
        );

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
          // 표시 이름(name_l10n)도 찾는다 — 한글 이름으로 검색하는 사용자가 EN canonical 만 있는 행을 놓치지 않게
          Object.values(s.nameL10n ?? {}).some(v => typeof v === "string" && v.toLowerCase().includes(q)) ||
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
    () => filteredSpots
      .filter((s): s is CitySpot & { lat: number; lng: number } => s.lat != null && s.lng != null)
      // 선택 강조는 sourceKey 로 맞춘다 — 같은 숫자 id 를 쓰는 다른 소스와 섞이지 않게.
      // 지도 라벨도 카드와 같은 이름(locale l10n·수집 주석 제거). identity 는 id/sourceKey 라 이름을 바꿔도 선택 판정은 그대로다.
      .map(s => ({ ...s, name: displayPlaceName(s.name, s.nameL10n, locale), sourceKey: selectionKey(s) })) as unknown as MapSpot[],
    [filteredSpots, locale]
  );

  // 발견 화면의 행동은 저장 하나다. 일정 편입은 Picks > Saved 에서 한다.
  function handleSaveSpot(spot: CitySpot) {
    const event = toEventItem(spot);
    const key   = getItemSourceKey(event);
    // id 는 반드시 event.id 다. cacheSavedSpot 이 event.id 로 캐시하고 Picks 는
    // getFavorites() 와 캐시의 id 를 맞춰 목록을 만든다 — 여기서 city_spots 의
    // 숫자 id 를 넣으면 저장은 되는데 Picks > Saved 에는 안 보인다.
    const next = togglePlaceSaved(event);
    setSavedKeys(new Set(getFavoriteSourceKeys()));
    setLiveMessage(
      next ? tPicks("savedLive", { name: spot.name })
           : tPicks("unsavedLive", { name: spot.name }),
    );
    trackEvent("place_save", {
      city:         spot.city,
      category:     spot.category,
      source_type:  (spot.sourceKey ?? "").split(":")[0],
      cta_position: "explore-card",
      saved:        next,
    });
  }

  function handleMapSpotClick(spot: MapSpot) {
    // 판정은 map-selection-core 가 한다 — SDK 를 흉내 낸 테스트가 같은 함수를 통과한다.
    const citySpot = resolveClickedSpot(filteredSpots, spot);
    if (!citySpot) return;
    // 모바일 Map 모드에서는 하단 카드를 열어 지도를 가리지 않게 한다.
    // 데스크톱 split 과 List 모드는 기존 상세 모달 동작을 그대로 유지한다.
    if (clickTarget(viewModeRef.current) === "card") setMapPickedKey(selectionKey(citySpot));
    else setSelectedEvent(toEventItem(citySpot));
  }

  // 선택 장소는 키를 보관하되 항상 현재 결과에서 파생시킨다. 검색·카테고리가
  // 바뀌어 결과에서 빠지면 자동으로 null 이 돼 하단 카드가 사라진다 — 별도로
  // 상태를 지우는 effect 를 두지 않는다.
  // 검색·카테고리가 바뀌어 선택 장소가 결과에서 빠지면 키를 실제로 끊는다.
  //
  // 예전엔 키를 남겨 두고 렌더에서만 감추었다. 그러면 검색어를 지우는 순간
  // 지나간 카드가 다시 떠올라 사용자가 고르지 않은 장소가 선택된 것처럼 보인다.
  //
  // filteredSpots 는 useMemo 라 검색·카테고리가 바난 때만 정체성이 바뀜다 —
  // List/Map 전환은 이 effect 를 건드리지 않는다. 같은 키가 유효하면
  // nextPickedKey 가 같은 값을 돌려줘 React 가 재렌더를 건너뛴다.
  useEffect(() => {
    // 규칙이 경계하는 연쇄 렌더는 여기서 생기지 않는다: 선택이 유효하면
    // nextPickedKey 가 같은 문자열 참조를 그대로 돌려주고, React 는 값이 같으면
    // 재렌더를 건너뛴다. 실제로 값이 바뀌는 경우는 선택 장소가 결과에서 빠진
    // 1회뿐이고, 그때는 상태가 바뀌는 것이 이 effect 의 목적이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapPickedKey(current => nextPickedKey(filteredSpots, current));
  }, [filteredSpots]);

  const mapPickedSpot = resolveSelection(filteredSpots, mapPickedKey);

  // ── Shared controls (search + filter tabs) ──────────────────────────────────
  const viewToggle = (
    <div
      role="group"
      aria-label={tE("viewToggle")}
      className="lg:hidden inline-flex w-full p-1 rounded-full mb-3"
      style={{ backgroundColor: "var(--gkm-action-tint)" }}
    >
      {(["list", "map"] as const).map(m => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          aria-pressed={viewMode === m}
          className="gkm-focus flex-1 inline-flex items-center justify-center gap-2 min-h-11 rounded-full text-sm font-bold transition-colors"
          style={viewMode === m
            ? { backgroundColor: "var(--gkm-action-primary)", color: "#fff" }
            : { color: "var(--gkm-text-sub)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden
               stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            {m === "map"
              ? <><path d="M9 4.5L3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7z" /><path d="M9 4.5V17M15 7v12.5" /></>
              : <><path d="M4 7h16M4 12h16M4 17h16" /></>}
          </svg>
          {m === "map" ? tE("viewMap") : tE("viewList")}
        </button>
      ))}
    </div>
  );

  const controls = (
    <div className="mb-4">
      {/* 시안 순서: 검색 → List/Map 토글 → 필터. 예전엔 토글이 검색 위에 있어
          "무엇을 찾을지" 보다 "어떻게 볼지" 를 먼저 묻고 있었다. */}
      <SearchBar value={search} onChange={setSearch} placeholder={tE("search.placeholder")} />
      <div className="mt-3">{viewToggle}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {spotCategories.map(cat => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className="gkm-focus px-4 py-2 min-h-11 rounded-full text-sm font-bold transition-all border cursor-pointer"
            style={selectedCategory === cat.value
              ? { backgroundColor: "#26fedc", color: "#00201a", borderColor: "#26fedc" }
              : { backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-text-sub)", borderColor: "transparent" }
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
          {/* 활성 상태를 색으로만 알리지 않는다 — 체크 표시를 함께 붙인다 */}
          {nearMeActive && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12.5l5 5 10-11" />
            </svg>
          )}
          {locationLoading ? tE("locating") : nearMeActive ? tE("nearMeActive") : tE("nearMe")}
        </button>
      </div>
      {locationError && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-semibold flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5L21 20H3z" /><path d="M12 10v4M12 17h.01" /></svg>
          {locationError}
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
          <p className="mb-3 flex justify-center text-gray-300"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg></p>
          <p className="text-gray-900 font-black text-lg mb-2">{tE("comingSoon.title")}</p>
          <p className="text-sm text-gray-400 mb-4">{tE("comingSoon.description", { city: city.name })}</p>
          <p className="text-sm text-gray-400">{tE("comingSoon.guide", { city: city.name })}</p>
        </>
      ) : (
        <>
          <p className="mb-3 flex justify-center text-gray-300"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg></p>
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
          spot={{ ...item, name: displayPlaceName(item.name, item.nameL10n, locale), description: displayPlaceText(item.description, item.descriptionL10n, locale) ?? item.description }}
          distKm={distances.get(item.id)}
          isSaved={savedKeys.has(getItemSourceKey(toEventItem(item)))}
          onSave={() => handleSaveSpot(item)}
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
      <Link href="/" className="gkm-focus shrink-0 inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 border border-gray-200 px-3 min-h-11 rounded-xl hover:border-gray-400 transition-colors">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden
             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
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
          : `${viewMode === "map" ? "fixed inset-x-0 top-16 bottom-0 z-20" : "hidden"} lg:static lg:inset-auto lg:z-auto lg:block lg:h-full lg:w-[460px] lg:flex-none shrink-0 lg:order-2 lg:border-l lg:border-gray-200`
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
              selectedKey={mapPickedKey}
              // Map 모드에선 하단 카드가 장소 정보를 맡는다. Naver 기본 말풍선까지
              // 뜨면 같은 내용이 두 곳에 겹쳐 지도를 더 가린다. List·데스크톱 split 은
              // 기존 상세 모달 흐름이라 말풍선을 그대로 둔다.
              hideInfoWindow={viewMode === "map"}
              // 부산 94곳은 초기 줌(13)에서 뷰포트 안 평균 13.5곳·마커 겹침 43쌍이라
              // 점만 뿌리면 어디에 무엇이 있는지 읽히지 않는다. 줌에 따라 숫자
              // 클러스터 ↔ 개별 마커 + 이름 pill 로 갈라 그린다.
              clusterZoomLabels
            />
            {/* 모바일 Map 모드에서는 이 버튼을 아래로 내린다.
                위(top-3)에 두면 누를 수 없다 — 지도 열이 z-20 으로 stacking context 를
                만들어서, 그 안의 z-50 은 형제인 컨트롤 패널(z-[34])을 이기지 못한다.
                z 를 올려 패널을 덮는 대신 겹치지 않는 자리로 옮긴다: 패널은 위에서
                최대 48vh, 이 버튼은 아래에서 BottomNav 위. 선택 카드가 떠 있을 때는
                그 카드보다 한 층 더 위로 올려 서로 가리지 않게 한다.
                전체화면일 때는 패널이 렌더되지 않으므로 원래대로 top-3.
                데스크톱(lg+)은 split 뷰라 기존 동작을 그대로 되돌린다. */}
            <button
              onClick={() => setMapExpanded(e => !e)}
              className={`absolute right-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-lg transition-all active:scale-95 lg:top-3 lg:bottom-auto ${
                mapExpanded
                  ? "top-3"
                  : mapPickedSpot
                    ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
                    : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
              }`}
              style={{ backgroundColor: mapExpanded ? "var(--gkm-status-error)" : "var(--gkm-ink)", opacity: 0.92 }}
              title={mapExpanded ? tE("exitFullScreen") : tE("fullScreen")}
              aria-label={mapExpanded ? tE("exitFullScreen") : tE("fullScreen")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {mapExpanded
                  ? <><path d="M6 6l12 12M18 6L6 18" /></>
                  : <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>}
              </svg>
              {mapExpanded ? tE("exitFullScreen") : tE("fullScreen")}
            </button>
          </div>
        </div>

        {/* ── Cards column: below on mobile, left scrollable on desktop ── */}
        {!mapExpanded && (
          /* Map 모드(모바일)에서는 이 열이 지도 위에 뜨는 컨트롤 패널이 된다.
             controls 를 여기 두는 대신 따로 한 벌 더 렌더하면 검색 input 이
             DOM 에 두 개 생겨 라벨·포커스가 중복된다. 그래서 열을 옮긴다.
             pointer-events 는 패널에만 주어 그 옆 여백으로 지도를 잡을 수 있다. */
          <div className={viewMode === "map"
            ? "fixed inset-x-0 top-16 z-[34] px-3 pt-3 pointer-events-none lg:pointer-events-auto lg:static lg:z-auto lg:flex-1 lg:overflow-y-auto lg:h-full lg:order-1 lg:px-6 lg:py-6"
            : "flex-1 px-4 py-5 lg:flex-1 lg:overflow-y-auto lg:h-full lg:order-1 lg:px-6 lg:py-6"
          }>
            <div className={viewMode === "map" ? "hidden lg:block" : ""}>{pageHeader}</div>
            <div className={viewMode === "map"
              ? "pointer-events-auto max-h-[48vh] overflow-y-auto rounded-2xl shadow-lg px-3 pt-2.5 pb-1 lg:max-h-none lg:overflow-visible lg:rounded-none lg:shadow-none lg:p-0 lg:bg-transparent"
              : ""
            } style={viewMode === "map" ? { backgroundColor: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)" } : undefined}>
              {controls}
            </div>
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
                    {mapPickedSpot.district || mapPickedSpot.city}
                  </p>
                </div>
                <button
                  onClick={() => setMapPickedKey(null)}
                  aria-label={tE("turnOff")}
                  className="gkm-focus shrink-0 w-7 h-7 rounded-full text-gray-300 hover:text-gray-600 flex items-center justify-center"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
                       stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {/* 이 카드에 저장 버튼을 새로 만들지 않는다. 지도에서 마커를 누른
                    직후는 "저기가 뭐지" 를 확인하는 순간이지 이번 여행에 넣을지
                    결정하는 순간이 아니다. 저장은 리스트 카드나 상세에서 한다. */}
                {/* 장소 전체 상세의 기준 화면은 /place/[id] 다. 단 상세 페이지는
                    city_spots 로만 정적 생성되므로(dynamicParams:false), 다른 소스의
                    장소는 route 로 보내면 404 다 — 그 때만 기존 미리보기 모달을 쓴다. */}
                {(() => {
                  const placeId = parseCitySpotId(selectionKey(mapPickedSpot));
                  const cls = "gkm-focus shrink-0 min-h-10 px-3 rounded-xl text-xs font-bold text-gray-600 border border-gray-200 inline-flex items-center";
                  return placeId
                    ? <Link href={`/place/${placeId}/`} className={cls}>{tE("viewDetails")}</Link>
                    : <button onClick={() => setSelectedEvent(toEventItem(mapPickedSpot))} className={cls}>{tE("viewDetails")}</button>;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)}
          displayName={displayPlaceName(selectedEvent.name, selectedEvent.nameL10n, locale)}
          displayDescription={displayPlaceText(selectedEvent.description, selectedEvent.descriptionL10n, locale) ?? undefined} />
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
  const tD = useTranslations("discovery");
  const tF = useTranslations("footer");

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-gray-50 text-gray-900 font-sans antialiased">

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30 shrink-0">
        <div className="max-w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-normal text-gray-900 flex items-center gap-1.5">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("blog")}</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("foodGuide")}</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("survivalGuide")}</Link>
            {/* desktop 에서 Saved/My Places/This Trip 으로 가는 유일한 상시 진입점 —
                모바일 BottomNav 의 픽 탭과 같은 곳이다 (PICKS-TO-TRIP-JOURNEY-RESTORE-V1) */}
            <Link href="/picks"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("picks")}</Link>
            <Link href="/my-trips"       className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("myTrips")}</Link>
            {/* 플래너는 Home 안의 섹션이라 /#planner 로 들어간다. 여기서는
                보고 있던 도시까지 함께 넘긴다 — 서울을 보다가 눌렀는데 플래너가
                Busan 으로 열리면 방금 한 선택을 다시 해야 한다.
                형식은 도시 진입 화면(CityEntry)이 쓰는 것과 같고, 해석은
                resolveCityParam 한 곳에서만 한다. 플래너가 없는 도시(전주)는
                그쪽에서 자기 진입 화면으로 돌려보낸다. */}
            <Link
              href={`/?city=${city.slug}#planner`}
              className="px-5 py-2.5 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--gkm-action-primary)" }}
            >
              {tN("planMyTrip")}
            </Link>
          </nav>
          {/* 모바일 헤더는 시안처럼 얇게. 예전엔 주황 Plan 버튼과 이모지 배지가
              첫 화면을 눌러 검색·토글이 아래로 밀려 있었다. */}
          <div className="sm:hidden flex items-center gap-1">
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <Link
              href="/my-trips"
              aria-label={tN("myTrips")}
              className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="7.5" width="17" height="12.5" rx="2.4" />
                <path d="M9 7.5V6a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 6v1.5" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content: flex-1 so map fills remaining viewport on desktop */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* SEO: h1 + city description — server-rendered outside Suspense BAILOUT */}
        {/* 시안은 제목 + 한 줄 보조 문구다. 예전엔 여기에 seoDescription 이
            통째로 들어가 첫 화면의 절반을 산문이 먹었다. SEO 문구는 metadata
            에서 이미 제공한다. */}
        <div className="shrink-0 bg-white px-4 lg:px-6 pt-4 pb-1">
          <h1 className="text-[22px] font-black text-gray-900 leading-tight">{tE("title", { city: city.name })}</h1>
          <p className="text-[14px] text-gray-500 mt-1">{tD("cityTagline")}</p>
        </div>
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: "var(--gkm-action-primary)" }} />
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
