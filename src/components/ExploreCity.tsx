"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { displayPlaceName, displayPlaceText } from "@/lib/place-display-name";
import { cityLabelKey } from "@/data/cities";
import { exploreSearchTier, matchesExploreSearch, normalizeSearchQuery } from "@/lib/explore-search-core";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import EventDetailModal from "@/components/EventDetailModal";
import SpotCard from "@/components/SpotCard";
import NaverMap, { type MapSpot } from "@/components/NaverMap";
import { detectPastedUrl } from "@/lib/home-url-detect";
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

export function toEventItem(spot: CitySpot): EventItem {
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
    whyItMattersL10n: spot.whyItMattersL10n ?? null,
    tags: spot.tags ?? [],
    city: spot.city,
    district: spot.district ?? "",
    address: spot.address,
    mapUrl: spot.mapUrl,
    naverMapUrl: spot.naverMapUrl,
    // 모달의 "네이버에 붙여 넣을 한국어 이름" 줄 — 한글 이름이 있을 때만
    naverSearchKeyword: (() => { const ko = (spot.nameL10n as Record<string, unknown> | null | undefined)?.ko; return typeof ko === "string" && ko.trim() ? ko.trim() : undefined; })(),
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
  const tQ = useTranslations("quiet");
  const tP = useTranslations("picks");
  const tPl = useTranslations("place");
  const tM = useTranslations("modal");
  const tf = useTranslations("tripForm");
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
  // Map 모드 검색 패널 — 기본 compact(한 줄), 탭하면 펼침(디자인 SSOT §2 compact↔expand)
  const [searchExpanded,  setSearchExpanded]  = useState(false);
  // Bottom Sheet 상태 — 마커 선택 시 Peek 로 시작(§3)
  const [sheetState,      setSheetState]      = useState<"peek" | "half" | "full">("peek");
  // Recenter 명령(§6) — seq 증가가 곧 명령이다
  const [centerCmd,       setCenterCmd]       = useState<{ lat: number; lng: number; zoom?: number; seq: number } | null>(null);
  const recenterSeqRef = useRef(0);
  // Full map history(§5): pushState 로 넣고, UI 로 닫을 때는 back() 으로 정리한다
  const fullMapPushedRef = useRef(false);

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
        // Version 1 정적 장소 카드(type "permanent")는 이제 city_spots 가 canonical 이라 섞지 않는다 —
        // 같은 장소가 두 장(동백섬 ×3, 영화의전당 ×2 …)으로 보이던 원인 (2026-09-01 red-team).
        if ((e as { type?: unknown }).type === "permanent") continue;
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
    const q = normalizeSearchQuery(search);
    const list = spots
      .filter(s => s.city.toLowerCase() === city.name.toLowerCase())
      .filter(s => selectedCategory === "all" || s.category === selectedCategory)
      // 보이는 텍스트 전부(name·name_l10n·description·desc_l10n·why·why_l10n·tags·subcategory·district)를
      // substring 으로 찾는다 — 어느 언어로 검색해도 같은 장소. 계약은 explore-search-core.ts.
      .filter(s => matchesExploreSearch(s, q));
    if (nearMeActive && userLocation) {
      return [...list].sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
    }
    // 검색 중이면 이름이 맞은 장소를 먼저 — 설명에서 언급만 된 행이 앞을 가리지 않게 (stable sort, 기존 순서 유지)
    if (q) return [...list].sort((a, b) => exploreSearchTier(a, q) - exploreSearchTier(b, q));
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

  // Home Search 와 같은 URL 문법(디자인 SSOT §1). URL 이면 장소검색으로 취급하지
  // 않는다 — "0 results" 대신 기존 Import/공유 흐름으로 안내한다. 파서 복제 없음.
  const pastedUrl = useMemo(() => detectPastedUrl(search), [search]);

  // 마커를 바꾸면 시트는 Peek 부터 다시 시작한다(내용 교체 계약).
  useEffect(() => { if (mapPickedKey) setSheetState("peek"); }, [mapPickedKey]);

  // Full map ↔ history: 진입 시 state 를 쌓고, back/제스처는 full map 만 닫는다.
  // 사이트 이탈 금지(Interaction Sweep IMPORTANT N1).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapExpanded && !fullMapPushedRef.current) {
      window.history.pushState({ gkmFullMap: true }, "");
      fullMapPushedRef.current = true;
    }
  }, [mapExpanded]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      if (fullMapPushedRef.current) {
        fullMapPushedRef.current = false;
        setMapExpanded(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const closeFullMap = useCallback(() => {
    if (fullMapPushedRef.current && typeof window !== "undefined") {
      window.history.back(); // popstate 가 mapExpanded 를 내린다 — 스택이 깨끗하게 남는다
    } else {
      setMapExpanded(false);
    }
  }, []);

  // Recenter(§6): 위치가 있으면 그리로, 없으면 Near Me 흐름으로 권한부터.
  const handleRecenter = useCallback(() => {
    if (userLocation) {
      recenterSeqRef.current += 1;
      setCenterCmd({ lat: userLocation.lat, lng: userLocation.lng, zoom: 14, seq: recenterSeqRef.current });
    } else {
      handleNearMe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  // 지도 빈 곳 탭: Half/Full → Peek, Peek → 닫기(§3 dismiss 계약).
  const handleMapBackground = useCallback(() => {
    if (!mapPickedKey) return;
    if (sheetState === "peek") setMapPickedKey(null);
    else setSheetState("peek");
  }, [mapPickedKey, sheetState]);

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
      {pastedUrl && (
        <div className="mt-2 px-4 py-3 rounded-xl flex items-center justify-between gap-3"
             style={{ backgroundColor: "var(--gkm-action-tint)" }}>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: "var(--gkm-action-primary)" }}>
              {pastedUrl.kind === "external" ? tQ("urlAnalyzeCta") : tQ("urlOpenShared")}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {pastedUrl.kind === "external" ? new URL(pastedUrl.url).hostname : pastedUrl.path}
            </p>
          </div>
          <Link
            href={pastedUrl.kind === "external" ? `/import?url=${encodeURIComponent(pastedUrl.url)}` : pastedUrl.path}
            className="gkm-focus shrink-0 min-h-10 px-3 rounded-xl text-xs font-bold text-white inline-flex items-center"
            style={{ backgroundColor: "var(--gkm-action-primary)" }}
          >→</Link>
        </div>
      )}
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
      {search && !pastedUrl && (
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
  ) : filteredSpots.length === 0 && pastedUrl ? (
    <div className="py-10" />
  ) : filteredSpots.length === 0 ? (
    <div className="text-center py-16">
      {spots.length === 0 ? (
        <>
          <p className="mb-3 flex justify-center text-gray-300"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg></p>
          <p className="text-gray-900 font-black text-lg mb-2">{tE("comingSoon.title")}</p>
          <p className="text-sm text-gray-400 mb-4">{tE("comingSoon.description", { city: tf(cityLabelKey(city)) })}</p>
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
              centerCommand={centerCmd}
              onBackgroundClick={viewMode === "map" ? handleMapBackground : undefined}
              // Map 모드에선 하단 카드가 장소 정보를 맡는다. Naver 기본 말풍선까지
              // 뜨면 같은 내용이 두 곳에 겹쳐 지도를 더 가린다. List·데스크톱 split 은
              // 기존 상세 모달 흐름이라 말풍선을 그대로 둔다.
              hideInfoWindow={viewMode === "map"}
              // 부산 94곳은 초기 줌(13)에서 뷰포트 안 평균 13.5곳·마커 겹침 43쌍이라
              // 점만 뿌리면 어디에 무엇이 있는지 읽히지 않는다. 줌에 따라 숫자
              // 클러스터 ↔ 개별 마커 + 이름 pill 로 갈라 그린다.
              clusterZoomLabels
            />
            {/* ── Floating controls(디자인 SSOT §4): [Recenter][Full map] 스택.
                Peek 이면 시트 위로 올라가고, Half/Full 이면 숨는다 — 서로 가리지 않는다. */}
            {(sheetState === "peek" || !mapPickedSpot || viewMode !== "map") && (
              <div className={"absolute right-3 z-50 flex flex-col gap-2.5 lg:bottom-auto lg:top-3 " +
                ((viewMode === "map" && mapPickedSpot && !mapExpanded)
                  ? "bottom-[calc(11.5rem+env(safe-area-inset-bottom))]"
                  : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]")}>
                <button
                  onClick={handleRecenter}
                  aria-label={tE("nearMe")}
                  className="gkm-focus w-11 h-11 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
                  style={nearMeActive
                    ? { backgroundColor: "var(--gkm-action-primary)", color: "#fff" }
                    : { backgroundColor: "#fff", color: "var(--gkm-ink, #191C21)" }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden
                       stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
                    <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22" />
                  </svg>
                </button>
                <button
                  onClick={() => (mapExpanded ? closeFullMap() : setMapExpanded(true))}
                  className="gkm-focus h-11 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-bold text-white shadow-lg active:scale-95 transition-transform"
                  style={{ backgroundColor: mapExpanded ? "var(--gkm-status-error)" : "var(--gkm-ink)" }}
                  title={mapExpanded ? tE("exitFullScreen") : tE("fullScreen")}
                  aria-label={mapExpanded ? tE("exitFullScreen") : tE("fullScreen")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
                       stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    {mapExpanded ? <><path d="M6 6l12 12M18 6L6 18" /></> : <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>}
                  </svg>
                  {mapExpanded ? tE("exitFullScreen") : tE("fullScreen")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Cards column: below on mobile, left scrollable on desktop ── */}
        {!mapExpanded && (
          <div className={viewMode === "map"
            ? "lg:static lg:z-auto lg:flex-1 lg:overflow-y-auto lg:h-full lg:order-1 lg:px-6 lg:py-6"
            : "flex-1 px-4 py-5 lg:flex-1 lg:overflow-y-auto lg:h-full lg:order-1 lg:px-6 lg:py-6"
          }>
            <div className={viewMode === "map" ? "hidden lg:block" : ""}>{pageHeader}</div>
            {/* 데스크톱 split 은 기존 전체 컨트롤 유지 */}
            <div className={viewMode === "map" ? "hidden lg:block" : ""}>{controls}</div>
            <div className={viewMode === "map" ? "hidden lg:block" : ""}>
              {cardsGrid}
              <div className="h-8" /> {/* bottom spacing */}
            </div>
          </div>
        )}

        {/* ── Map 모드 모바일 상단(디자인 SSOT §2): compact 한 줄 ↔ expanded 패널 ── */}
        {!mapExpanded && viewMode === "map" && !searchExpanded && (
          <div className="lg:hidden fixed inset-x-0 top-16 z-[34] px-3 pt-3 pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <button
                onClick={() => setSearchExpanded(true)}
                className="gkm-focus flex-1 h-[46px] bg-white rounded-full shadow-lg flex items-center gap-2.5 px-4 text-left"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-gray-400"
                     stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                <span className={"text-[13px] font-semibold truncate " + (search ? "text-gray-800" : "text-gray-400")}>
                  {search || tE("search.placeholder")}
                </span>
              </button>
              <button
                onClick={() => setSearchExpanded(true)}
                aria-label={tE("viewToggle")}
                className="gkm-focus relative w-[46px] h-[46px] bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden
                     stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                {(selectedCategory !== "all" || nearMeActive) && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: "var(--gkm-action-primary)" }} />
                )}
              </button>
            </div>
            <div className="mt-2 inline-flex p-0.5 rounded-full bg-white/95 shadow pointer-events-auto">
              {(["map", "list"] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
                  className="gkm-focus h-[30px] px-3.5 rounded-full text-[11.5px] font-bold"
                  style={viewMode === m ? { backgroundColor: "var(--qh-navy, #001654)", color: "#fff" } : { color: "var(--gkm-text-sub)" }}>
                  {m === "map" ? tE("viewMap") : tE("viewList")}
                </button>
              ))}
            </div>
          </div>
        )}
        {!mapExpanded && viewMode === "map" && searchExpanded && (
          <div className="lg:hidden fixed inset-0 top-16 z-[38]">
            <button aria-hidden className="absolute inset-0 bg-[rgba(12,26,58,0.28)] cursor-default" onClick={() => setSearchExpanded(false)} />
            <div className="absolute inset-x-0 top-0 bg-white rounded-b-2xl shadow-xl px-3 pt-3 pb-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder={tE("search.placeholder")} /></div>
                <button onClick={() => setSearchExpanded(false)}
                  className="gkm-focus shrink-0 min-h-11 px-2.5 text-sm font-bold text-gray-500">{tM("closeAria")}</button>
              </div>
              {pastedUrl && (
                <div className="mt-2 px-4 py-3 rounded-xl flex items-center justify-between gap-3"
                     style={{ backgroundColor: "var(--gkm-action-tint)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--gkm-action-primary)" }}>
                      {pastedUrl.kind === "external" ? tQ("urlAnalyzeCta") : tQ("urlOpenShared")}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {pastedUrl.kind === "external" ? new URL(pastedUrl.url).hostname : pastedUrl.path}
                    </p>
                  </div>
                  <Link
                    href={pastedUrl.kind === "external" ? `/import?url=${encodeURIComponent(pastedUrl.url)}` : pastedUrl.path}
                    className="gkm-focus shrink-0 min-h-10 px-3 rounded-xl text-xs font-bold text-white inline-flex items-center"
                    style={{ backgroundColor: "var(--gkm-action-primary)" }}
                  >→</Link>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {spotCategories.map(cat => (
                  <button key={cat.value} onClick={() => setSelectedCategory(cat.value)}
                    className="gkm-focus px-4 py-2 min-h-11 rounded-full text-sm font-bold transition-all border cursor-pointer"
                    style={selectedCategory === cat.value
                      ? { backgroundColor: "var(--qh-navy, #001654)", color: "#fff", borderColor: "var(--qh-navy, #001654)" }
                      : { backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-text-sub)", borderColor: "transparent" }}
                  >{cat.label}</button>
                ))}
                <button onClick={handleNearMe} disabled={locationLoading}
                  className="gkm-focus px-4 py-2 min-h-11 rounded-full text-sm font-bold border cursor-pointer disabled:opacity-60"
                  style={nearMeActive
                    ? { backgroundColor: "var(--gkm-action-primary)", color: "white", borderColor: "var(--gkm-action-primary)" }
                    : { backgroundColor: "var(--gkm-surface)", color: "var(--gkm-text-sub)", borderColor: "var(--gkm-line)" }}>
                  {locationLoading ? tE("locating") : nearMeActive ? tE("nearMeActive") : tE("nearMe")}
                </button>
              </div>
              {locationError && (
                <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-semibold">{locationError}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Sheet(디자인 SSOT §3) — Peek/Half/Full. small/full map 이 같은
          state·같은 컴포넌트를 쓴다(기존 !mapExpanded 카드 제외 결함의 수정점). */}
      {viewMode === "map" && mapPickedSpot && (() => {
        const ev = toEventItem(mapPickedSpot);
        const placeId = parseCitySpotId(selectionKey(mapPickedSpot));
        const heights = { peek: "auto", half: "min(390px, 52vh)", full: "calc(100vh - 10.5rem)" } as const;
        const onHandleDrag = (startY: number) => {
          const move = (e: PointerEvent) => {
            const dy = e.clientY - startY;
            if (dy < -46) { setSheetState(st => (st === "peek" ? "half" : "full")); cleanup(); }
            else if (dy > 46) {
              setSheetState(st => {
                if (st === "full") return "half";
                if (st === "half") return "peek";
                setMapPickedKey(null); return "peek";
              });
              cleanup();
            }
          };
          const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
          const up = () => cleanup();
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        };
        return (
          <div className="lg:hidden fixed left-0 right-0 z-[55] bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
            <div
              className="bg-white rounded-t-2xl shadow-[0_-8px_28px_rgba(10,30,80,0.16)] border-t border-gray-100 overflow-hidden flex flex-col"
              style={{ height: heights[sheetState], maxHeight: "calc(100vh - 9rem)", transition: "height .22s ease" }}
            >
              <div
                className="flex justify-center pt-2 pb-1 cursor-grab touch-none select-none"
                onPointerDown={(e) => { e.preventDefault(); onHandleDrag(e.clientY); }}
                role="button"
                aria-label={tE("viewDetails")}
                onClick={() => setSheetState(st => (st === "peek" ? "half" : st === "half" ? "full" : "half"))}
              >
                <span className="w-9 h-1 rounded-full bg-gray-200" />
              </div>

              {/* Peek 행 — 항상 표시 */}
              <div className="flex gap-3 px-4 pb-3 items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapPickedSpot.image ?? "/images/placeholder-spot.svg"}
                  alt=""
                  className={(sheetState === "peek" ? "w-14 h-14" : "w-16 h-16") + " rounded-xl object-cover bg-gray-100 shrink-0"}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/placeholder-spot.svg"; }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-gray-900 text-[15px] leading-snug truncate">
                    {displayPlaceName(mapPickedSpot.name, mapPickedSpot.nameL10n, locale)}
                  </p>
                  <p className="text-[11.5px] text-gray-400 mt-0.5 truncate">
                    {mapPickedSpot.district || tf(cityLabelKey(city))}
                  </p>
                </div>
                <button
                  onClick={() => setMapPickedKey(null)}
                  aria-label={tM("closeAria")}
                  className="gkm-focus shrink-0 w-8 h-8 rounded-full text-gray-300 hover:text-gray-600 flex items-center justify-center"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
                       stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              {/* Half/Full 본문 */}
              {sheetState !== "peek" && (
                <div className="px-4 pb-4 overflow-y-auto">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveSpot(mapPickedSpot)}
                      className="gkm-focus flex-1 min-h-11 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: "var(--gkm-action-primary)" }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden
                           stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M7 4h10v16l-5-3.5L7 20z" /></svg>
                      {tP("save")}
                    </button>
                    {placeId
                      ? <Link href={`/place/${placeId}/`} className="gkm-focus flex-1 min-h-11 rounded-xl text-[13px] font-bold flex items-center justify-center"
                          style={{ backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-action-primary)" }}>{tE("viewDetails")}</Link>
                      : <button onClick={() => setSelectedEvent(ev)} className="gkm-focus flex-1 min-h-11 rounded-xl text-[13px] font-bold flex items-center justify-center"
                          style={{ backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-action-primary)" }}>{tE("viewDetails")}</button>}
                  </div>
                  {sheetState === "full" && mapPickedSpot.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={mapPickedSpot.image} alt="" className="mt-3 w-full h-44 rounded-xl object-cover bg-gray-100"
                         onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  )}
                  {(displayPlaceText(mapPickedSpot.description, mapPickedSpot.descriptionL10n, locale) ?? mapPickedSpot.description) && (
                    <p className={"mt-3 text-[12.5px] leading-relaxed text-gray-500 " + (sheetState === "half" ? "line-clamp-3" : "")}>
                      {displayPlaceText(mapPickedSpot.description, mapPickedSpot.descriptionL10n, locale) ?? mapPickedSpot.description}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {ev.naverMapUrl && (
                      <a href={ev.naverMapUrl} target="_blank" rel="noopener noreferrer"
                         className="gkm-focus min-h-10 px-3.5 rounded-xl text-xs font-bold text-gray-600 border border-gray-200 inline-flex items-center">{tPl("naverMaps")}</a>
                    )}
                    {ev.mapUrl && (
                      <a href={ev.mapUrl} target="_blank" rel="noopener noreferrer"
                         className="gkm-focus min-h-10 px-3.5 rounded-xl text-xs font-bold text-gray-600 border border-gray-200 inline-flex items-center">{tPl("googleMaps")}</a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)}
          displayName={displayPlaceName(selectedEvent.name, selectedEvent.nameL10n, locale)}
          displayDescription={displayPlaceText(selectedEvent.description, selectedEvent.descriptionL10n, locale) ?? undefined}
          displayWhyItMatters={displayPlaceText(selectedEvent.whyItMatters, selectedEvent.whyItMattersL10n, locale) ?? undefined} />
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
  const tfCity = useTranslations("tripForm"); // 제목의 도시 이름도 locale 을 따른다("Busan 탐험하기" → "부산 탐험하기")
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
            {/* 플래너는 분리된 /planner route 로 들어간다. 여기서는
                보고 있던 도시까지 함께 넘긴다 — 서울을 보다가 눌렀는데 플래너가
                Busan 으로 열리면 방금 한 선택을 다시 해야 한다.
                형식은 도시 진입 화면(CityEntry)이 쓰는 것과 같고, 해석은
                resolveCityParam 한 곳에서만 한다. 플래너가 없는 도시(전주)는
                그쪽에서 자기 진입 화면으로 돌려보낸다. */}
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <Link
              href={`/planner?city=${city.slug}`}
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
            {/* 상단 Trips 아이콘 제거(디자인 SSOT §5 헤더): 하단 BottomNav Trips 와
                기능 중복이라 global nav 를 상단에서 반복하지 않는다. */}
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
          <h1 className="text-[22px] font-black text-gray-900 leading-tight">{tE("title", { city: tfCity(cityLabelKey(city)) })}</h1>
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
