"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import AdBanner from "@/components/AdBanner";
import { PLANNER_EVENT } from "@/lib/plannerStore";
import { upsertItinerary, fetchItinerary, updateItineraryTitle } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { getCart, removeFromCart, CART_EVENT, type CartItem } from "@/lib/cart";
import { isEmailSaved } from "@/lib/userEmail";
import EmailCaptureModal from "@/components/EmailCaptureModal";
import TripMomentCapture from "@/components/TripMomentCapture";
import TripMomentTimeline from "@/components/TripMomentTimeline";
import TripStoryExport from "@/components/TripStoryExport";
import { loadMoments, addMoment, deleteMoment } from "@/lib/trip-moments";
import type { TripMoment } from "@/lib/trip-moments";
import { fetchCitySpots, matchCitySpot } from "@/lib/city-spots";
import type { CitySpot } from "@/data/cities/types";
import { haversineKm } from "@/lib/geo";
import { CITY_DAY1_PROHIBITED } from "@/data/city-presets";

// ── 데이터 타입 ───────────────────────────────────────────────
interface Place {
  name: string;
  category: string;
  location: string;
  time: string;
  duration: string;
  tips: string;
  googleMapsUrl: string;
  slot?: string;
  cartSnapshot?: CartItem;
  affiliateUrl?:      string | null;
  affiliateProvider?: string | null;
  bookingUrl?:        string | null;
}

interface Day {
  date: string;
  dayNumber: number;
  places: Place[];
}

// ── 시간 슬롯 정의 ───────────────────────────────────────────
const TIME_SLOTS = [
  { key: "morning",   label: "Morning",   emoji: "☀️", range: "9AM–12PM" },
  { key: "lunch",     label: "Lunch",     emoji: "🍽️", range: "12–2PM"   },
  { key: "afternoon", label: "Afternoon", emoji: "⛅", range: "2–5PM"    },
  { key: "evening",   label: "Evening",   emoji: "🌙", range: "5–9PM"    },
] as const;

// ── 영문명 → 네이버 한국어 키워드 매핑 ──────────────────────
const NAVER_KEYWORD_MAP: Record<string, string> = {
  "haeundae beach":          "해운대해수욕장",
  "gamcheon culture village":"감천문화마을",
  "jagalchi fish market":    "자갈치시장",
  "jagalchi market":         "자갈치시장",
  "gwangalli beach":         "광안리해수욕장",
  "hwangnyeongsan":          "황령산전망대",
  "hwangnyeongsan night view trail": "황령산전망대",
  "jangsan mountain trail":  "장산등산로입구",
  "jangsan mountain":        "장산등산로입구",
  "igidae coastal walk":     "이기대해안산책로",
  "igidae":                  "이기대해안산책로",
  "haedong yonggungsa":      "해동용궁사",
  "oryukdo skywalk":         "오륙도스카이워크",
  "taejongdae":              "태종대",
  "busan tower":             "부산타워",
  "seomyeon":                "서면",
  "nampo-dong":              "남포동",
  "gyeongbokgung":           "경복궁",
  "namsan tower":            "남산타워",
  "n seoul tower":           "남산타워",
  "myeongdong":              "명동",
  "bukchon hanok village":   "북촌한옥마을",
  "dongdaemun":              "동대문",
  "hongdae":                 "홍대",
  "itaewon":                 "이태원",
  "insadong":                "인사동",
  "changdeokgung":           "창덕궁",
  "gwangjang market":        "광장시장",
  "noryangjin fish market":  "노량진수산시장",
};

// ── time 문자열 → 슬롯 자동 배정 ─────────────────────────────
function assignSlot(time: string): string {
  const h = parseInt(time?.split(":")?.[0] ?? "12", 10);
  if (isNaN(h) || h < 12) return "morning";
  if (h < 14) return "lunch";
  if (h < 17) return "afternoon";
  return "evening";
}

// ── Cart bestTimeSlot → 스케줄러 preferred_time_slot 정규화 ──
function toPreferredTimeSlot(s: string): "morning" | "afternoon" | "evening" | undefined {
  const lower = s.toLowerCase();
  if (lower === "morning")                       return "morning";
  if (lower === "afternoon")                     return "afternoon";
  if (lower === "evening" || lower === "night")  return "evening";
  return undefined;
}

// ── Naver Maps URL ────────────────────────────────────────────
function buildNaverUrl(placeName: string, city: string): string {
  const norm = placeName.toLowerCase().trim();
  for (const [eng, kor] of Object.entries(NAVER_KEYWORD_MAP)) {
    if (norm.includes(eng) || eng.includes(norm)) {
      return `https://map.naver.com/v5/search/${encodeURIComponent(kor)}`;
    }
  }
  const korean = (placeName.match(/[가-힯ᄀ-ᇿ]+/g) ?? []).join("").trim();
  if (korean.length >= 2) return `https://map.naver.com/v5/search/${encodeURIComponent(korean)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${placeName} ${city} Korea`)}`;
}

// ── AI 빌드 단계 정의 (Task 1: 강제 드웰 타임 + 제휴 노출) ─────
const LOAD_PHASES = [
  {
    emoji: "🍽️",
    label: "[Step 1] Matching Michelin & top restaurants in Busan...",
    cards: [
      { emoji: "⭐", name: "Michelin Guide", desc: "Busan's best restaurants sorted by your route", color: "#d97706" },
      { emoji: "🏨", name: "Booking.com",    desc: "Top hotels auto-sorted near each day's spots",  color: "#003580" },
    ],
  },
  {
    emoji: "🏨",
    label: "[Step 2] Curating best hotels & nearby accommodations...",
    cards: [
      { emoji: "🏨", name: "Booking.com",    desc: "Free cancellation options — Haeundae & Centum", color: "#003580" },
      { emoji: "🎟️", name: "Viator Tours",   desc: "Day trips: Gamcheon, Taejongdae & more",        color: "#7c3aed" },
    ],
  },
  {
    emoji: "📱",
    label: "[Step 3] Optimizing eSIM coverage & transport routes...",
    cards: [
      { emoji: "📱", name: "Korea eSIM",     desc: "Unlimited 5G data — active before you land",    color: "#f97316" },
      { emoji: "✈️", name: "Airport Transfer",desc: "Fixed-price pickup from Gimhae Airport",        color: "#16a34a" },
    ],
  },
] as const;

// ── TASK-018: Trip Plan API 클라이언트 타입 ──────────────────────────────────────
interface PlaceDisplay {
  name:            string;
  category:        string;
  district:        string;
  tips:            string;
  google_maps_url: string;
  lat?:            number;
  lng?:            number;
}
type PlaceDisplayMap = Record<string, PlaceDisplay>;

interface ApiScheduledItem {
  item_type:    string;
  place_id?:    string;
  event_id?:    string;
  start_time:   string;
  end_time:     string;
  stay_minutes: number;
}

interface ApiTripPlanResponse {
  kind:             "scheduled" | "personalized" | "fallback" | "conflict";
  plan?:            { items: ApiScheduledItem[] };
  near_me_count?:   number;
  fallback_reason?: string;
  error?:           unknown;
}

// ── TASK-021: Affiliate Display 타입 ─────────────────────────────────────────
interface AffiliateDisplay {
  provider:        string;
  category:        string;
  title:           string;
  description:     string;
  destination_url: string;
}
type AffiliateDisplayMap = Record<string, AffiliateDisplay>;

interface CartHintEntry {
  name?:               string;
  affiliate_url?:      string | null;
  affiliate_provider?: string | null;
  booking_url?:        string | null;
}

interface ApiTripPlanResult {
  data?:           ApiTripPlanResponse;
  place_map?:      PlaceDisplayMap;
  affiliate_map?:  AffiliateDisplayMap;
  cart_hint_map?:  Record<string, CartHintEntry>;
  error?:          string;
}

// ── TASK-018: 도시별 중심 좌표 (GPS 폴백 체인) ──────────────────────────────────
const CITY_CENTER_COORDS: Record<string, { lat: number; lng: number }> = {
  busan:    { lat: 35.1796, lng: 129.0756 },
  seoul:    { lat: 37.5665, lng: 126.9780 },
  gyeongju: { lat: 35.8562, lng: 129.2247 },
  jeju:     { lat: 33.4996, lng: 126.5312 },
};
const DEFAULT_COORD = { lat: 35.1796, lng: 129.0756 };

// ── TASK-018: ISO 날짜 산술 (new Date() 금지) ────────────────────────────────────
function addOneDayISO(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const y = parseInt(yStr ?? "2026", 10);
  const m = parseInt(mStr ?? "1",    10);
  const d = parseInt(dStr ?? "1",    10);
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim    = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let nd = d + 1, nm = m, ny = y;
  if (nd > (dim[m] ?? 31)) { nd = 1; nm += 1; }
  if (nm > 12)              { nm = 1; ny += 1; }
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

function buildDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cur = startDate;
  while (cur <= endDate) { dates.push(cur); cur = addOneDayISO(cur); }
  return dates;
}

// ── TASK-018: Coordinate 해결 체인 ──────────────────────────────────────────────
function resolveCoordinate(city: string, cart: CartItem[]): { lat: number; lng: number } {
  const cartCoord = cart.find(i => typeof i.lat === "number" && typeof i.lng === "number");
  if (cartCoord) return { lat: cartCoord.lat!, lng: cartCoord.lng! };
  return CITY_CENTER_COORDS[city.toLowerCase()] ?? DEFAULT_COORD;
}

// ── TASK-018: travelStyle → TripPace ────────────────────────────────────────────
function toPace(travelStyle: string): "relaxed" | "normal" | "packed" {
  const s = travelStyle.toLowerCase();
  if (s.includes("adventure"))                                               return "packed";
  if (s.includes("couple") || s.includes("family") || s.includes("senior")) return "relaxed";
  return "normal";
}

// ── TASK-018: F7 이벤트 venue 좌표 수집 (ISO 비교, new Date() 금지) ──────────────
function getEventCoords(
  cart: CartItem[],
  tripStart: string,
  tripEnd: string,
): { lat: number; lng: number }[] {
  return cart
    .filter(item => {
      if (typeof item.lat !== "number" || typeof item.lng !== "number") return false;
      if (item.endDate   && item.endDate   < tripStart) return false;
      if (item.startDate && item.startDate > tripEnd)   return false;
      return true;
    })
    .map(item => ({ lat: item.lat!, lng: item.lng! }))
    .slice(0, 5);
}

// ── TASK-020: 브라우저 GPS 취득 (SSR-safe, 8s timeout) ─────────────────────────
async function getBrowserGPS(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos  => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      _err => resolve(null),
      { timeout: 8_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}

// ── TASK-018: PlaceDisplay 합성 폴백 ────────────────────────────────────────────
function syntheticPlaceDisplay(item: ApiScheduledItem, city: string): PlaceDisplay {
  const cat    = item.item_type === "event" ? "attraction" : (item.item_type || "attraction");
  const catCap = cat.charAt(0).toUpperCase() + cat.slice(1);
  return {
    name:            `${catCap} in ${city}`,
    category:        cat,
    district:        city,
    tips:            "Explore this recommended local spot.",
    google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cat} ${city} Korea`)}`,
  };
}

// ── TASK-057-B2-2: My Pick cluster centroid for NearMe search coordinate ─────────
function getCartHintsCentroid(
  hints: { lat: number; lng: number }[]
): { lat: number; lng: number } | null {
  const valid = hints.filter(h => typeof h.lat === "number" && typeof h.lng === "number");
  if (valid.length === 0) return null;
  const lat = valid.reduce((s, h) => s + h.lat, 0) / valid.length;
  const lng = valid.reduce((s, h) => s + h.lng, 0) / valid.length;
  return { lat, lng };
}

// ── TASK-018: 신규 일정 생성 오케스트레이터 (레거시 generateWithDwell 대체) ─────────
async function generateWithNewApi(
  city: string,
  sd: string,
  ed: string,
  _trav: string,
  tstyle: string,
  arrTime?: string,
  deptTime?: string,
  arrivalCoord?: { lat: number; lng: number },
  departureCoord?: { lat: number; lng: number },
): Promise<{ days: Day[]; isFallback: boolean; conflictDayNumbers: number[]; affiliateMap: AffiliateDisplayMap; skippedCartNames: string[]; hadDeferredCartHints: boolean; usedCartHintCentroid: boolean }> {
  const MIN_MS = 2500 + Math.random() * 1000;
  const t0     = Date.now();

  const dates  = buildDateRange(sd, ed);
  const cart   = getCart();
  // TASK-053: cart item lookup map — used for display fallback when place_map misses "local-*" IDs
  const cartItemByKey = Object.fromEntries(cart.map(c => [c.id, c]));

  // Collect names of cart items without coordinates so we can show a UI warning.
  const skippedCartNames = cart
    .filter(item => !item.lat || !item.lng)
    .map(item => item.shortName || item.name);

  // P0-1 Phase 2: Cart 아이템 → 스케줄러 합성 후보 힌트 변환
  const cartHints = cart
    .filter(item => {
      if (!item.lat || !item.lng) return false;
      return true;
    })
    .map(item => ({
      place_id:            item.id,
      lat:                 item.lat!,
      lng:                 item.lng!,
      duration_min:        item.recommendedDurationMinutes,
      preferred_time_slot: toPreferredTimeSlot(item.bestTimeSlot),
      name:                item.name,
      affiliate_url:       item.commerce?.affiliateUrl ?? null,
      affiliate_provider:  item.commerce?.affiliatePartner ?? null,
      booking_url:         item.commerce?.bookingUrl ?? null,
    }));

  // TASK-057-B1: Day-aware My Picks hard filter.
  // Day 1 uses a generous radius because the user travels from the arrival point
  // (e.g. Incheon Airport, 50km from Seoul city centre) to the city on Day 1 —
  // a tight threshold would defer ALL city My Picks on arrival day.
  // General days (2+) use a tighter radius to prevent mixing distant districts
  // (e.g. Haeundae picks appearing on a Nampo-anchored day).
  // isAirportEvening + PROHIBITED_DAY1 already guard beach/distance abuse on Day 1.
  const DAY1_CART_HINT_MAX_KM         = 50;   // airport→city transit (Incheon→Seoul ~50km)
  const DEFAULT_CART_HINT_MAX_KM      = 25;   // Day 2+: prevent district mixing
  const NEAR_ME_CLUSTER_SEARCH_MAX_KM = 25;   // centroid must be within this km of dayStart to override

  // Mutable pool: starts with ALL coord-valid My Picks.
  // Items too far from today's base are deferred (not deleted) for next-day re-evaluation.
  // Items placed today are removed at the next iteration's start via usedPlaceIds.
  let remainingCartHints = [...cartHints];

  // TASK-053: GPS 제거 — AI Trip 기본 생성에서 권한 요청하지 않음
  // GPS는 별도 "Use my current location" 버튼에서만 요청해야 함
  const fallbackCoord = resolveCoordinate(city, cart);

  const pace       = toPace(tstyle);
  const evtCoords  = getEventCoords(cart, sd, ed);
  const timestamp  = arrTime ?? "14:00";

  // TASK-021: 로케일 감지 (SSR-safe)
  const locale = typeof navigator !== "undefined"
    ? navigator.language.split("-")[0].toLowerCase()
    : "en";

  // TASK-056-A: Cart item coordinate map — used to track previous-day last position
  const cartCoordByKey: Record<string, { lat: number; lng: number }> = {};
  for (const h of cartHints) cartCoordByKey[h.place_id] = { lat: h.lat, lng: h.lng };

  // TASK-056-A: Per-day coordinate — starts at arrival coord (or fallback), updated
  // after each day to the last scheduled place so the next day's NearMe query is
  // anchored near where the traveller actually ends up.
  let currentCoordinate = arrivalCoord ?? fallbackCoord;

  // TASK-054: Sequential per-day generation (was Promise.all) so each day can
  // exclude places already scheduled in previous days, preventing Day 2/3/4 repeats.
  const rawResults: ApiTripPlanResult[] = [];
  const usedPlaceIds: string[] = [];  // accumulated across days
  // TASK-057-B3: Trip-level signals for scheduling microcopy
  let hadDeferredCartHints = false;
  let usedCartHintCentroid = false;

  for (let i = 0; i < dates.length; i++) {
    const trip_date  = dates[i]!;
    const start_time = i === 0 ? (arrTime ?? "09:00") : "09:00";
    const end_time   = i === dates.length - 1 ? (deptTime ?? "21:00") : "21:00";

    // TASK-056-B: Always use currentCoordinate (previous day's last position) as NearMe base.
    // departureCoord on the last day caused airport-area coordinate collision with Day 1,
    // exhausting candidates and leaving Day 4 empty. end_time already constrains departure timing.
    // TASK-057-B2: dayStartCoordinate is the immutable scheduler base for this day.
    const dayStartCoordinate = currentCoordinate;

    // TASK-057-B1: Evict already-placed My Picks from the remaining pool, then
    // build today's cart_hints from hints within today's distance threshold.
    // Hints that are too far are NOT removed — they stay for next-day re-evaluation.
    {
      const placedSet = new Set(usedPlaceIds.map(String));
      remainingCartHints = remainingCartHints.filter(h => !placedSet.has(String(h.place_id)));
    }
    const maxKm = i === 0 ? DAY1_CART_HINT_MAX_KM : DEFAULT_CART_HINT_MAX_KM;
    const todayCartHints = remainingCartHints.filter(h =>
      haversineKm(currentCoordinate.lat, currentCoordinate.lng, h.lat, h.lng) <= maxKm
    );

    // TASK-057-B2-2: Override NearMe search center to My Pick cluster centroid when safe.
    // Only applies when the centroid is within NEAR_ME_CLUSTER_SEARCH_MAX_KM of dayStartCoordinate
    // to prevent teleporting the search to a far-away My Pick cluster (e.g. airport Day 1).
    const todayCartHintsCentroid = getCartHintsCentroid(todayCartHints);
    const nearMeSearchCoordinate =
      todayCartHintsCentroid !== null &&
      haversineKm(
        dayStartCoordinate.lat, dayStartCoordinate.lng,
        todayCartHintsCentroid.lat, todayCartHintsCentroid.lng
      ) <= NEAR_ME_CLUSTER_SEARCH_MAX_KM
        ? todayCartHintsCentroid
        : dayStartCoordinate;

    // TASK-057-B3: Detect deferred My Picks and centroid usage for microcopy
    if (todayCartHints.length < remainingCartHints.length) hadDeferredCartHints = true;
    if (nearMeSearchCoordinate !== dayStartCoordinate)     usedCartHintCentroid  = true;

    if (start_time >= end_time) {
      rawResults.push({
        data:      { kind: "conflict" as const, error: { code: "HC-6", message: "No valid time window" } },
        place_map: {} as PlaceDisplayMap,
      });
      continue;
    }

    try {
      const res = await fetch("/api/trip/plan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          coordinate:       nearMeSearchCoordinate,
          start_coordinate: { lat: dayStartCoordinate.lat, lng: dayStartCoordinate.lng },
          timestamp,
          trip_date,
          start_time,
          end_time,
          pace,
          event_coords:       evtCoords.length         > 0 ? evtCoords         : undefined,
          cart_coord_hints:   todayCartHints.length    > 0 ? todayCartHints    : undefined,
          exclude_place_ids:  usedPlaceIds.length      > 0 ? usedPlaceIds      : undefined,
          city,
          locale,
        }),
      });

      if (res.status === 409) {
        const body = await res.json() as { error: string; conflict?: unknown };
        rawResults.push({
          data:      { kind: "conflict" as const, error: body.conflict },
          place_map: {} as PlaceDisplayMap,
        });
        continue;
      }
      if (!res.ok) {
        rawResults.push({
          data:      { kind: "conflict" as const, error: { message: `HTTP ${res.status}` } },
          place_map: {} as PlaceDisplayMap,
        });
        continue;
      }

      const dayResult = await res.json() as ApiTripPlanResult;
      rawResults.push(dayResult);

      // Accumulate only actually-placed place_ids so future days exclude them
      const placedIds = (dayResult?.data?.plan?.items ?? [])
        .map((item: ApiScheduledItem) => item.place_id ?? item.event_id)
        .filter((id): id is string => Boolean(id));
      usedPlaceIds.push(...placedIds);

      // TASK-056-A: Update currentCoordinate to the last scheduled place of this day
      // so the next day's NearMe search starts near where the traveller ends up.
      const scheduledItems = (dayResult?.data?.plan?.items ?? [])
        .filter((item: ApiScheduledItem) => item.item_type !== "affiliate");
      const lastItem = scheduledItems.at(-1);
      if (lastItem) {
        const lastId = lastItem.place_id ?? lastItem.event_id ?? "";
        const cartCoord = cartCoordByKey[lastId];
        if (cartCoord) {
          currentCoordinate = cartCoord;
        } else {
          const placeEntry = dayResult.place_map?.[lastId];
          if (placeEntry?.lat != null && placeEntry?.lng != null) {
            currentCoordinate = { lat: placeEntry.lat, lng: placeEntry.lng };
          }
        }
      }
    } catch {
      rawResults.push({
        data:      { kind: "conflict" as const, error: { message: "Network error" } },
        place_map: {} as PlaceDisplayMap,
      });
    }
  }

  const conflictDayNumbers: number[] = [];
  const days: Day[] = rawResults.map((result, i) => {
    const dayNumber = i + 1;
    const tripDate  = dates[i] ?? sd;
    const resp      = result?.data;
    const placeMap  = result?.place_map ?? {};

    if (!resp || resp.kind === "conflict") {
      conflictDayNumbers.push(dayNumber);
      return { date: tripDate, dayNumber, places: [] };
    }

    const cartHintMap = result?.cart_hint_map ?? {};

    const plan = resp.plan;
    if (!plan || !Array.isArray(plan.items)) {
      conflictDayNumbers.push(dayNumber);
      return { date: tripDate, dayNumber, places: [] };
    }

    const places: Place[] = (plan.items as ApiScheduledItem[])
      .filter(item => item.item_type !== "affiliate")
      .map(item => {
        const key      = item.place_id ?? item.event_id ?? "";
        const cartFull = cartItemByKey[key];
        const display: PlaceDisplay = placeMap[key] ?? (cartFull ? {
          name:            cartFull.name,
          category:        cartFull.type || "attraction",
          district:        cartFull.district || city,
          tips:            cartFull.description || "",
          google_maps_url: cartFull.mapUrl
            || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cartFull.name} ${city} Korea`)}`,
        } : syntheticPlaceDisplay(item, city));
        const cartHint = cartHintMap[key];
        return {
          name:              display.name,
          category:          display.category,
          location:          display.district,
          time:              item.start_time,
          duration:          `${item.stay_minutes}m`,
          tips:              display.tips,
          googleMapsUrl:     display.google_maps_url,
          slot:              assignSlot(item.start_time),
          affiliateUrl:      cartHint?.affiliate_url,
          affiliateProvider: cartHint?.affiliate_provider,
          bookingUrl:        cartHint?.booking_url,
        };
      });

    return { date: tripDate, dayNumber, places };
  });

  const isFallback = rawResults.some(r => r?.data?.kind === "fallback");

  // TASK-021: 모든 일차의 affiliate_map을 병합 (동일 링크는 마지막 값으로 덮어쓰기)
  const affiliateMap: AffiliateDisplayMap = {};
  for (const result of rawResults) {
    const map = (result as ApiTripPlanResult)?.affiliate_map;
    if (map) Object.assign(affiliateMap, map);
  }

  const elapsed = Date.now() - t0;
  const wait    = Math.max(0, MIN_MS - elapsed);
  if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));

  return { days, isFallback, conflictDayNumbers, affiliateMap, skippedCartNames, hadDeferredCartHints, usedCartHintCentroid };
}

// ── 카테고리 이미지 ───────────────────────────────────────────
function getCategoryImage(category: string, name: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.includes("beach") || n.includes("haeundae") || n.includes("gwangalli") || n.includes("songdo"))
    return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800";
  if (n.includes("temple") || n.includes("shrine") || n.includes("haedong"))
    return "https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=800";
  if (n.includes("market") || c.includes("market"))
    return "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=800";
  if (n.includes("mountain") || n.includes("trail") || n.includes("jangsan") || n.includes("hwangnyeong"))
    return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800";
  if (n.includes("cable car") || n.includes("aerial"))
    return "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800";
  if (n.includes("gamcheon"))
    return "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800";
  if (c.includes("restaurant") || c.includes("food") || c.includes("dining"))
    return "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=800";
  if (c.includes("cafe") || c.includes("coffee"))
    return "https://images.unsplash.com/photo-1447933601403-0c6688de566a?w=800";
  if (c.includes("museum"))
    return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800";
  if (c.includes("park") || c.includes("nature") || c.includes("garden"))
    return "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800";
  if (c.includes("k-pop") || c.includes("concert"))
    return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800";
  return "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800";
}

function getCategoryColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("restaurant") || c.includes("food")) return "#f97316";
  if (c.includes("cafe") || c.includes("coffee")) return "#d97706";
  if (c.includes("market")) return "#dc2626";
  if (c.includes("museum")) return "#7c3aed";
  if (c.includes("park") || c.includes("nature")) return "#16a34a";
  if (c.includes("k-pop") || c.includes("concert")) return "#9333ea";
  if (c.includes("shopping")) return "#db2777";
  return "#1a1f36";
}

// ══════════════════════════════════════════════════════════════
//  PlaceModal
// ══════════════════════════════════════════════════════════════
interface ModalProps {
  place: Place;
  city: string;
  citySpots: CitySpot[];
  onClose: () => void;
}

function PlaceModal({ place, city, citySpots, onClose }: ModalProps) {
  const matched    = matchCitySpot(place.name, citySpots);
  const snap       = place.cartSnapshot;
  const naverUrl   = snap?.naverMapUrl ?? buildNaverUrl(place.name, city);
  const googleUrl  = place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;
  const imageUrl   = snap?.image ?? getCategoryImage(place.category, place.name);
  const badgeColor = getCategoryColor(place.category);
  const tags       = snap?.tags ?? [];
  const desc       = snap?.whyItMatters ?? snap?.description ?? place.tips;

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); },
    [onClose]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    window.history.pushState({ koreamate_modal: true }, "");
    const handlePop = () => { onCloseRef.current(); };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("popstate", handlePop);
      document.body.style.overflow = "";
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        style={{ animation: "modalSlideIn 0.22s ease-out" }}
      >
        <div className="relative h-52 sm:h-72 flex-shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={place.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors backdrop-blur-sm font-bold text-base cursor-pointer z-10"
          >✕</button>
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wide text-white" style={{ backgroundColor: badgeColor }}>
              {place.category}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-black/50 text-white backdrop-blur-sm">
              🕒 {place.time} · {place.duration}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "#f97316" }}>📍 {place.location}</p>
            <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] leading-tight">{place.name}</h2>
          </div>
          <div className="bg-[#FAF7F2] border border-[#E6DFD5] rounded-2xl p-5">
            <p className="text-xs font-black uppercase tracking-widest mb-2 text-[#8C6239]">💡 Tips for Foreigners</p>
            <p className="text-base text-[#61554D] leading-relaxed font-medium">{desc}</p>
          </div>
          {(snap?.soloFriendly != null || snap?.cashOnly || snap?.foreignCardAccepted != null) && (
            <div className="flex flex-wrap gap-2">
              {snap?.soloFriendly     && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">👤 Solo OK</span>}
              {snap?.cashOnly         && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">💵 Cash Only</span>}
              {snap?.foreignCardAccepted && !snap?.cashOnly && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">💳 Card OK</span>}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <span key={tag} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tag}</span>
              ))}
            </div>
          )}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-bold text-green-700 mb-1">💡 If Naver Maps can&apos;t find it by English name, search in Korean directly.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
              🗺️ Google Maps
            </a>
            <a href={naverUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors">
              💚 Naver Maps
            </a>
          </div>

          {/* ── Cart 아이템 제휴 링크 (P0-1 Phase 2: 수익화 생존 체인) ── */}
          {(place.affiliateUrl || place.bookingUrl) && (
            <a
              href={(place.affiliateUrl ?? place.bookingUrl)!}
              target="_blank" rel="noopener noreferrer sponsored"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3.5 rounded-xl text-sm font-bold text-white transition-colors"
              style={{ background: place.affiliateUrl ? "linear-gradient(135deg, #f97316, #ea580c)" : "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
            >
              {place.affiliateUrl
                ? (place.affiliateProvider === "klook" ? "🎟️ Book on Klook" : "🔗 Book Now")
                : "🏨 Book Stay"}
            </a>
          )}

          {/* ── SpotCard enrichment (SSOT: city_spots 매칭 성공 시) ── */}
          {matched && (
            <div className="border-t border-[#E6DFD5] pt-5 space-y-3">
              {/* difficulty + entry_fee 배지 */}
              <div className="flex flex-wrap gap-2">
                {matched.difficulty && (() => {
                  const label = matched.difficulty === "easy" ? "🟢 Easy" : matched.difficulty === "moderate" ? "🟡 Moderate" : "🔴 Hard";
                  const cls   = matched.difficulty === "easy" ? "bg-green-50 text-green-700 border-green-100" : matched.difficulty === "moderate" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-red-50 text-red-700 border-red-100";
                  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>;
                })()}
                {matched.entryFee && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">💰 {matched.entryFee}</span>
                )}
              </div>
              {/* Official Info + Affiliate CTA */}
              <div className={`grid gap-3 ${matched.officialUrl && matched.affiliateUrl ? "grid-cols-2" : "grid-cols-1"}`}>
                {matched.officialUrl && (
                  <a
                    href={matched.officialUrl}
                    target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-colors"
                    style={{ backgroundColor: "#7c3aed" }}
                  >
                    🏔️ Official Info
                  </a>
                )}
                {matched.affiliateUrl && (
                  <a
                    href={matched.affiliateUrl}
                    target="_blank" rel="noopener noreferrer sponsored"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-colors"
                    style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                  >
                    {matched.affiliateProvider === "klook" ? "🎟️ Book Tour" : "🏨 Book Stay"}
                  </a>
                )}
              </div>
            </div>
          )}

          <button onClick={onClose}
            className="w-full py-3.5 rounded-xl text-sm font-black text-[#2C2520] border-2 border-[#E6DFD5] hover:border-[#D4AF37] hover:bg-[#FAF7F2] transition-all cursor-pointer">
            Close
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.93) translateY(12px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);     }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  일정 결과 컴포넌트
// ══════════════════════════════════════════════════════════════
function ItineraryResult() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── URL 파라미터 (stable consts) ──────────────────────────
  const shareId          = searchParams.get("id");
  const paramCity        = searchParams.get("city")          || "Seoul";
  const paramStartDate   = searchParams.get("startDate")     || "";
  const paramEndDate     = searchParams.get("endDate")       || "";
  const paramTravelers   = searchParams.get("travelers")     || "1";
  const paramTravelStyle = searchParams.get("travelStyle")   || "Solo";
  const paramStartLoc       = searchParams.get("startLocation")  || "";
  const paramArrivalTime    = searchParams.get("arrivalTime")    || "";
  const paramDeparturePlace = searchParams.get("departurePlace") || "";
  const paramDepartureTime  = searchParams.get("departureTime")  || "";
  // TASK-056-A: arrival/departure coordinates from planner page option presets
  const _paramArrivalLat  = parseFloat(searchParams.get("arrivalLat")   ?? "");
  const _paramArrivalLng  = parseFloat(searchParams.get("arrivalLng")   ?? "");
  const _paramDepartureLat = parseFloat(searchParams.get("departureLat") ?? "");
  const _paramDepartureLng = parseFloat(searchParams.get("departureLng") ?? "");
  const paramArrivalCoord  = !isNaN(_paramArrivalLat)  && !isNaN(_paramArrivalLng)
    ? { lat: _paramArrivalLat,  lng: _paramArrivalLng  } : undefined;
  const paramDepartureCoord = !isNaN(_paramDepartureLat) && !isNaN(_paramDepartureLng)
    ? { lat: _paramDepartureLat, lng: _paramDepartureLng } : undefined;
  // TASK-060-B3D: transport point type from city-presets.ts — replaces fragile string matching
  const paramArrivalType   = searchParams.get("arrivalType")   || "";
  const paramDepartureType = searchParams.get("departureType") || "";

  // ── 표시용 메타 (공유 링크 로드 시 Supabase 값으로 덮어씀) ─
  const [city,        setCity]        = useState(paramCity);
  const [startDate,   setStartDate]   = useState(paramStartDate);
  const [endDate,     setEndDate]     = useState(paramEndDate);
  const [travelers,   setTravelers]   = useState(paramTravelers);
  const [travelStyle, setTravelStyle] = useState(paramTravelStyle);

  // ── 핵심 상태 ─────────────────────────────────────────────
  const [days,          setDays]          = useState<Day[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [isFallback,    setIsFallback]    = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [viewMode,      setViewMode]      = useState<"full" | "compact">("full");
  const [editDay,       setEditDay]       = useState(0);
  // ── 보관함 (cart 아이템 — Unscheduled 패널용) ─────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return getCart(); } catch { return []; }
  });
  // ── 로딩 페이즈 (Task 1: 강제 드웰 타임 + 제휴 노출) ─────────
  const [loadPhase, setLoadPhase] = useState(0);

  // ── Supabase 동기화 상태 ──────────────────────────────────
  const [itinId,      setItinId]      = useState<string | null>(null);
  const [syncStatus,  setSyncStatus]  = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncFading,  setSyncFading]  = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [emailModalOpen,  setEmailModalOpen]  = useState(false);
  const [emailSaved,      setEmailSaved]      = useState(() => isEmailSaved());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 플래너 뱃지 ────────────────────────────────────────────
  const [plannerMeta,  setPlannerMeta]  = useState<{ numDays: number; startDate: string } | null>(null);

  // ── 커스텀 제목 편집 (Bug ③) ──────────────────────────────
  const [tripTitle,    setTripTitle]    = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput,   setTitleInput]   = useState("");

  // ── 오너 판별 (shareId로 접근해도 본인 일정이면 편집 허용) ──
  const [isOwner, setIsOwner] = useState(!shareId);

  // ── TASK-018: 부분 실패 일차 추적 (Partial Success Policy) ──
  const [conflictDays,  setConflictDays]  = useState<Set<number>>(new Set());
  // ── TASK-049: Cart 아이템 좌표 없음 경고 표시용 ────────────────────────────────
  const [skippedCartNames, setSkippedCartNames] = useState<string[]>([]);
  // ── TASK-057-B3: My Pick scheduling explanation notes ─────────────────────────
  const [tripNotes,        setTripNotes]        = useState<string[]>([]);
  // ── TASK-021: Supabase affiliate 표시 맵 ─────────────────────────────────────
  const [affiliateMap,  setAffiliateMap]  = useState<AffiliateDisplayMap>({});
  // ── TASK-022: Trip Moments ────────────────────────────────────────────────────
  const [moments,         setMoments]         = useState<TripMoment[]>([]);
  const [captureOpen,     setCaptureOpen]     = useState(false);
  const [storyExportOpen, setStoryExportOpen] = useState(false);
  // ── SSOT: city_spots — PlaceModal 제휴 정보 통합 ─────────────────────────────
  const [citySpots, setCitySpots] = useState<CitySpot[]>([]);

  // ── 취향 태그 (cart 기반 — 세션 내 고정) ──────────────────
  const [prefTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cart = getCart();
      const tagSet = new Set<string>();
      cart.forEach(item => (item.tags ?? []).forEach((t: string) => tagSet.add(t)));
      const tags = Array.from(tagSet).slice(0, 6);
      return tags.length > 0 ? tags : ([paramTravelStyle].filter(Boolean) as string[]);
    } catch { return []; }
  });

  // ── 도착 시간 파싱 (컴포넌트 레벨 — 3중 방어의 공통 기준) ─
  const arrivalHour = parseInt(paramArrivalTime?.split(":")?.[0] ?? "14", 10);

  // 공항 저녁 도착 감지 — TASK-060-B3D: type 기반으로 교체 (문자열 "gimhae"/"airport"/"공항" 의존 제거)
  const isAirportEvening = paramArrivalType === "airport" && arrivalHour >= 17;

  // 저녁 도착 감지 (공항 포함 — 17:00 이후 모든 케이스)
  const isEveningOrNightArrival = arrivalHour >= 17;

  // Layer 2a: 공항 저녁 도착인데 금지 장소(해운대 등)가 Day 1에 있으면 true
  // TASK-060-E: keyword 출처를 city preset으로 이동 — 부산 전용 하드코딩 제거
  const PROHIBITED_DAY1 = CITY_DAY1_PROHIBITED[paramCity] ?? [];
  const day1HasProhibited = (dayList: Day[]): boolean => {
    const first = dayList[0];
    if (!first) return false;
    return first.places.some(p =>
      PROHIBITED_DAY1.some(kw =>
        p.name.toLowerCase().includes(kw) || p.location.toLowerCase().includes(kw)
      )
    );
  };

  // ── sanitizeDays: setDays 전 반드시 통과하는 유일한 정렬·세정 게이트 ──
  // 1) 모든 day.places를 HH:MM 시간 오름차순 정렬 (stable: origIdx 서브키)
  // 2) 공항 저녁 도착 Day 1: arrivalHour 이전 & 금지 장소 물리 제거
  // 3) 저녁/야간 도착 Day 1: arrivalHour 이전 슬롯 물리 제거 (Morning/Lunch 차단)

  // Edge Case 1/3: null·undefined·빈문자열 안전 처리 + 명시적 string | null | undefined 수용
  const timeToMins = (t: string | null | undefined): number => {
    const parts = (t ?? "12:00").split(":");
    const h = parseInt(parts[0] ?? "12", 10);
    const m = parseInt(parts[1] ?? "0", 10);
    return (isNaN(h) ? 12 : h) * 60 + (isNaN(m) ? 0 : m);
  };

  const sanitizeDays = (rawDays: Day[]): Day[] =>
    rawDays.map((day, dayIdx) => {
      // ① 시간 오름차순 정렬 — origIdx를 서브 정렬 키로 사용하여 동일 시간대 순서 보장
      const sorted = day.places
        .map((p, origIdx) => ({ p, origIdx }))
        .sort((a, b) => {
          const diff = timeToMins(a.p.time) - timeToMins(b.p.time);
          return diff !== 0 ? diff : a.origIdx - b.origIdx; // 동일 시간 → 원래 입력 순서 유지
        })
        .map(({ p }) => p);

      // ② Day 1 필터링: 도착 시간(arrivalHour) 이전 슬롯 제거
      //   - 공항 저녁: arrivalHour 이전 AND 금지 장소 모두 제거
      //   - 그 외 비모닝 도착(arrivalHour > 9): arrivalHour 이전 슬롯 제거
      let cleaned = sorted;
      if (dayIdx === 0 && arrivalHour > 9) {
        if (isAirportEvening) {
          // 공항 저녁: arrivalHour 이전 AND 금지 장소 모두 제거
          cleaned = sorted.filter(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
            const prohibited = PROHIBITED_DAY1.some(
              kw => p.name.toLowerCase().includes(kw) || p.location.toLowerCase().includes(kw)
            );
            return h >= arrivalHour && !prohibited;
          });
        } else {
          // 일반 도착(정오/오후/저녁/야간): arrivalHour 이전 시간 슬롯 제거
          cleaned = sorted.filter(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
            return h >= arrivalHour;
          });
        }
      }

      // ③ Last day: 출발시간(paramDepartureTime) 이후 슬롯 제거
      const isLastDay = dayIdx === rawDays.length - 1;
      if (isLastDay && paramDepartureTime) {
        const deptMins = timeToMins(paramDepartureTime);
        if (deptMins > 0) {
          cleaned = cleaned.filter(p => timeToMins(p.time) < deptMins);
        }
      }

      return { ...day, places: cleaned };
    });

  // ══════════════════════════════════════════════════════════
  //  Effect 1: 공유 링크 모드 (?id=UUID) → Supabase에서 로드
  //  2단계 폴백: ① ID만 쿼리 (공유 링크 / RLS 전체 허용)
  //              ② null이면 device_id 추가 재시도 (RLS가 device_id 일치 요구 시)
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!shareId) return;
    setLoading(true);

    const loadItinerary = async () => {
      // 시도 1: device_id 없이 ID만으로 조회 (공유 링크 / 익명 읽기 가능 RLS)
      let record = await fetchItinerary(shareId);

      // 시도 2: RLS가 device_id 일치를 요구할 경우 자신의 device_id로 재시도
      if (!record) {
        record = await fetchItinerary(shareId, getDeviceId());
      }

      if (!record) {
        // 두 시도 모두 실패 → My Trips로 복귀
        router.replace("/my-trips");
        return;
      }

      // days 필드 손상 방어 — v2 포맷({ __v:2, scheduled, unscheduled }) 및 legacy Day[] 모두 수용
      const rawShareDays = record.days as Record<string, unknown> | Day[] | null | undefined;
      let sharedDays: Day[];
      if (!rawShareDays) {
        // null / undefined → 빈 일정으로 처리
        sharedDays = [];
      } else if (!Array.isArray(rawShareDays) && (rawShareDays as Record<string, unknown>).__v === 2) {
        sharedDays = ((rawShareDays as { scheduled?: Day[] }).scheduled) ?? [];
      } else if (Array.isArray(rawShareDays)) {
        sharedDays = rawShareDays;
      } else {
        setError("Itinerary data is corrupted. Please regenerate.");
        setLoading(false);
        return;
      }
      if (sharedDays.length === 0) {
        setError("Itinerary data is empty. Please regenerate.");
        setLoading(false);
        return;
      }

      setDays(sanitizeDays(sharedDays));
      setItinId(shareId);
      setCity(record.city);
      setStartDate(record.start_date);
      setEndDate(record.end_date);
      setTravelers(record.travelers);
      setTravelStyle(record.travel_style);
      if (record.trip_title) setTripTitle(record.trip_title);
      setIsOwner((record as { device_id?: string }).device_id === getDeviceId());
      setSyncStatus("saved");
      setLoading(false);
    };

    loadItinerary().catch(err => {
      setError(`Failed to load itinerary: ${(err as Error).message}`);
      setLoading(false);
    });
  }, [shareId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  //  Effect 2: 일반 모드 → Supabase 우선, 없으면 AI 생성
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (shareId) return; // Effect 1이 처리
    if (!paramStartDate || !paramEndDate) {
      setError("Please select travel dates.");
      setLoading(false);
      return;
    }

    // ── Layer 1: 구버전(v1/v2) 캐시 키 일회성 철거 → 잘못 생성된 구버전 UUID 완전 무효화
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (
          k.startsWith("koreamate_itin_v2_") ||
          k.startsWith("koreamate_itin_id_") ||   // ← v1 prefix (구버전) 전부 제거
          k === "koreamate_planner_v1"
        )) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }

    // ── 캐시 키 v3: startLocation + arrivalTime 해시 포함, 구버전과 완전 분리
    const locHash  = (paramStartLoc + paramArrivalTime).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    const deptHash = (paramDeparturePlace + paramDepartureTime).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
    const idLocalKey = `koreamate_itin3_id_${paramCity}_${paramStartDate}_${paramEndDate}_${paramTravelers}_${paramTravelStyle}_${locHash}${deptHash ? "_d" + deptHash : ""}`;
    let id: string | null = null;
    try { id = localStorage.getItem(idLocalKey); } catch {}
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(idLocalKey, id); } catch {}
    }
    setItinId(id);

    // ── Supabase 우선 로드 + Layer 2: 내용 검증
    fetchItinerary(id).then(record => {
      // v2 포맷 파싱 헬퍼 — { __v:2, scheduled, unscheduled } 또는 구버전 Day[]
      const raw = record?.days as Record<string, unknown> | Day[] | undefined;
      let loadedDays: Day[];
      let loadedUnscheduled: CartItem[] = [];
      if (raw && !Array.isArray(raw) && (raw as Record<string, unknown>).__v === 2) {
        const v2 = raw as { scheduled: Day[]; unscheduled: CartItem[] };
        loadedDays        = v2.scheduled    ?? [];
        loadedUnscheduled = v2.unscheduled  ?? [];
      } else {
        loadedDays = (raw as Day[]) ?? [];
      }

      const allDaysEmpty =
        Array.isArray(loadedDays) &&
        loadedDays.length > 0 &&
        loadedDays.every(d => !d.places || d.places.length === 0);
      if (record && Array.isArray(loadedDays) && loadedDays.length > 0 && !allDaysEmpty) {
        // Day 1 이른 슬롯 감지 — 저녁 도착인데 arrivalHour 이전 슬롯이 있으면 오염된 캐시
        const day1HasEarlySlot = (dayList: Day[]): boolean => {
          const first = dayList[0];
          if (!first) return false;
          return first.places.some(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "14", 10);
            return h < arrivalHour;
          });
        };
        // Layer 2: ① 공항 저녁 + 금지 장소 OR ② 일반 저녁 + Day 1 이른 슬롯
        const cacheIsStale =
          (isAirportEvening && day1HasProhibited(loadedDays)) ||
          (isEveningOrNightArrival && day1HasEarlySlot(loadedDays));
        if (cacheIsStale) {
          const freshId = crypto.randomUUID();
          try { localStorage.setItem(idLocalKey, freshId); } catch {}
          setItinId(freshId);
          setLoading(true);
          setError(null);
          generateWithNewApi(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle, paramArrivalTime || undefined, paramDepartureTime || undefined, paramArrivalCoord, paramDepartureCoord)
            .then(({ days, isFallback, conflictDayNumbers, affiliateMap: aMap, skippedCartNames: skipped, hadDeferredCartHints: deferred, usedCartHintCentroid: centroidUsed }) => {
              setDays(sanitizeDays(days));
              if (isFallback) setIsFallback(true);
              if (conflictDayNumbers.length > 0) setConflictDays(new Set(conflictDayNumbers));
              if (Object.keys(aMap).length > 0) setAffiliateMap(aMap);
              if (skipped.length > 0) setSkippedCartNames(skipped);
              const notes: string[] = [];
              if (deferred)     notes.push("Some of your picks were saved for a later day to keep the route efficient.");
              if (centroidUsed) notes.push("Nearby places were added around your selected spots.");
              if (notes.length > 0) setTripNotes(notes);
              if (days.length > 0 && conflictDayNumbers.length === days.length) {
                setError("We couldn't generate your trip plan right now. Please try again in a moment.");
              }
              setLoading(false);
            })
            .catch(() => { setError("Network error — please check your connection and try again."); setLoading(false); });
          return;
        }
        // 정상 레코드 → sanitize 후 사용 + Supabase 보관함 복원
        setDays(sanitizeDays(loadedDays));
        if (record.trip_title) setTripTitle(record.trip_title);
        if (loadedUnscheduled.length > 0) {
          try {
            localStorage.setItem("koreamate_cart", JSON.stringify(
              loadedUnscheduled.map((item, i) => ({ ...item, addedAt: item.addedAt || Date.now(), sortOrder: i }))
            ));
            window.dispatchEvent(new CustomEvent(CART_EVENT));
          } catch { /* ignore */ }
        }
        setSyncStatus("saved");
        setLoading(false);
        return;
      }
      // Bug ②: Supabase에 없으면(삭제된 ID 포함) 새 UUID 발급 → 기존 UUID로 부활 방지
      const freshId = crypto.randomUUID();
      try { localStorage.setItem(idLocalKey, freshId); } catch {}
      setItinId(freshId);
      setLoading(true);
      setError(null);
      generateWithNewApi(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle, paramArrivalTime || undefined, paramDepartureTime || undefined, paramArrivalCoord, paramDepartureCoord)
        .then(({ days, isFallback, conflictDayNumbers, affiliateMap: aMap, skippedCartNames: skipped, hadDeferredCartHints: deferred, usedCartHintCentroid: centroidUsed }) => {
          setDays(sanitizeDays(days));
          if (isFallback) setIsFallback(true);
          if (conflictDayNumbers.length > 0) setConflictDays(new Set(conflictDayNumbers));
          if (Object.keys(aMap).length > 0) setAffiliateMap(aMap);
          if (skipped.length > 0) setSkippedCartNames(skipped);
          const notes: string[] = [];
          if (deferred)     notes.push("Some of your picks were saved for a later day to keep the route efficient.");
          if (centroidUsed) notes.push("Nearby places were added around your selected spots.");
          if (notes.length > 0) setTripNotes(notes);
          if (days.length > 0 && conflictDayNumbers.length === days.length) {
            setError("We couldn't generate your trip plan right now. Please try again in a moment.");
          }
          setLoading(false);
        })
        .catch((err) => { setError(`Failed to generate itinerary: ${(err as Error).message}`); setLoading(false); });
    }).catch((err) => { setError(`Failed to load saved itinerary: ${(err as Error).message}`); setLoading(false); });
  }, [shareId, paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  //  Effect 3: days 변경 → Supabase 자동 동기화
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (days.length === 0 || !itinId) return;
    // 빈 스케줄이 Supabase에 저장되면 다음 세션에서 빈 일정이 복원됨 → 저장 금지
    const allDaysEmpty = days.length > 0 && days.every(d => !d.places || d.places.length === 0);
    if (allDaysEmpty) return;

    // Supabase 디바운스 동기화 (1.5s)
    setSyncStatus("saving");
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    const snapId          = itinId;
    const snapCity        = city;
    const snapStartDate   = startDate;
    const snapEndDate     = endDate;
    const snapTravelers   = travelers;
    const snapTravelStyle = travelStyle;
    const snapDays        = days;
    // 보관함(Unscheduled)도 함께 Supabase에 영구 저장 — Single Source of Truth 구현
    const snapUnscheduled = getCart();

    syncTimerRef.current = setTimeout(async () => {
      const ok = await upsertItinerary({
        id: snapId, city: snapCity,
        start_date: snapStartDate, end_date: snapEndDate,
        travelers: snapTravelers, travel_style: snapTravelStyle,
        days: { __v: 2, scheduled: snapDays, unscheduled: snapUnscheduled },
        device_id: getDeviceId(),
      });
      setSyncStatus(ok ? "saved" : "error");
      if (ok) {
        setTimeout(() => setSyncFading(true), 2500);
        setTimeout(() => { setSyncStatus("idle"); setSyncFading(false); }, 3000);
      }
    }, 1500);

    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [days, itinId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TASK-022: itinId 확정 시 moments 로드 ──────────────────
  useEffect(() => {
    if (!itinId) return;
    setMoments(loadMoments(itinId));
  }, [itinId]);

  // ── SSOT: city 확정 시 city_spots 로드 (PlaceModal 제휴 정보) ──
  useEffect(() => {
    if (!city) return;
    fetchCitySpots(city.toLowerCase()).then(setCitySpots);
  }, [city]);

  // ── 플래너 메타 뱃지 읽기 (반응형) ────────────────────────
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("koreamate_planner_meta");
        setPlannerMeta(raw ? (JSON.parse(raw) as { numDays: number; startDate: string }) : null);
      } catch { setPlannerMeta(null); }
    };
    read();
    window.addEventListener(PLANNER_EVENT, read);
    return () => window.removeEventListener(PLANNER_EVENT, read);
  }, []);

  // ── 브라우저 탭 제목 동기화 ────────────────────────────────
  useEffect(() => {
    document.title = tripTitle
      ? `${tripTitle} — KoreaMate`
      : `My ${city} Trip — KoreaMate`;
  }, [tripTitle, city]);

  // ── 로딩 페이즈 사이클링 (2.5~3.5s 강제 드웰 타임) ─────────
  useEffect(() => {
    if (!loading || shareId) { setLoadPhase(0); return; }
    const t1 = setTimeout(() => setLoadPhase(1), 1200);
    const t2 = setTimeout(() => setLoadPhase(2), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loading, shareId]);

  // ── 공유 링크 복사 (TASK-026: /shared/ 전용 뷰어 URL 사용) ──
  async function handleCopyShareLink() {
    if (!itinId) return;
    const url = `${window.location.origin}/shared/${itinId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API 미지원 브라우저: prompt로 수동 복사 유도
      window.prompt("Copy this link:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── TASK-022: moment 저장 / 삭제 ────────────────────────────
  const handleMomentSave = useCallback(async (moment: TripMoment) => {
    if (!itinId) return;
    const updated = await addMoment(itinId, moment);
    setMoments(updated);
    setCaptureOpen(false);
  }, [itinId]);

  const handleMomentDelete = useCallback(async (momentId: string) => {
    if (!itinId) return;
    const updated = await deleteMoment(itinId, momentId);
    setMoments(updated);
  }, [itinId]);

  // ── Bug ③: 커스텀 제목 저장 ─────────────────────────────────
  async function handleTitleSave() {
    const trimmed = titleInput.trim();
    setEditingTitle(false);
    if (!trimmed || !itinId) return;
    setTripTitle(trimmed);
    await updateItineraryTitle(itinId, trimmed, getDeviceId());
  }

  // ── 인라인 편집: 장소 삭제 / 순서 변경 ─────────────────────
  function deletePlace(dayIdx: number, placeIdx: number) {
    setDays(prev => prev.map((day, di) =>
      di === dayIdx
        ? { ...day, places: day.places.filter((_, pi) => pi !== placeIdx) }
        : day
    ));
  }

  function movePlace(dayIdx: number, placeIdx: number, dir: "up" | "down") {
    const target = placeIdx + (dir === "up" ? -1 : 1);
    setDays(prev => prev.map((day, di) => {
      if (di !== dayIdx) return day;
      const places = [...day.places];
      if (target < 0 || target >= places.length) return day;
      [places[placeIdx], places[target]] = [places[target], places[placeIdx]];
      return { ...day, places };
    }));
  }

  // ── cart 변경 감지 → Unscheduled 갱신 ─────────────────
  useEffect(() => {
    const refreshCart = () => { try { setCartItems(getCart()); } catch { /* ignore */ } };
    window.addEventListener(CART_EVENT, refreshCart);
    return () => window.removeEventListener(CART_EVENT, refreshCart);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 보관함 아이템 → 현재 editDay에 추가 ─────────────────
  function addCartItemToDay(item: CartItem) {
    const defaultTime = "19:30";
    const newPlace: Place = {
      name:          item.shortName || item.name,
      category:      item.type || "attraction",
      location:      item.district || city,
      time:          defaultTime,
      duration:      item.recommendedDurationMinutes ? `${item.recommendedDurationMinutes}m` : "60m",
      tips:          item.description || item.whyItMatters || "",
      googleMapsUrl: item.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.shortName || item.name} ${city} Korea`)}`,
      slot:          assignSlot(defaultTime),
      cartSnapshot:  item,
    };
    setDays(prev => prev.map((day, di) =>
      di === editDay ? { ...day, places: [...day.places, newPlace] } : day
    ));
    removeFromCart(item.id); // 배치 후 Unscheduled에서 즉시 제거
  }

  // ── 로딩 화면 — 페이즈별 스켈레톤 + 제휴 카드 노출 ──────────
  if (loading) {
    const phase = LOAD_PHASES[Math.min(loadPhase, LOAD_PHASES.length - 1)];
    return (
      <div className="flex-1 flex flex-col items-center py-12 px-4 max-w-4xl mx-auto w-full">

        {/* ── 페이즈 표시기 ── */}
        <div className="text-center mb-8 w-full max-w-lg">
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#EAE3D2]/60 border border-[#E6DFD5] mb-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#D4AF37] shrink-0" />
            <span className="text-sm font-black text-[#2C2520]">
              {shareId ? "Loading shared itinerary…" : phase.label}
            </span>
          </div>
          {!shareId && (
            <div className="w-full bg-[#E6DFD5] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#D4AF37] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${((loadPhase + 1) / LOAD_PHASES.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* ── 제휴 파트너 카드 (드웰 타임 중 자연스럽게 노출) ── */}
        {!shareId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mb-10">
            {phase.cards.map((card) => (
              <div
                key={card.name}
                className="bg-white rounded-2xl border border-[#E6DFD5] p-5 flex items-start gap-4 shadow-sm"
                style={{ animation: "fadeInUp 0.4s ease-out" }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: card.color + "20" }}
                >
                  {card.emoji}
                </div>
                <div>
                  <p className="text-sm font-black text-[#2C2520]">{card.name}</p>
                  <p className="text-xs text-[#61554D] leading-relaxed mt-0.5">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 스켈레톤 일정 카드 ── */}
        <div className="w-full space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E6DFD5] p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-[#EAE3D2]" />
                <div className="h-5 bg-[#EAE3D2] rounded w-24" />
                <div className="h-4 bg-[#EAE3D2] rounded w-16 ml-2" />
              </div>
              <div className="space-y-2.5">
                <div className="h-3.5 bg-[#EAE3D2] rounded w-3/4" />
                <div className="h-3.5 bg-[#EAE3D2] rounded w-1/2" />
                <div className="h-3.5 bg-[#EAE3D2] rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-3xl font-black text-red-600 mb-4">Something went wrong</h2>
        <p className="text-lg text-[#61554D] max-w-md mb-8 font-bold">{error}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/" className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-colors">
            ← Back to Home
          </Link>
          {shareId && (
            <Link href="/my-trips" className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-red-50 text-red-600 border-2 border-red-200 rounded-xl hover:bg-red-100 transition-colors">
              🗑️ My Trips (delete this trip)
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">

      {/* ── 공유 링크 뷰 배너 ── */}
      {shareId && (
        <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-blue-50 border border-blue-200">
          <span className="text-lg">🔗</span>
          <p className="text-sm font-bold text-blue-700 flex-1">
            You&apos;re viewing a shared itinerary. Changes you make will sync back to this link.
          </p>
        </div>
      )}

      {/* ── AI fallback 배너 ── */}
      {isFallback && (
        <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200">
          <span className="text-lg">✨</span>
          <p className="text-sm font-bold text-amber-700 flex-1">
            AI is busy right now, so we prepared a safe KoreaMate recommended plan for you.
          </p>
        </div>
      )}

      {/* ── TASK-049: 좌표 없는 cart 아이템 경고 배너 ── */}
      {skippedCartNames.length > 0 && (
        <div className="mb-6 px-5 py-4 rounded-2xl bg-orange-50 border border-orange-200">
          <p className="text-sm font-bold text-orange-700 mb-1">
            Some selected places could not be scheduled because location data is missing.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {skippedCartNames.map(name => (
              <li key={name} className="text-xs text-orange-600 font-medium">· {name}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-orange-500">
            These places are still saved in your cart and can be added manually.
          </p>
        </div>
      )}

      {/* ── TASK-057-B3: My Pick scheduling explanation notes ── */}
      {tripNotes.length > 0 && (
        <div className="mb-4 px-5 py-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-1">
          {tripNotes.map(note => (
            <p key={note} className="text-sm text-blue-700 font-medium flex items-start gap-2">
              <span className="shrink-0">💡</span>{note}
            </p>
          ))}
        </div>
      )}

      {/* ── 헤더 카드 ── */}
      <div className="bg-white rounded-3xl p-8 border border-[#E6DFD5] shadow-sm mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black bg-[#EAE3D2] text-[#8C6239] px-3 py-1 rounded-md uppercase tracking-wider">
              {travelStyle} Trip
            </span>
            {plannerMeta && (
              <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-md flex items-center gap-1">
                🔗 Synced with My Planner · {plannerMeta.numDays}d
              </span>
            )}
            {/* 동기화 상태 표시기 */}
            {syncStatus === "saving" && (
              <span className="text-xs font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 px-3 py-1 rounded-full animate-pulse">
                ⟳ Syncing…
              </span>
            )}
            {syncStatus === "saved" && (
              <span className={`text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full transition-opacity duration-500 ${syncFading ? "opacity-0" : "opacity-100"}`}>
                ☁️ Saved to cloud
              </span>
            )}
            {syncStatus === "error" && (
              <span className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                ⚠️ Sync failed
              </span>
            )}
          </div>
          {/* Bug ③: 커스텀 제목 편집 */}
          {prefTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
              {prefTags.map(tag => (
                <span
                  key={tag}
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#EAE3D2] text-[#8C6239] capitalize"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {editingTitle ? (
            <div className="flex items-center gap-2 mt-3">
              <input
                autoFocus
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                onBlur={handleTitleSave}
                className="text-2xl sm:text-3xl font-black text-[#2C2520] bg-[#FAF7F2] border-2 border-[#D4AF37] rounded-xl px-3 py-1 focus:outline-none w-full"
                placeholder={`My ${city} Trip`}
                maxLength={60}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3 group">
              <h1 className="text-3xl sm:text-4xl font-black text-[#2C2520]">
                {tripTitle || `My ${city} Trip`}
              </h1>
              {(!shareId || isOwner) && itinId && (
                <button
                  onClick={() => { setTitleInput(tripTitle || `My ${city} Trip`); setEditingTitle(true); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8C6239] hover:text-[#D4AF37] text-xl cursor-pointer shrink-0"
                  title="제목 편집"
                >✏️</button>
              )}
            </div>
          )}
          <p className="text-[#61554D] mt-2 text-base font-bold">
            📅 {startDate} to {endDate} ({travelers} {parseInt(travelers) > 1 ? "Travelers" : "Traveler"})
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full sm:w-auto">
          {/* 공유 링크 복사 버튼 */}
          <button
            onClick={handleCopyShareLink}
            disabled={!itinId}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all disabled:opacity-40 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            {copied ? "✅ Copied!" : "🔗 Copy Share Link"}
          </button>

          {/* 이메일 저장 버튼 */}
          {emailSaved ? (
            <button
              onClick={() => setEmailModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: "#22c55e" }}
            >
              ✅ Trip Saved to Email
            </button>
          ) : (
            <button
              onClick={() => setEmailModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: "#f97316" }}
            >
              📧 Save to Email
            </button>
          )}

          {/* TASK-022: 기억 기록 버튼 */}
          <button
            onClick={() => setCaptureOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
            style={{ backgroundColor: "#1a1a2e" }}
          >
            📸 Capture Moment {moments.length > 0 && <span className="bg-[#D4AF37] text-[#1a1a2e] text-xs font-black px-1.5 py-0.5 rounded-full">{moments.length}</span>}
          </button>

          {/* TASK-022: 공유 카드 버튼 */}
          {moments.length > 0 && (
            <button
              onClick={() => setStoryExportOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black rounded-xl transition-all active:scale-95 border-2"
              style={{ borderColor: "#D4AF37", color: "#D4AF37", backgroundColor: "transparent" }}
            >
              🎴 Create Story Card
            </button>
          )}

          <Link href="/" className="inline-flex items-center justify-center px-6 py-3 text-sm font-extrabold bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] rounded-xl transition-all shadow-sm">
            ← Back to Home
          </Link>

          {/* Compact 편집 캔버스 진입 — 비공유 or 본인 일정 */}
          {(!shareId || isOwner) && (
            <button
              onClick={() => { setViewMode("compact"); setEditDay(0); }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: viewMode === "compact" ? "#16a34a" : "#f97316" }}
            >
              {viewMode === "compact" ? "✅ Editing" : "✏️ Edit Trip"}
            </button>
          )}

          {/* Compact / Full View 토글 */}
          <div className="flex gap-1.5 p-1 border border-[#E6DFD5] rounded-xl bg-[#FAF7F2]">
            {(["full", "compact"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  viewMode === mode
                    ? "bg-[#2C2520] text-[#FAF7F2] shadow-sm"
                    : "text-[#8C6239] hover:text-[#2C2520]"
                }`}
              >
                {mode === "compact" ? "⊟ Compact" : "⊞ Full View"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-[#8C6239] font-bold mb-4 bg-[#EAE3D2]/40 rounded-xl py-2.5">
        💡 Tap any card for details, maps &amp; booking links · To edit your schedule, use ✏️ Edit Trip above
      </p>

      {/* ── 공항 저녁 도착 전용 배관 배너 ── */}
      {!shareId && paramStartLoc.toLowerCase().includes("gimhae") && parseInt(paramArrivalTime || "0") >= 17 && (
        <div className="mb-6 rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
          <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-3">✈️ Gimhae Airport Evening Arrival — Essential Setup</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={process.env.NEXT_PUBLIC_KLOOK_TRANSFER_URL || "https://affiliate.klook.com/redirect?aid=41763&aff_adid=944297&k_site=https%3A%2F%2Fwww.klook.com%2Factivity%2F21049-busan-gimhae-airport-private-transfer%2F"}
              target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-amber-200 hover:border-amber-400 transition-colors shadow-sm"
            >
              <span className="text-2xl">🚐</span>
              <div>
                <p className="text-xs font-black text-gray-900">Airport Limousine</p>
                <p className="text-[10px] text-gray-500">Gimhae → Nampo-dong · ₩8,000</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_KLOOK_ESIM_URL || "https://affiliate.klook.com/sl/KiT3U74"}
              target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-orange-200 hover:border-orange-400 transition-colors shadow-sm"
            >
              <span className="text-2xl">📱</span>
              <div>
                <p className="text-xs font-black text-gray-900">Korea eSIM</p>
                <p className="text-[10px] text-gray-500">Activate before landing · 5G</p>
              </div>
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_BOOKING_BUSAN_URL || "https://www.booking.com/searchresults.html?ss=Nampo-dong+Busan+Korea"}&checkin=${startDate}&checkout=${endDate}`}
              target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-blue-200 hover:border-blue-400 transition-colors shadow-sm"
            >
              <span className="text-2xl">🏨</span>
              <div>
                <p className="text-xs font-black text-gray-900">Hotel near Nampo-dong</p>
                <p className="text-[10px] text-gray-500">Best access from airport</p>
              </div>
            </a>
          </div>
        </div>
      )}


      {/* ── Compact / 인라인 편집 캔버스 ── */}
      {viewMode === "compact" ? (
        <div className="mb-16">
          {/* 안내 배너 */}
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#1a1f36] text-white">
            <span className="text-base shrink-0">✏️</span>
            <p className="text-xs font-bold flex-1">
              Edit canvas — remove or reorder places. Changes are saved automatically.
            </p>
            <button
              onClick={() => setViewMode("full")}
              className="shrink-0 text-xs font-black text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              ⊞ Full View
            </button>
          </div>

          {/* 주황 Spot 탐색 버튼 — /all-spots 검색 페이지로 이동 */}
          {(!shareId || isOwner) && (
            <Link
              href="/all-spots"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black text-white mb-4 transition-opacity hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#f97316" }}
            >
              🔍 Search Spots
            </Link>
          )}

          {/* Day 탭 */}
          <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1">
            {days.map((day, i) => (
              <button
                key={i}
                onClick={() => setEditDay(i)}
                className={`shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  editDay === i
                    ? "bg-[#1a1f36] text-white shadow-md"
                    : "bg-white text-[#8C6239] border border-[#E6DFD5] hover:border-[#D4AF37]"
                }`}
              >
                <span>Day {day.dayNumber}</span>
                {day.date && (
                  <span className={`text-[10px] font-normal mt-0.5 ${editDay === i ? "text-white/60" : "text-gray-400"}`}>
                    {day.date}
                  </span>
                )}
                <span
                  className="mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-black"
                  style={editDay === i
                    ? { backgroundColor: "#f97316", color: "#fff" }
                    : { backgroundColor: "#f3f4f6", color: "#374151" }}
                >
                  {day.places.length}
                </span>
              </button>
            ))}
          </div>

          {/* 현재 Day 편집 리스트 — 시간순 플랫 리스트 (슬롯 그루핑 제거로 누락 방지) */}
          {days[editDay] && (
            <div className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden shadow-sm">
              <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "#1a1f36" }}>
                <span className="text-sm font-black text-white">
                  Day {days[editDay].dayNumber} — {days[editDay].date}
                </span>
                <span className="text-xs text-white/50">{days[editDay].places.length} places</span>
              </div>

              {/* 시간순 정렬 플랫 리스트 */}
              {days[editDay].places.map((p, pi) => (
                <div
                  key={pi}
                  className="flex items-center gap-3 px-4 py-3 border-b border-[#E6DFD5]/40 last:border-0 hover:bg-[#FAF7F2]/60 group transition-colors"
                >
                  <span className="text-xs font-bold text-[#8C6239] w-12 shrink-0 tabular-nums">{p.time}</span>
                  <span
                    className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0 hidden sm:inline"
                    style={{ backgroundColor: getCategoryColor(p.category) }}
                  >
                    {p.category.slice(0, 5)}
                  </span>
                  <span className="flex-1 text-sm font-bold text-[#2C2520] truncate">{p.name}</span>
                  {(!shareId || isOwner) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => movePlace(editDay, pi, "up")}
                        disabled={pi === 0}
                        className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-25 text-xs font-black flex items-center justify-center cursor-pointer transition-colors"
                        title="Move up"
                      >↑</button>
                      <button
                        onClick={() => movePlace(editDay, pi, "down")}
                        disabled={pi === days[editDay].places.length - 1}
                        className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-25 text-xs font-black flex items-center justify-center cursor-pointer transition-colors"
                        title="Move down"
                      >↓</button>
                      <button
                        onClick={() => deletePlace(editDay, pi)}
                        className="w-7 h-7 rounded-full bg-red-500 text-white hover:bg-red-600 text-xs font-black flex items-center justify-center cursor-pointer transition-colors"
                        title="Remove"
                      >×</button>
                    </div>
                  )}
                </div>
              ))}

              {days[editDay].places.length === 0 && (
                <div className="py-10 text-center text-sm text-[#8C6239]/40 italic">
                  No places for this day
                </div>
              )}
            </div>
          )}

          {/* 보관함 (Unscheduled) — 명시적으로 저장한 스폿 목록 */}
          {(() => {
            const unscheduled = cartItems;
            if (unscheduled.length === 0 || (shareId && !isOwner)) return null;
            return (
              <div className="mt-5">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-black text-[#8C6239]">❤️ My Picks (Unscheduled)</span>
                  <span className="text-[10px] font-bold bg-[#EAE3D2]/60 text-[#8C6239] px-2 py-0.5 rounded-full">
                    {unscheduled.length}
                  </span>
                  <span className="text-[10px] text-[#8C6239]/50 ml-auto">Use + to add to this day</span>
                </div>
                <div className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden shadow-sm">
                  {unscheduled.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-[#E6DFD5]/40 last:border-0 hover:bg-[#FAF7F2]/60 transition-colors"
                    >
                      <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0 hidden sm:inline"
                        style={{ backgroundColor: getCategoryColor(item.type) }}
                      >
                        {item.type.slice(0, 5)}
                      </span>
                      <span className="flex-1 text-sm font-bold text-[#2C2520] truncate">
                        {item.shortName || item.name}
                      </span>
                      <span className="text-[10px] text-[#8C6239]/50 shrink-0 hidden sm:inline">
                        {item.recommendedDurationMinutes}m
                      </span>
                      <button
                        onClick={() => addCartItemToDay(item)}
                        className="shrink-0 w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center hover:opacity-80 cursor-pointer transition-opacity"
                        style={{ backgroundColor: "#f97316" }}
                        title={`Add to Day ${editDay + 1}`}
                      >+</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <p className="text-center text-xs text-[#8C6239]/50 mt-4">
            ☁️ Changes are saved automatically · Use Full View above to return
          </p>
        </div>
      ) : (
        /* ── Full View ── */
        <div className="space-y-12 mb-16">
          {days.map((day) => {
            // Layer 3: 공항 저녁 도착 + Day 1 → 도착 시간 이전 장소 렌더링 완전 제거
            const visiblePlaces =
              isAirportEvening && day.dayNumber === 1
                ? day.places.filter(p => {
                    const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
                    return h >= arrivalHour;
                  })
                : day.places;

            const slotAssigned = visiblePlaces.map((p, i) => ({
              place: p,
              idx: i,
              slot: p.slot ?? assignSlot(p.time),
            }));

            return (
              <div key={day.dayNumber} className="relative pl-6 sm:pl-8 border-l-2 border-[#D4AF37]/30">
                <div className="absolute -left-[11px] top-1.5 bg-[#FAF7F2] border-4 border-[#D4AF37] w-5 h-5 rounded-full z-10" />
                <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] mb-5 flex items-center gap-3 flex-wrap">
                  <span>Day {day.dayNumber}</span>
                  <span className="text-lg font-bold text-[#8C6239] bg-[#EAE3D2]/40 px-3 py-0.5 rounded-full">{day.date}</span>
                  <span className="text-sm font-semibold text-[#8C6239]">({day.places.length} places)</span>
                </h2>

                {conflictDays.has(day.dayNumber) && (
                  <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
                    <span className="text-lg shrink-0">⚠️</span>
                    <p className="text-sm font-bold text-amber-700">
                      Day {day.dayNumber}: Could not generate schedule — scheduling conflict detected. Try adjusting your travel dates or removing saved places.
                    </p>
                  </div>
                )}
                <div className="space-y-4" id={`day-${day.dayNumber}`}>
                  {TIME_SLOTS.map((ts) => {
                    const slotItems = slotAssigned.filter((x) => x.slot === ts.key);
                    if (slotItems.length === 0) return null;

                    return (
                      <div key={ts.key} className="rounded-2xl border border-[#E6DFD5] overflow-hidden bg-white">
                        <div className="px-5 py-3 bg-[#EAE3D2]/25 border-b border-[#E6DFD5] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{ts.emoji}</span>
                            <span className="text-sm font-black text-[#8C6239]">{ts.label}</span>
                            <span className="text-xs text-[#8C6239]/50 font-medium hidden sm:inline">{ts.range}</span>
                          </div>
                          <span className="text-xs text-[#8C6239]/60 font-semibold">
                            {slotItems.length} place{slotItems.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        <div className="divide-y divide-[#E6DFD5]/50">
                            {slotItems.map(({ place, idx }) => {
                              const naverUrl = buildNaverUrl(place.name, city);
                              const googleUrl =
                                place.googleMapsUrl ||
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;
                              const naverIsGoogle = naverUrl.includes("google.com");

                              return (
                                <div
                                  key={idx}
                                  className="flex flex-col hover:bg-[#FAF7F2]/40 transition-colors group relative"
                                >
                                  {/* 장소 정보 + 지도 버튼 행 */}
                                  <div className="flex flex-col sm:flex-row justify-between gap-4 p-5">
                                    <div
                                      className="space-y-2 flex-1 cursor-pointer min-w-0"
                                      onClick={() => setSelectedPlace(place)}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className="text-xs font-black uppercase px-2.5 py-0.5 rounded-md text-white"
                                          style={{ backgroundColor: getCategoryColor(place.category) }}
                                        >{place.category}</span>
                                        <span className="text-xs font-bold text-[#61554D]">🕒 {place.time} ({place.duration})</span>
                                        <span className="text-xs font-bold text-[#61554D]">📍 {place.location}</span>
                                      </div>
                                      <div className="flex items-start gap-3">
                                        {place.cartSnapshot?.image && (
                                          <img
                                            src={place.cartSnapshot.image}
                                            alt={place.name}
                                            className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#E6DFD5]"
                                          />
                                        )}
                                        <div className="min-w-0">
                                          <h3 className="text-lg sm:text-xl font-black text-[#2C2520] group-hover:text-[#8C6239] transition-colors">
                                            {place.name}
                                          </h3>
                                          <div className="bg-[#FAF7F2]/60 border border-[#E6DFD5]/60 rounded-xl p-3 mt-1">
                                            <p className="text-xs text-[#61554D] leading-relaxed line-clamp-2">
                                              {place.cartSnapshot?.whyItMatters ?? place.cartSnapshot?.description ?? place.tips}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                      <p className="text-xs text-[#D4AF37] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                        Click for full details + maps →
                                      </p>
                                    </div>
                                    <div className="flex sm:flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <a
                                        href={googleUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-extrabold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400 rounded-xl transition-all shadow-sm sm:w-32"
                                      >🗺️ Google Maps</a>
                                      <a
                                        href={naverUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-extrabold rounded-xl transition-all shadow-sm sm:w-32 ${
                                          naverIsGoogle
                                            ? "bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 hover:border-blue-300"
                                            : "bg-white hover:bg-green-50 text-green-700 border border-green-200 hover:border-green-400"
                                        }`}
                                      >
                                        {naverIsGoogle ? "🗺️ More Search" : "💚 Naver Maps"}
                                      </a>
                                    </div>
                                  </div>
                                  {/* ── 수익화 제휴 버튼 스트립 (환경변수 기반) ── */}
                                  <div
                                    className="flex gap-2 overflow-x-auto px-5 pb-4 pt-0 border-t border-[#E6DFD5]/40"
                                    style={{ scrollbarWidth: "none" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <a
                                      href={process.env.NEXT_PUBLIC_KLOOK_ESIM_URL || "https://affiliate.klook.com/sl/KiT3U74"}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#f97316" }}
                                    >
                                      📱 Get Korea eSIM
                                    </a>
                                    <a
                                      href={`${process.env.NEXT_PUBLIC_BOOKING_BUSAN_URL || "https://www.booking.com/searchresults.html?ss=Busan+Korea"}&checkin=${startDate}&checkout=${endDate}`}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#003580" }}
                                    >
                                      🏨 Book Hotels
                                    </a>
                                    <a
                                      href={process.env.NEXT_PUBLIC_VIATOR_BUSAN_URL || "https://www.viator.com/en-KR/Korea/d4431-ttd/"}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#7c3aed" }}
                                    >
                                      🎟️ Book Activities
                                    </a>
                                    <a
                                      href="/all-spots?filter=michelin"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition-opacity hover:opacity-90 border mt-3"
                                      style={{ backgroundColor: "#fef9c3", color: "#854d0e", borderColor: "#fde047" }}
                                    >
                                      ⭐ Michelin Spots
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                      </div>
                    );
                  })}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TASK-021: Korea Ready Partner Deals (Supabase affiliate_links) ── */}
      {Object.keys(affiliateMap).length > 0 && (
        <div className="mb-12">
          <p className="text-xs font-black uppercase tracking-widest text-[#8C6239] mb-4">
            Korea Ready Partner Deals
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(affiliateMap).map(([id, deal]) => (
              <a
                key={id}
                href={deal.destination_url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-[#E6DFD5] shadow-sm hover:border-[#D4AF37] transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-[#EAE3D2] flex items-center justify-center text-xl shrink-0">
                  🇰🇷
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-[#8C6239] mb-0.5">
                    {deal.provider}
                  </p>
                  <p className="text-sm font-black text-[#2C2520] leading-tight">{deal.title}</p>
                  <p className="text-xs text-[#61554D] leading-relaxed mt-1 line-clamp-2">{deal.description}</p>
                </div>
                <span className="text-[#D4AF37] text-sm shrink-0 mt-0.5">→</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── TASK-022: Trip Journal — 나만의 여행 기억 타임라인 ── */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-black text-[#2C2520]">📸 My Travel Memories</h2>
            <p className="text-sm text-[#8C6239] mt-0.5">Hidden finds, people you met, scenery… the real story of this trip</p>
          </div>
          <button
            onClick={() => setCaptureOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-95"
            style={{ backgroundColor: "#1a1a2e" }}
          >
            + Log
          </button>
        </div>
        <TripMomentTimeline
          moments={moments}
          onDelete={handleMomentDelete}
          onAddMemory={() => setCaptureOpen(true)}
        />
      </div>

      <AdBanner />

      {/* eSIM 배너 */}
      <div className="bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C29D26] rounded-3xl p-8 sm:p-10 shadow-xl border border-[#E6DFD5] text-[#2C2520] mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-2xl sm:text-3xl font-black">📱 Don&apos;t forget your eSIM!</h3>
          <p className="text-base sm:text-lg font-bold text-[#4E3F35]">Stay connected throughout your Korea trip with 10% off.</p>
        </div>
        <a href="https://affiliate.klook.com/sl/KiT3U74" target="_blank" rel="noopener noreferrer sponsored"
          className="inline-flex items-center justify-center px-6 py-4 text-base font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-all shadow-md">
          Get eSIM Now
        </a>
      </div>

      {selectedPlace && (
        <PlaceModal place={selectedPlace} city={city} citySpots={citySpots} onClose={() => setSelectedPlace(null)} />
      )}

      {/* TASK-022: 순간 캡처 모달 */}
      {captureOpen && itinId && (
        <TripMomentCapture
          itineraryId={itinId}
          deviceId={getDeviceId()}
          dayNumber={days.length > 0 ? 1 : null}
          onSave={handleMomentSave}
          onClose={() => setCaptureOpen(false)}
        />
      )}

      {/* TASK-022: 9:16 공유 카드 모달 */}
      {storyExportOpen && (
        <TripStoryExport
          city={city}
          startDate={startDate}
          endDate={endDate}
          dayCount={days.length}
          placeCount={days.reduce((s, d) => s + d.places.length, 0)}
          moments={moments}
          travelStyle={travelStyle}
          onClose={() => setStoryExportOpen(false)}
        />
      )}

      <EmailCaptureModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        context="save-trip"
        onSuccess={() => setEmailSaved(true)}
      />
    </main>
  );
}

// ══════════════════════════════════════════════════════════════
//  페이지 레이아웃 (Suspense wrapper)
// ══════════════════════════════════════════════════════════════
export default function ItineraryPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
            <span className="text-[#D4AF37] text-3xl">🇰🇷</span>
            go<span className="font-extrabold">korea</span>mate
          </Link>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8" />
            <h2 className="text-3xl font-black text-[#2C2520] mb-3">Loading itinerary…</h2>
          </div>
        }
      >
        <ItineraryResult />
      </Suspense>

      <footer className="mt-auto border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">Data provided by Korea Tourism Organization. AI-powered by Gemini.</p>
        </div>
      </footer>
    </div>
  );
}
