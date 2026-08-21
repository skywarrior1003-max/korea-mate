"use client";

import { useSearchParams, useRouter } from "next/navigation";
// TASK-STORY-LIVE-BASELINE-V1 — 같은 여행의 Story view (승인된 Story 화면 재사용)
import StoryJournal from "@/components/story/StoryJournal";
import StoryMemoryFocus from "@/components/story/StoryMemoryFocus";
import { buildFocusSequence, findSlideIndex } from "@/lib/share/story-focus-core";
import type { StoryMemory } from "@/components/story/story-types";
import { PAGE_BG as STORY_PAGE_BG } from "@/components/story/story-tokens";
import { buildPrivateStoryDays, isPastTrip as isPastTripByDate } from "@/lib/share/private-story-adapter";
import { stopCitySpotId, stopKeyOf } from "@/lib/trip-moments/stop-binding";
import { staySourceKey } from "@/lib/place-identity";
import {
  withResolvedPhotos, needsPhotoResolution, isResolvedFresh, fetchMomentPhotoUrls,
  type ResolvedPhotoMap,
} from "@/lib/trip-moments/photo-resolve";
import { TRIP_FLOW_COMMERCE_ENABLED, POST_PLAN_COMMERCE_ENABLED } from "@/config/commerce-surfaces";
import { resolveOffer } from "@/lib/affiliate-resolve";
import { useTranslations, useLocale } from "next-intl";
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import AdBanner from "@/components/AdBanner";
import { PLANNER_EVENT } from "@/lib/plannerStore";
import { apiSaveItinerary, apiFetchItinerary, apiUpdateItineraryTitle, apiSetPublic, apiHelpfulStatus, apiHelpfulVote } from "@/lib/itinerary-api";
import { getDeviceId } from "@/lib/deviceId";
import { CONSENT_VERSION } from "@/lib/trip-cover/cover-state-core";
import CoverConsentDialog from "@/components/CoverConsentDialog";
import { getCityCart, removeFromCart, clearCityCart, CART_EVENT, type CartItem } from "@/lib/cart";
import TripMomentCapture from "@/components/TripMomentCapture";
import TripMomentTimeline from "@/components/TripMomentTimeline";
import TripStoryExport from "@/components/TripStoryExport";
import { loadMoments, loadMomentsFromServer, addMomentDetailed, resyncPendingMoments, deleteMoment, updateMomentMemo, setMomentPublic } from "@/lib/trip-moments";
import { runFirstPublish } from "@/lib/trip-moments/publish-reconcile-core";
import type { MemoryPublicState, PublishOutcome } from "@/lib/trip-moments/publish-reconcile-core";
import { MEMORY_PUBLIC_CONSENT_VERSION } from "@/lib/trip-moments/public-consent-core";
import { toStoryCardMoments, publicStoryUrl, type ApiStory } from "@/lib/share/story-adapter";
import type { StoryCardMoment } from "@/components/TripStoryExport";
import type { TripMoment } from "@/lib/trip-moments";
import { fetchCitySpots, matchCitySpot } from "@/lib/city-spots";
// 공개 문구 판정은 Place Detail 과 같은 SSOT 를 쓴다. 내부 메모 정규식을 이
// 파일에 복제하지 않는다 — 규칙이 두 곳에 있으면 한쪽만 갱신되어 뚫린다.
//
// 어떤 문구를 먼저 보여줄지는 각 호출부가 인자 순서로 정한다. 이번 방어는
// 내부 메모를 막는 것이지 기존 사용자 문구의 우선순위를 바꾸는 작업이 아니다.
import { firstPublicText } from "@/lib/place-detail/place-detail-core";
// planner 로 보내는 키는 반드시 이 helper 하나만 쓴다 — cart_hints·조회 맵이
// 서로 다른 규칙을 쓰면 같은 장소가 다시 어긋난다.
import { getPlannerHintKey, getItemSourceKey, userSpotSourceKey, citySpotSourceKey, isUserSpotSource } from "@/lib/place-identity";
import { planDayAnchors, mergeDayHints } from "@/lib/trip-fixed/anchor-build";
import { buildDepartureDestination, isDepartureDestination } from "@/lib/trip-fixed/departure-destination";
import {
  ACCOMMODATION_CHECKIN_EVENT_ID, CHECKIN_DURATION_MINUTES,
  checkinFixedEvent, exactStayCoordinate, exactStayName,
  isAccommodationCheckin, planCheckin,
  type PlacedStop,
} from "@/lib/trip-stay/checkin-core";
import { readTripDraft } from "@/lib/trip-draft/trip-draft-core";
import { normalizeTripPace, toSchedulerPace, type TripPaceChoice } from "@/lib/trip-pace/pace-core";
import { googlePlaceSearchUrl, naverPlaceSearchUrl } from "@/lib/maps/place-navigation";
import { reduciblePicks } from "@/lib/trip-plan/trip-feasibility";
import { buildSingleStay, stayStartFor, type TripStay } from "@/lib/trip-stay/stay-core";
import { assignZoneId } from "@/lib/near-me/zone-classifier";
import type { CitySpot } from "@/data/cities/types";
import { haversineKm, isValidCoordinate } from "@/lib/geo";
import { CITY_DAY1_PROHIBITED, CITY_DAY1_MAX_DISTANCE_KM, CITY_AIRPORT_ARRIVAL_BANNERS } from "@/data/city-presets";
import UserSpotsPanel from "@/components/UserSpotsPanel";
import { userSpotDisplayName } from "@/lib/user-spots-api";
import ItineraryDayMap from "@/components/ItineraryDayMap";
import { visitedStorageKey, visitedPlaceKey } from "@/lib/visited";
import PublishPreviewModal from "@/components/PublishPreviewModal";
import PlannerDayNav from "@/components/planner/PlannerDayNav";
import PlannerCoverHeader from "@/components/planner/PlannerCoverHeader";
import { fetchPersonalizationProfile } from "@/lib/planner/personalize-client";
import TimelineIcon from "@/components/planner/TimelineIcon";
import { clampDay, formatDayChipDate } from "@/lib/planner/day-window-core";
import { buildTimeline } from "@/lib/planner/timeline-core";
import DayCompleteToast from "@/components/DayCompleteToast";
import type { UserSpot } from "@/lib/user-spots-api";
import { resolveSpotImageSrc, hasRealSpotImage, swapToPlaceholderOnError } from "@/lib/place-image";
import { collectLikedSignals } from "@/lib/planner/saved-signals";
import { getSavedSpotsData, getFavorites, getFavoriteSourceKeys, removeFavorite } from "@/lib/favorites";
import { savedSelectionsToRelease } from "@/lib/trip-plan/saved-promotion";

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
  lat?: number;
  lng?: number;
  // PHASE 1 metadata
  source?:   "city_spot" | "user_spot";
  place_id?: string;
  /**
   * 원천 식별자 (src/lib/place-identity.ts). optional 이라 이 필드가 없던
   * 기존 저장 일정도 그대로 열린다. place_id 는 "planner 내부 키"와 "DB 장소 ID"
   * 두 의미를 겸할 수 있어, 어느 소스인지는 이 값이 설명한다.
   */
  sourceKey?: string;
  title?:    string;
  address?:  string;
  note?:     string;
  /**
   * 장소 대표 이미지 (city_spots.image_url). optional 이라 이 필드가 없던
   * 기존 저장 일정도 그대로 열린다. 사용자 Memory 사진과는 무관한 관광
   * 장소 공개 이미지다. 렌더는 후속 TASK — 여기서는 데이터만 보존한다.
   */
  image?:    string;
  /**
   * 이 항목이 숙소인가.
   *
   * optional 이라 이 필드가 없던 기존 저장 일정도 그대로 열린다. 숙소라는
   * 사실 자체는 감출 것이 아니다 — 감추는 것은 몇 시에 들어갔는가다.
   */
  isAccommodation?: true;
}

interface Day {
  date: string;
  dayNumber: number;
  places: Place[];
}

/**
 * 일정 항목을 Place Detail 로 보낼 수 있는가.
 *
 * `/place/[id]` 는 `dynamicParams = false` 로 city_spots id 목록만 정적 생성한다.
 * 그래서 두 조건을 모두 만족할 때만 링크를 만든다 —
 *   ① `source === "city_spot"` : 저장 시점에 실제 city_spots 행과 대조된 항목
 *   ② place_id 가 숫자        : city_spots.id 는 숫자다
 * user_spot · events · planner 내부 키 · mock 은 여기서 걸러진다. 링크를 만들어
 * 두고 404 를 보여주는 것보다 링크가 없는 편이 낫다.
 */
function citySpotHref(place: Place): string | null {
  if (place.source !== "city_spot") return null;
  const id = place.place_id ?? "";
  if (!/^\d+$/.test(id)) return null;
  return `/place/${id}/`;
}

// ── 시간 슬롯 정의 ───────────────────────────────────────────
const TIME_SLOTS = [
  { key: "morning",   label: "Morning",   emoji: "☀️", range: "9AM–12PM" },
  { key: "lunch",     label: "Lunch",     emoji: "🍽️", range: "12–2PM"   },
  { key: "afternoon", label: "Afternoon", emoji: "⛅", range: "2–5PM"    },
  { key: "evening",   label: "Evening",   emoji: "🌙", range: "5–9PM"    },
] as const;


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


// ── 일정 생성 대기 단계 ──────────────────────────────────────
//
// 예전에는 이 자리에 제휴사 카드가 있었다. Michelin·Booking.com·Viator·eSIM·
// 공항 픽업이 단계마다 두 장씩 떴고, 문구에는 "Free cancellation options",
// "Fixed-price pickup", "Unlimited 5G data" 처럼 우리가 확인해 줄 수 없는
// 주장이 들어 있었다. 부산 지명(해운대·감천·김해공항)도 박혀 있어 다른 도시에서는
// 그냥 거짓말이 된다. 기다리는 화면에서 팔 이유도 없다 — 커머스는 일정이 나온
// 뒤 별도 영역에서 다룬다.
//
// 그래서 단계는 "지금 무엇을 하고 있는가"만 말한다. 문구는 4개 언어 locale 에
// 있고 여기에는 키만 둔다.
//
// 길이 3 은 계약이다. 진행바가 (loadPhase+1)/LOAD_PHASES.length 로 폭을 계산하고
// 타이머가 1200ms·2500ms 에 단계를 넘긴다. 개수를 바꾸면 둘 다 어긋난다.
const LOAD_PHASES = ["loadPhase1", "loadPhase2", "loadPhase3"] as const;

// ── TASK-018: Trip Plan API 클라이언트 타입 ──────────────────────────────────────
interface PlaceDisplay {
  name:            string;
  category:        string;
  district:        string;
  tips:            string;
  google_maps_url: string;
  lat?:            number;
  lng?:            number;
  /** city_spots.image_url — 표시용 장소 대표 이미지. 없는 장소가 정상 상태다 */
  image?:          string;
}
type PlaceDisplayMap = Record<string, PlaceDisplay>;

interface ApiScheduledItem {
  item_type:    string;
  place_id?:    string;
  event_id?:    string;
  start_time:   string;
  end_time:     string;
  stay_minutes: number;
  /** 사용자가 정한 약속인가. 엔진이 이미 내려주던 값이라 읽기만 더한다. */
  is_fixed?:    boolean;
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
  jeonju:   { lat: 35.8245, lng: 127.1478 },
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

// ── 여행 속도 ───────────────────────────────────────────────────────────────
//
// 예전에는 동행(Solo·Couple·Family·Group)에서 속도를 유추했다. 커플과 가족이면
// 체류가 1.3 배가 됐는데, 사용자는 그런 것을 고른 적이 없다. 누구와 가는지와
// 얼마나 느긋하게 다닐지는 다른 질문이라 이제 사용자에게 직접 묻는다.
//
// 주소에 `pace` 가 없으면 `balanced` 다 — 예전 주소로 열어도 `normal` 이라
// 지금까지의 일정과 같은 체류시간이 나온다.
function toPace(paceParam: string): "relaxed" | "normal" | "packed" {
  return toSchedulerPace(normalizeTripPace(paceParam));
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

// ── TASK-058 → 출발 목적지 ────────────────────────────────────────────────────
// 이 자리에 있던 buffer 표와 applyDepartureBuffer 는 trip-fixed/departure-destination.ts
// 로 옮겼다. 숫자는 그대로다. 바뀐 것은 책임이다 — "하루를 대충 일찍 끝내는 값"
// 에서 "목적지 도착 마감시각을 구하는 값" 이 됐고, 마지막 장소에서 공항까지의
// 실제 이동시간은 스케줄러의 HC-8 이 따로 잰다.

// ── TASK-018: 신규 일정 생성 오케스트레이터 (레거시 generateWithDwell 대체) ─────────
async function generateWithNewApi(
  city: string,
  sd: string,
  ed: string,
  trav: string,
  tstyle: string,
  arrTime?: string,
  deptTime?: string,
  deptType?: string,
  arrivalCoord?: { lat: number; lng: number },
  departureCoord?: { lat: number; lng: number },
  /** 숙박 지역. 없으면 예전 그대로 전날 마지막 장소에서 이어진다. */
  stays?: TripStay[],
  /**
   * 지도에서 확인된 숙소. 첫날 체크인을 넣는 데만 쓴다.
   *
   * 좌표는 이 함수 안에서 이동 계산에만 쓰이고 결과에 남지 않는다. 이름은
   * 결과에 남는다 — 호텔 이름은 식당 이름과 같은 종류의 공개 가능한 장소
   * 정보이고, 공유받은 사람이 어디에 묵었는지 알 수 있어야 한다.
   */
  exactStay?: { coordinate: { lat: number; lng: number }; name: string | null } | null,
  /** 사용자가 고른 여행 속도. 없으면 balanced 로 읽는다. */
  tripPace?: TripPaceChoice,
): Promise<{ days: Day[]; isFallback: boolean; conflictDayNumbers: number[]; affiliateMap: AffiliateDisplayMap; skippedCartNames: string[]; fixedOutOfWindowNames: string[]; unplacedPicks: { key: string; name: string; hasFixed: boolean }[]; hadDeferredCartHints: boolean; usedCartHintCentroid: boolean; checkinTime: string | null }> {
  const MIN_MS = 2500 + Math.random() * 1000;
  const t0     = Date.now();

  const dates  = buildDateRange(sd, ed);
  // 이번 여행 도시에서 고른 장소만 일정에 넣는다. 다른 도시 선택은 여기까지
  // 오지 않는다 — 거리 필터가 나중에 떨어뜨리기를 기대하지 않는다.
  const cart   = getCityCart(city);
  // TASK-053: cart item lookup map — used for display fallback when place_map misses "local-*" IDs
  // TASK-053 의 "local-*" 매칭을 source-aware 키로 교체한다.
  const cartItemByKey = Object.fromEntries(cart.map(c => [getPlannerHintKey(c), c]));

  // Collect names of cart items without coordinates so we can show a UI warning.
  // 일정에 넣지 못한 This Trip 장소. 조용히 사라지게 두지 않는다.
  //
  // truthy 검사가 아니라 좌표 유효성으로 판정한다 — `!item.lat` 는 위도 0 을
  // 좌표 없음으로 보고, NaN·문자열·범위 밖 값은 그대로 통과시킨다.
  const skippedCartNames = cart
    .filter(item => !isValidCoordinate(item.lat, item.lng))
    .map(item => item.shortName || item.name);

  // 하루 시간 창 밖으로 지정된 고정 일정. 조용히 무시하지 않고 이름을 알린다.
  const fixedOutOfWindowNames: string[] = [];

  // P0-1 Phase 2: Cart 아이템 → 스케줄러 합성 후보 힌트 변환
  const cartHints = cart
    .filter(item => isValidCoordinate(item.lat, item.lng))
    .map(item => ({
      // city_spot 은 바레 숫자로 보낸다 — plan.ts 가 DB 후보와 대조해 중복을
      // 제거하고 place_map 이 표시정보를 채운다(기존 BUG-01 동작 보존).
      // 그 밖의 소스는 sourceKey 원문이라 어떤 DB 후보와도 매칭되지 않는다.
      place_id:            getPlannerHintKey(item),
      source_key:          getItemSourceKey(item),
      lat:                 item.lat!,
      lng:                 item.lng!,
      duration_min:        item.recommendedDurationMinutes,
      preferred_time_slot: toPreferredTimeSlot(item.bestTimeSlot),
      name:                item.name,
      // 고정 일정. preferred_time_slot 과 다른 축이다 — 저쪽은 취향, 이쪽은 사실.
      // plan API 로는 보내지 않고 이 루프 안에서 anchors 로만 바뀐다.
      fixed:               item.fixed ?? null,
      // Trip-Flow Commerce (§14-1-A) — plan API 요청 payload 에 상업 문맥을
      // 넣지 않는다. "렌더용" 이라는 이유로도 보내지 않는다.
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

  const paceChoice = normalizeTripPace(tripPace);
  const pace       = toSchedulerPace(paceChoice);
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

  // Saved 는 localStorage 에만 있다. 여기서 한 번 읽어 검증·중복제거·상한을 건다.
  const likedSignals = collectLikedSignals(
    (typeof window === "undefined" ? [] : getSavedSpotsData()) as never[],
    city,
  );

  // 외부 개인화에 보낼 수 있는 것만 추린다.
  //
  // 개인 장소는 이름부터 사적이다 — `display_title` 은 그 사람에게 그곳이
  // 무엇이었는지를 적은 값이다. 좌표를 살리면서 이 장소들이 `cartHints` 에
  // 들어오게 됐는데, 그렇다고 provider 로 나가는 양이 늘어서는 안 된다.
  //
  // 스케줄러는 `cartHints` 를 그대로 쓴다. 이동 계산은 우리 코드 안에서 끝난다.
  // 밖으로 나가는 것만 여기서 줄인다.
  const personalizableHints = cartHints.filter(h => !isUserSpotSource(h.source_key));

  // ── whole-trip 개인화 프로필 — 여행당 정확히 1회 ──
  // 날짜 루프 "밖"이다. 안에서 부르면 14일 여행에 14번 나간다.
  // 실패하면 null 이고, 그러면 아래 루프는 기존과 완전히 같은 규칙 기반으로 돈다.
  const personalizationProfile = await fetchPersonalizationProfile({
    city, locale,
    start_date:   sd,
    end_date:     ed,
    travel_style: tstyle,
    travelers:    trav,
    pace,
    selected_place_ids: personalizableHints.map(h => String(h.place_id)),
    // Saved(하트)는 취향 신호다. cart 로 승격하지 않는다 — 일정에 강제로 넣지 않는다.
    liked_place_ids:    likedSignals.liked_place_ids,
    liked_places:       likedSignals.liked_places,
    selected_places:    personalizableHints.map(h => ({
      place_id: String(h.place_id),
      name:     h.name,
      category: (cartItemByKey[String(h.place_id)]?.type ?? undefined),
    })),
  });


  /**
   * 사용자가 실제로 숙소에 들어가는 시각.
   *
   * 저장되는 일정(`days`)에 넣지 않는다. 그 JSON 은 공유 링크로 그대로
   * 나가고, 어디서 자는지에 더해 몇 시에 거기 있는지까지 알려 주는 것은
   * 장소 이름을 알려 주는 것과 다른 이야기다. 이름은 남기고 시각은 내
   * 기기에만 둔다.
   */
  let checkinTime: string | null = null;

  for (let i = 0; i < dates.length; i++) {
    const trip_date  = dates[i]!;
    const start_time = i === 0 ? (arrTime ?? "09:00") : "09:00";
    const isLastDay = i === dates.length - 1;

    // TASK-056-B: Always use currentCoordinate (previous day's last position) as NearMe base.
    // TASK-057-B2: dayStartCoordinate is the immutable scheduler base for this day.
    //
    // 예전에는 마지막 날 출발지를 이 기준점으로 썼다가 Day 1 과 좌표가 겹쳐 후보가
    // 고갈됐고, 그래서 출발 좌표를 통째로 버렸다. 진단이 반쪽이었다 — 문제는 좌표가
    // 아니라 **출발지를 검색 원점으로 쓴 것** 이었다.
    //
    // 공항은 닿아야 하는 곳이지 그 주변을 뒤져야 하는 곳이 아니다. 그래서 기준점은
    // 그대로 두고, 출발 좌표는 아래에서 목적지로만 실어 보낸다.
    // 전날 밤을 덮는 숙박이 있으면 거기서 아침을 시작한다. 어제 저녁을 남포에서
    // 먹었어도 해운대에서 잤으면 오늘은 해운대에서 출발한다.
    // 숙박을 고르지 않았으면 stayStartFor 가 null 이고 예전 흐름 그대로다.
    const dayStartCoordinate = stayStartFor(stays, trip_date) ?? currentCoordinate;

    // 마지막 날의 출발 목적지. 좌표나 시각이 없으면 null 이고 예전과 똑같이 돈다.
    const departureDestination = isLastDay
      ? buildDepartureDestination({
          coordinate:    departureCoord,
          departureTime: deptTime,
          transportType: deptType,
          zoneId:        departureCoord
            ? (assignZoneId(haversineKm(
                dayStartCoordinate.lat, dayStartCoordinate.lng,
                departureCoord.lat,     departureCoord.lng,
              ) * 1000) ?? 3)
            : 3,
        })
      : null;

    // 목적지 도착 마감시각이 곧 그날 자동 추천 창의 끝이다. buffer 는 이 한 번만
    // 쓴다 — day end 에서 또 빼면 이동시간을 두 번 확보하는 셈이 된다.
    const effectiveDeptTime = departureDestination?.requiredDestinationArrival;
    const end_time = isLastDay ? (effectiveDeptTime ?? "21:00") : "21:00";

    // TASK-057-B1: Evict already-placed My Picks from the remaining pool, then
    // build today's cart_hints from hints within today's distance threshold.
    // Hints that are too far are NOT removed — they stay for next-day re-evaluation.
    {
      const placedSet = new Set(usedPlaceIds.map(String));
      remainingCartHints = remainingCartHints.filter(h => !placedSet.has(String(h.place_id)));
    }
    const maxKm = i === 0 ? DAY1_CART_HINT_MAX_KM : DEFAULT_CART_HINT_MAX_KM;
    const nearEnough = remainingCartHints.filter(h =>
      haversineKm(currentCoordinate.lat, currentCoordinate.lng, h.lat, h.lng) <= maxKm
    );

    // 고정 일정 — 오늘 것만 anchor 로 보내고, 다른 날 것은 오늘 후보에서 뺀다.
    // 거리 필터는 "오늘 가기엔 먼 픽" 을 다음 날로 미루는 장치지만 오늘로 고정된
    // 약속은 미룰 수 있는 것이 아니므로 거리와 무관하게 남긴다. 좌표가 빠지면
    // 엔진이 그 장소의 위치를 몰라 앞뒤 시간을 통째로 비운다.
    //
    // 여기서 넘기는 것은 자동 추천 창(09:00~21:00)이 아니라 **진짜 못 넘는 선**이다.
    // 첫날의 도착 시각과 마지막 날의 출발 시각만 실제 경계이고, 중간 날들의
    // 09:00·21:00 은 "이 시간대에 알아서 채워 준다" 는 기본값일 뿐이다.
    // 기본값으로 사용자가 정한 19시 공연을 막으면 안 된다.
    const hardStart = i === 0                 ? (arrTime          ?? null) : null;
    const hardEnd   = i === dates.length - 1  ? (effectiveDeptTime ?? null) : null;
    const anchorPlan     = planDayAnchors(remainingCartHints, trip_date, hardStart, hardEnd);
    const todayCartHints = mergeDayHints(nearEnough, anchorPlan);
    const todayAnchors   = anchorPlan.anchors;
    for (const h of anchorPlan.outOfBoundary) {
      fixedOutOfWindowNames.push(h.name ?? "");
    }

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

    // 두 번 부를 수 있으므로 요청 본문을 한 번만 만든다. 두 호출이 조금이라도
    // 달라지면 비교가 의미를 잃는다 — 달라지는 것은 fixed_events 하나뿐이다.
    const basePlanBody = {
      coordinate:       nearMeSearchCoordinate,
      start_coordinate: { lat: dayStartCoordinate.lat, lng: dayStartCoordinate.lng },
      timestamp,
      trip_date,
      start_time,
      end_time,
      pace,
      event_coords:       evtCoords.length         > 0 ? evtCoords         : undefined,
      cart_coord_hints:   todayCartHints.length    > 0 ? todayCartHints    : undefined,
      anchors:            todayAnchors.length      > 0 ? todayAnchors      : undefined,
      // 출발 목적지. 기존 fixed_events 채널 그대로다 — 엔진이 이미 P2 에서
      // 놓고, HC-8 이 "마지막 장소 → 여기" 이동시간을 잰다.
      fixed_events:       departureDestination ? [departureDestination.event] : undefined,
      exclude_place_ids:  usedPlaceIds.length      > 0 ? usedPlaceIds      : undefined,
      city,
      locale,
      // Saved 취향 — 스코어러의 liked 카테고리 신호로만 쓰인다(강제 배치 아님)
      liked_place_ids: likedSignals.liked_place_ids.length > 0
        ? likedSignals.liked_place_ids : undefined,
      // 같은 프로필을 모든 날짜에 그대로 넘긴다. 여기서 AI 를 부르지 않는다.
      personalization_profile: personalizationProfile ?? undefined,
      // 후보 선택에만 쓰는 값. 체류시간은 위 `pace` 가 정한다 —
      // 두 값을 한 필드로 합치면 active 가 체류 축소로 새는 길이 생긴다.
      trip_pace: paceChoice,
    };

    try {
      const res = await fetch("/api/trip/plan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(basePlanBody),
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

      let dayResult = await res.json() as ApiTripPlanResult;

      // ── 체크인 2 차 계산 ────────────────────────────────────────────────
      //
      // 첫날에만, 그리고 지도에서 확인된 숙소가 있을 때만 한다. 마지막 날은
      // 출발지가 최종 목적지이고, 짐을 들고 떠나는 날에 체크인을 또 넣으면
      // 이중 제약이 된다.
      //
      // 17~18 시를 먼저 박고 일정을 맞추지 않는다. 위에서 만든 하루를 읽어
      // **실제로 숙소에 닿을 수 있는 시각** 을 고르고, 그 자리에 넣어 다시
      // 돌린다. 두 번째 호출이 실패하면 첫 번째 결과를 그대로 쓴다 — 체크인을
      // 넣으려다 하루를 통째로 잃지 않는다.
      if (i === 0 && !isLastDay && exactStay && (dayResult?.data?.kind === "scheduled" || dayResult?.data?.kind === "personalized")) {
        const stops: PlacedStop[] = (dayResult.data.plan?.items ?? [])
          .filter((it: ApiScheduledItem) => it.item_type !== "affiliate")
          .map((it: ApiScheduledItem) => {
            const key = it.place_id ?? it.event_id ?? "";
            const pm  = dayResult.place_map?.[key];
            const cc  = cartCoordByKey[key];
            const lat = cc?.lat ?? pm?.lat, lng = cc?.lng ?? pm?.lng;
            return {
              start_time: it.start_time,
              end_time:   it.end_time,
              coordinate: (lat != null && lng != null) ? { lat, lng } : null,
              is_fixed:   Boolean(it.is_fixed),
            };
          });

        const plan = planCheckin(stops, exactStay.coordinate, end_time, CHECKIN_DURATION_MINUTES);
        if (plan) {
          checkinTime = plan.startTime;
          try {
            const res2 = await fetch("/api/trip/plan", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                ...basePlanBody,
                fixed_events: [
                  ...(departureDestination ? [departureDestination.event] : []),
                  checkinFixedEvent(plan, exactStay.coordinate),
                ],
              }),
            });
            if (res2.ok) {
              const second = await res2.json() as ApiTripPlanResult;
              // 2 차가 오후를 많이 깎으면 1 차를 쓴다.
              //
              // 처음에는 "한 곳도 잃지 않을 때만" 으로 두었다. 실제 운영 데이터에서
              // 그 조건이 거의 지켜지지 않았다 — 숙소에 들르는 데 이동 + 15 분이
              // 걸리니 그 시간만큼 한 곳이 밀려난다. 그래서 체크인이 만들어지고도
              // 매번 되돌려졌고, 사용자는 숙소가 없는 일정을 받았다.
              //
              // 한 곳은 체크인이 실제로 쓰는 시간의 값이다. 두 곳부터는 끼워 넣은
              // 자리가 나쁘다는 뜻이므로 그때는 1 차로 돌아간다.
              const count = (r: ApiTripPlanResult) =>
                (r?.data?.plan?.items ?? []).filter((it: ApiScheduledItem) => it.place_id).length;
              if ((second?.data?.kind === "scheduled" || second?.data?.kind === "personalized") &&
                  count(second) >= count(dayResult) - 1) {
                dayResult = second;
              } else {
                checkinTime = null;
              }
            } else {
              checkinTime = null;
            }
          } catch {
            checkinTime = null;              // 두 번째 호출 실패는 조용히 넘긴다
          }
        }
      }

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
      // 출발 목적지는 스케줄러 제약이지 일정 카드가 아니다. 여기를 빼지 않으면
      // 화면에 이름 없는 관광지처럼 한 줄 생긴다.
      .filter(item => !isDepartureDestination(item))
      .map((item, itemIdx, arr) => {
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
        // TASK-TRIP-PLACE-IDENTITY: city_spots 실장소만 식별정보 보존.
        // 정본 필드는 기존 addCitySpotToDay/addUserSpotToDay와 동일한 place_id + source.
        // mock·synthetic·cart(=events.json id) 에는 ID를 만들지 않는다.
        const isCitySpot =
          item.item_type === "place" &&
          typeof item.place_id === "string" &&
          !item.place_id.startsWith("mock-") &&
          placeMap[item.place_id] !== undefined;
        // ── 숙소 체크인 ──────────────────────────────────────────────
        //
        // 남기는 것: 숙소 이름과 "여기서 묵었다" 는 사실. 호텔 이름은 식당
        //   이름과 같은 종류의 정보이고, 좋은 곳에 묵은 것은 여행에서 보여
        //   주고 싶은 부분이다. 공유받은 사람이 어디였는지 알 수 있어야 한다.
        //
        // 남기지 않는 것: 시각과 좌표와 주소와 링크. 이 객체는 그대로 DB 에
        //   저장되고 공유 링크로 나간다. 어디서 자는지에 더해 몇 시에 거기
        //   있는지까지는 다른 이야기다. 시각은 내 기기에만 둔다.
        if (isAccommodationCheckin(item)) {
          // 순서를 지키려면 시각이 있어야 한다 — `sanitizeDays` 가 이 값으로
          // 정렬하고 Day 1 필터를 건다. 그래서 **바로 앞 항목의 시각** 을 그대로
          // 쓴다. 이미 저장돼 공개되는 값이라 새로 알려 주는 것이 없고, 정렬은
          // 안정 정렬이라 그 항목 바로 뒤에 남는다.
          const prevTime = arr[itemIdx - 1]?.start_time ?? item.start_time;
          return {
            name:          exactStay?.name?.trim() || "",
            category:      "accommodation",
            location:      city,
            time:          prevTime,
            duration:      `${item.stay_minutes}m`,
            tips:          "",
            googleMapsUrl: "",
            slot:          assignSlot(prevTime),
            isAccommodation: true as const,
            // 이 숙소 stop 의 안정 열쇠. 사용자가 여기서 남긴 순간이 reload·순서 변경
            // 뒤에도 같은 숙소 항목을 개인화하게 한다. 이름·좌표로 만들지 않는다.
            sourceKey:     staySourceKey(crypto.randomUUID()),
          };
        }
        return {
          name:              display.name,
          category:          display.category,
          location:          display.district,
          time:              item.start_time,
          duration:          `${item.stay_minutes}m`,
          tips:              display.tips,
          googleMapsUrl:     display.google_maps_url,
          slot:              assignSlot(item.start_time),
          // affiliateUrl 을 cartHint 로부터 복원하지 않는다 (§14-1-A)
          affiliateProvider: cartHint?.affiliate_provider,
          bookingUrl:        cartHint?.booking_url,
          lat:               display.lat ?? cartFull?.lat,
          lng:               display.lng ?? cartFull?.lng,
          // 장소 대표 이미지 보존 — undefined 는 JSON 직렬화에서 사라지므로 저장 payload 를 더럽히지 않는다
          image:             display.image,
          ...(isCitySpot ? { place_id: item.place_id, source: "city_spot" as const } : {}),
          // 원천 정보를 여기서 버리면 저장·재진입·공유·복사에서 복원할 수 없다.
          ...(cartFull?.sourceKey ? { sourceKey: cartFull.sourceKey } : {}),
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

  // 사용자가 직접 This Trip 에 넣은 것 중 끝내 어느 날에도 못 들어간 것.
  //
  // API 를 늘리지 않는다. 배치된 place_id 는 이미 usedPlaceIds 로 모으고 있고,
  // cartHints 는 사용자가 고른 것만 담고 있다. 둘의 차집합이 곧 답이다.
  // 일반 추천 후보는 cartHints 에 없으므로 자연히 빠진다 — 추천이 안 들어간 것은
  // 사용자의 문제가 아니다.
  const placedKeys = new Set(usedPlaceIds.map(String));
  const unplacedPicks = cartHints
    .filter(h => !placedKeys.has(String(h.place_id)))
    .map(h => ({ key: h.source_key, name: h.name, hasFixed: Boolean(h.fixed) }));

  const elapsed = Date.now() - t0;
  const wait    = Math.max(0, MIN_MS - elapsed);
  if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));

  return { days, isFallback, conflictDayNumbers, affiliateMap, skippedCartNames, fixedOutOfWindowNames, unplacedPicks, hadDeferredCartHints, usedCartHintCentroid, checkinTime };
}

function getCategoryColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("restaurant") || c.includes("food")) return "var(--gkm-accent-coral)";
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
  const t          = useTranslations("itin");
  const matched    = matchCitySpot(place.name, citySpots);
  const snap       = place.cartSnapshot;
  const naverUrl   = snap?.naverMapUrl ?? naverPlaceSearchUrl(place.name, city);
  const googleUrl  = place.googleMapsUrl || googlePlaceSearchUrl(place.name, city);
  const imageUrl   = resolveSpotImageSrc(snap?.image);
  const badgeColor = getCategoryColor(place.category);
  const tags       = snap?.tags ?? [];
  // 스냅샷 원문을 직접 읽는 자리다. tips 는 생성 시 이미 걸러졌지만 cartSnapshot
  // 은 Explore 시점 값 그대로이고, 서버가 만든 일정의 tips 는 우리 코드를 거치지
  // 않았을 수 있다. 세 후보를 모두 같은 판정에 통과시킨다.
  const desc       = firstPublicText(snap?.whyItMatters, snap?.description, place.tips);

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
          <img src={imageUrl} alt={place.name} className="w-full h-full object-cover"
               onError={swapToPlaceholderOnError} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors backdrop-blur-sm font-bold text-base cursor-pointer z-10"
          >✕</button>
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wide text-white" style={{ backgroundColor: badgeColor }}>
              {place.category}
            </span>
            {/* 방문 시각을 표시하지 않는다.
                place.time 은 세 경로에서 온다 — 스케줄러가 배정한 start_time,
                보관함 추가 시의 고정 기본값("19:30"), 내 장소 추가 시의 시간 입력.
                그런데 세 번째도 UserSpotsPanel 이 timeMap 을 기본값으로 미리
                채워 두기 때문에, 저장된 데이터만 보고는 "사용자가 정한 시각"과
                "앱이 채워 넣은 시각"을 구분할 수 없다. 구분할 계약이 없으므로
                숨긴다. 저장된 값 자체는 그대로 두고 슬롯 판정·정렬에 계속 쓴다.
                장소의 공식 운영시간·행사시간은 다른 경로이며 그대로 표시한다. */}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--gkm-accent-coral)" }}>📍 {place.location}</p>
            <h2 className="text-2xl sm:text-3xl font-black text-ink leading-tight">{place.name}</h2>
          </div>
          <div className="bg-surface-dim border border-line rounded-2xl p-5">
            <p className="text-xs font-black uppercase tracking-widest mb-2 text-sub">{t("tipsForForeigners")}</p>
            <p className="text-base text-sub leading-relaxed font-medium">{desc}</p>
          </div>
          {(snap?.soloFriendly != null || snap?.cashOnly || snap?.foreignCardAccepted != null) && (
            <div className="flex flex-wrap gap-2">
              {snap?.soloFriendly     && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{t("soloOk")}</span>}
              {snap?.cashOnly         && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{t("cashOnly")}</span>}
              {snap?.foreignCardAccepted && !snap?.cashOnly && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{t("cardOk")}</span>}
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
            <p className="text-xs font-bold text-green-700 mb-1">{t("naverKoreanHint")}</p>
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
          {TRIP_FLOW_COMMERCE_ENABLED && (place.affiliateUrl || place.bookingUrl) && (
            <a
              href={(place.affiliateUrl ?? place.bookingUrl)!}
              target="_blank" rel="noopener noreferrer sponsored"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3.5 rounded-xl text-sm font-bold text-white transition-colors"
              style={{ background: place.affiliateUrl ? "linear-gradient(135deg, #FF4A2D, #D93317)" : "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
            >
              {place.affiliateUrl
                ? (place.affiliateProvider === "klook" ? "🎟️ Book on Klook" : "🔗 Book Now")
                : "🏨 Book Stay"}
            </a>
          )}

          {/* ── SpotCard enrichment (SSOT: city_spots 매칭 성공 시) ── */}
          {matched && (
            <div className="border-t border-line pt-5 space-y-3">
              {/* difficulty + entry_fee 배지 */}
              <div className="flex flex-wrap gap-2">
                {matched.difficulty && (() => {
                  const label = matched.difficulty === "easy" ? t("difficultyEasy") : matched.difficulty === "moderate" ? t("difficultyModerate") : t("difficultyHard");
                  const cls   = matched.difficulty === "easy" ? "bg-green-50 text-green-700 border-green-100" : matched.difficulty === "moderate" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-red-50 text-red-700 border-red-100";
                  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>;
                })()}
                {matched.entryFee && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">💰 {matched.entryFee}</span>
                )}
              </div>
              {/* Official Info + Affiliate CTA */}
              <div className={`grid gap-3 ${matched.officialUrl && TRIP_FLOW_COMMERCE_ENABLED && matched.affiliateUrl ? "grid-cols-2" : "grid-cols-1"}`}>
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
                {TRIP_FLOW_COMMERCE_ENABLED && matched.affiliateUrl && (
                  <a
                    href={matched.affiliateUrl}
                    target="_blank" rel="noopener noreferrer sponsored"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-colors"
                    style={{ background: "linear-gradient(135deg, #FF4A2D, #D93317)" }}
                  >
                    {matched.affiliateProvider === "klook" ? "🎟️ Book Tour" : "🏨 Book Stay"}
                  </a>
                )}
              </div>
            </div>
          )}

          <button onClick={onClose}
            className="w-full py-3.5 rounded-xl text-sm font-black text-ink border-2 border-line hover:border-accent-coral hover:bg-surface-dim transition-all cursor-pointer">
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
// 서버가 준 원문(message)은 번역 대상이 아니라 값이다. 키와 함께 들고 간다.
type ItineraryError =
  | { key: "errCorrupted" | "errEmpty" | "errNoDates" | "errGenerate" | "errNetwork" }
  | { key: "errLoadFailed" | "errGenerateFailed" | "errLoadSavedFailed"; message: string }
  | null;

function ItineraryResult() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── URL 파라미터 (stable consts) ──────────────────────────
  const shareId          = searchParams.get("id");
  const paramCity        = searchParams.get("city")          || "Seoul";
  const paramStartDate   = searchParams.get("startDate")     || "";
  const paramEndDate     = searchParams.get("endDate")       || "";
  const paramTravelers   = searchParams.get("travelers")     || "1";
  // 예전에는 없으면 "Solo" 로 채웠다. 이제 동행을 묻지 않으므로 비어 있는 것이
  // 정상이고, 비어 있으면 제목에 붙이지 않는다. 저장된 예전 여행은 자기 값을
  // 그대로 갖고 있어 지금까지처럼 보인다.
  const paramTravelStyle = searchParams.get("travelStyle")   || "";
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
  // 숙박 지역. 정확한 숙소가 아니라 공개 지역 프리셋의 value 만 URL 에 남는다.
  // 좌표는 여기서 프리셋 표로 되찾으므로 lat/lng 를 다시 직렬화하지 않는다.
  const paramStayArea      = searchParams.get("stayArea")      || "";
  // 여행 속도. 없으면 balanced — 예전 주소도 지금까지와 같은 결과가 나온다.
  const paramTripPace      = normalizeTripPace(searchParams.get("pace"));

  // ── 지도에서 확인된 숙소 ──────────────────────────────────────────────────
  //
  // 주소에 싣지 않는다. 사용자가 자는 곳의 좌표를 브라우저 기록과 공유 링크에
  // 남기지 않기 위해서다. 대신 이 기기의 draft 에서 읽는다.
  //
  // 그리고 **이 일정이 그 draft 의 여행일 때만** 쓴다. draft 는 "준비 중인 여행
  // 하나" 라서, 지난달 서울 일정을 다시 열면 다음 달 부산 숙소가 들어 있을 수
  // 있다. 그 좌표로 서울 일정을 다시 짜면 가 본 적 없는 곳이 기준이 된다.
  const exactStay = useMemo(() => {
    const draft = readTripDraft();
    const trip  = { city: paramCity, startDate: paramStartDate, endDate: paramEndDate };
    const coordinate = exactStayCoordinate(draft, trip);
    if (!coordinate) return null;
    return { coordinate, name: exactStayName(draft, trip) };
  }, [paramCity, paramStartDate, paramEndDate]);

  // ── 표시용 메타 (공유 링크 로드 시 Supabase 값으로 덮어씀) ─
  const [city,        setCity]        = useState(paramCity);
  const [startDate,   setStartDate]   = useState(paramStartDate);
  const [endDate,     setEndDate]     = useState(paramEndDate);
  const [travelers,   setTravelers]   = useState(paramTravelers);
  const [travelStyle, setTravelStyle] = useState(paramTravelStyle);

  // ── 핵심 상태 ─────────────────────────────────────────────
  const [days,          setDays]          = useState<Day[]>([]);
  const [loading,       setLoading]       = useState(true);
  // 번역한 "문장" 이 아니라 "키" 를 담는다.
  //
  // locale 은 I18nProvider 가 마운트 후 URL·localStorage·브라우저 순으로 정하는데,
  // 일정 로드는 그보다 먼저 끝날 수 있다. 그 시점에 t() 로 문장을 만들어 state 에
  // 넣으면 영어로 굳어서, 한국어 화면에 영어 에러만 남는다. 키로 들고 있다가
  // 그리는 순간 번역한다.
  const [error,         setError]         = useState<ItineraryError>(null);
  const [isFallback,    setIsFallback]    = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [viewMode,      setViewMode]      = useState<"full" | "compact">("full");
  const [editDay,       setEditDay]       = useState(0);
  const [mapDay,        setMapDay]        = useState(0);           // S2: Day 지도 선택 인덱스
  // STAGE A: Full View 는 하루씩만 본다. 1-based — Day 번호와 그대로 맞춘다.
  const [plannerDay,    setPlannerDay]    = useState(1);
  const [visited,       setVisited]       = useState<Set<string>>(new Set()); // S2: 로컬 방문 체크 (DB 무변경)
  // ── 보관함 (cart 아이템 — Unscheduled 패널용) ─────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return getCityCart(paramCity); } catch { return []; }
  });
  // ── 로딩 페이즈 (Task 1: 강제 드웰 타임 + 제휴 노출) ─────────
  const [loadPhase, setLoadPhase] = useState(0);

  // ── Supabase 동기화 상태 ──────────────────────────────────
  const t = useTranslations("itin");
  const tStay = useTranslations("stay");
  const tMemo = useTranslations("memo");
  const tPlanner = useTranslations("planner");
  // My Place 표시 이름 fallback 에 쓴다 (picks 네임스페이스 공용).
  const tPicks = useTranslations("picks");
  // 공유 카드 CTA 는 Publish 성공 화면과 같은 말을 써야 한다 — 같은 곳으로 간다.
  const tPublish = useTranslations("publish");
  const locale = useLocale();
  const [itinId,      setItinId]      = useState<string | null>(null);

  /**
   * 이 일정의 숙소 체크인 시각. **이 기기에만** 둔다.
   *
   * `days` 에 넣으면 그 JSON 이 공유 링크로 그대로 나간다. 어디서 잤는지는
   * 보여 줘도 되는 정보지만, 몇 시에 거기 있었는지는 다른 이야기다.
   *
   * 일정별 로컬 키는 이 저장소가 이미 쓰는 방식이다 — 사진(`koreamate_moments_`)
   * 과 방문 체크(`koreamate_daydone_`) 가 같은 자리에 있다.
   */
  const [checkinTime, setCheckinTime] = useState<string | null>(null);
  const [syncStatus,  setSyncStatus]  = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncFading,  setSyncFading]  = useState(false);
  const [copied,          setCopied]          = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 이 화면이 방금 만든 일정인가 — 저장에 성공하면 This Trip 을 비울 자격.
   *
   * 저장 effect 는 새로 만들 때도, 저장된 일정을 다시 열 때도, 편집할 때도
   * 똑같이 깨어난다. "이번 마운트의 첫 성공" 을 신호로 쓰면 저장된 일정을
   * 열어 보기만 해도 This Trip 이 비워진다. 그래서 생성 경로에서만 세우고
   * 한 번 쓰고 내린다.
   */
  const clearOnFirstSaveRef = useRef(false);

  // ── 플래너 뱃지 ────────────────────────────────────────────
  const [plannerMeta,  setPlannerMeta]  = useState<{ numDays: number; startDate: string } | null>(null);

  // ── 커스텀 제목 편집 (Bug ③) ──────────────────────────────
  const [tripTitle,    setTripTitle]    = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput,   setTitleInput]   = useState("");

  // ── 오너 판별 (shareId로 접근해도 본인 일정이면 편집 허용) ──
  const [isOwner,  setIsOwner]  = useState(!shareId);
  const [isPublic, setIsPublic] = useState(false);
  // 현재 표지 상태 — 소유자 GET 이 내려주므로 새로고침 후에도 복원된다
  const [coverKind,     setCoverKind]     = useState<"auto" | "asset" | "moment">("auto");
  const [coverMomentId, setCoverMomentId] = useState<string | null>(null);
  const [coverBusy,     setCoverBusy]     = useState(false);
  const [coverNotice,   setCoverNotice]   = useState<"coverUpdated" | "tourismCoverRestored" | "coverUpdateFailed" | null>(null);
  const [coverPickId,   setCoverPickId]   = useState<string | null>(null);   // 동의 대기 중인 moment
  const [publishPreviewOpen, setPublishPreviewOpen] = useState(false); // S3: 공개 전 미리보기

  // ── TASK-018: 부분 실패 일차 추적 (Partial Success Policy) ──
  const [conflictDays,  setConflictDays]  = useState<Set<number>>(new Set());
  // ── TASK-049: Cart 아이템 좌표 없음 경고 표시용 ────────────────────────────────
  const [skippedCartNames, setSkippedCartNames] = useState<string[]>([]);
  /**
   * 여행 전체를 다 만들고 났는데도 This Trip 에 남은 곳.
   *
   * 비어 있지 않으면 이 일정은 완성이 아니다. 몇 곳을 빼고 만든 결과를
   * My Trip 이라고 부르며 저장하지 않는다 — 사용자는 자기가 고른 곳이
   * 빠진 줄 모른 채 그 일정을 들고 여행을 간다.
   */
  const [needsReduction, setNeedsReduction] = useState<{ key: string; name: string }[]>([]);
  const [fixedOutOfWindow, setFixedOutOfWindow] = useState<string[]>([]);
  const [unplacedPicks, setUnplacedPicks] = useState<{ key: string; name: string; hasFixed: boolean }[]>([]);
  // ── TASK-057-B3: My Pick scheduling explanation notes ─────────────────────────
  const [tripNotes,        setTripNotes]        = useState<string[]>([]);
  // ── TASK-021: Supabase affiliate 표시 맵 ─────────────────────────────────────
  const [affiliateMap,  setAffiliateMap]  = useState<AffiliateDisplayMap>({});
  // ── TASK-022: Trip Moments ────────────────────────────────────────────────────
  const [moments,         setMoments]         = useState<TripMoment[]>([]);

  // ── TASK-STORY-LIVE-BASELINE-V1: 같은 여행의 두 view ──────────────────────
  // `일정 | Story` 는 route 가 아니라 이 화면 안의 view 다. 끝난 여행은 Story 가
  // 기본 얼굴이고, 진행 중·예정 여행은 일정이 기본이다. `?view=story` 로 바로
  // Story 를 열 수 있다(/my-trips 카드의 Story 진입이 이 값을 쓴다).
  const [tripView, setTripView] = useState<"itinerary" | "story">(
    () => (searchParams.get("view") === "story" ? "story" : "itinerary"),
  );
  const [tripViewDefaulted, setTripViewDefaulted] = useState(false);
  const [storyFocus, setStoryFocus] = useState<{ m: StoryMemory; i: number } | null>(null);
  // 오늘 — /my-trips 의 archive 판정과 같은 식으로 센다.
  const todayISO   = new Date().toISOString().slice(0, 10);
  const isPastTrip = Boolean(itinId) && isPastTripByDate(endDate, todayISO);
  useEffect(() => {
    if (tripViewDefaulted || !itinId || !endDate) return;
    setTripViewDefaulted(true);
    if (isPastTrip && searchParams.get("view") !== "itinerary") setTripView("story");
  }, [tripViewDefaulted, itinId, endDate, isPastTrip, searchParams]);
  // 끝난 여행의 일정은 읽기 전용 — 편집 캔버스로 들어가지 않는다.
  useEffect(() => {
    if (isPastTrip && viewMode === "compact") setViewMode("full");
  }, [isPastTrip, viewMode]);
  // ── TASK-STORY-CROSS-DEVICE-PHOTOS-V1: 다른 기기에서도 내 사진 ──────────────
  // 로컬 미리보기(data URL)는 올린 기기에만 있다. 서버에 사진이 있는데 로컬이
  // 비어 있으면 소유자 전용 서명 주소를 받아 **메모리에만** 둔다 — localStorage 에
  // 넣으면 만료된 주소가 영구 저장된다. 만료가 가까우면 다시 받는다.
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<ResolvedPhotoMap>({});
  const [photoRefreshTick, setPhotoRefreshTick]   = useState(0);
  useEffect(() => {
    if (!itinId || !(!shareId || isOwner)) return;
    const now = Date.now();
    const pending = moments.filter(m => needsPhotoResolution(m) && !isResolvedFresh(resolvedPhotoUrls[m.moment_id], now));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const deviceId = getDeviceId();
      for (const m of pending) {
        const r = await fetchMomentPhotoUrls(m.moment_id, deviceId);
        if (cancelled) return;
        // 실패한 순간은 사진 없음으로 남는다 — 다른 순간의 사진은 그대로 그린다
        if (r) setResolvedPhotoUrls(prev => ({ ...prev, [m.moment_id]: r }));
      }
    })();
    return () => { cancelled = true; };
    // resolvedPhotoUrls 는 의도적으로 제외 — 해석 결과가 들어올 때마다 다시 돌지 않게.
    // 만료 재확인은 아래 tick 이 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments, itinId, shareId, isOwner, photoRefreshTick]);
  useEffect(() => {
    const id = setInterval(() => setPhotoRefreshTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // 이미지 로드 실패(만료·삭제) → 그 순간의 해석을 버리고 **한 번만** 다시 받는다.
  // 두 번째도 실패하면 그대로 둔다 — 실패마다 API 를 두드리거나 render 루프를 만들지 않는다.
  const photoRetriedRef = useRef<Set<string>>(new Set());
  const handlePhotoError = useCallback((momentId: string) => {
    if (!resolvedPhotoUrls[momentId] || photoRetriedRef.current.has(momentId)) return;
    photoRetriedRef.current.add(momentId);
    setResolvedPhotoUrls(prev => { const next = { ...prev }; delete next[momentId]; return next; });
    setPhotoRefreshTick(t => t + 1);
  }, [resolvedPhotoUrls]);
  // 화면용 복사본 — Timeline 과 Story 가 같은 것을 본다. 원본 `moments` 는 그대로다.
  const displayMoments = withResolvedPhotos(moments, resolvedPhotoUrls);

  // Story 의 뼈대는 일정이다. 사진이 없어도 지난 장소가 Story 를 이룬다.
  // 오늘 Day 안에서는 지금 시각(현지)을 지난 장소만 들어간다.
  const storyDays = (() => {
    if (tripView !== "story") return [];
    const now = new Date();
    const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return buildPrivateStoryDays(
      days.map(d => ({
        dayNumber: d.dayNumber,
        date:      d.date,
        places:    d.places.map(p => ({
          name: p.name, time: p.time, place_id: p.place_id, source: p.source, sourceKey: p.sourceKey, image: p.image,
        })),
      })),
      displayMoments,
      { todayISO, nowHHMM, isPast: isPastTrip },
    );
  })();
  const [captureOpen,     setCaptureOpen]     = useState(false);
  const [captureDay,      setCaptureDay]      = useState<number | null>(null); // Capture 기본 선택 day
  // 일정 장소에서 시작한 Capture — 장소명 prefill + 공식 장소면 city_spot_id 관계.
  // 없으면(헤더·Day 완주 토스트 진입) 예전과 같은 자유 순간이다.
  const [captureStop,     setCaptureStop]     = useState<{ placeName: string; citySpotId: number | null; stopKey: string | null } | null>(null);
  const [storyExportOpen, setStoryExportOpen] = useState(false);
  // 카드가 그리는 것은 **공개 Story 가 내보낸 것**뿐이다. 소유자 목록(`moments`)을
  // 그대로 넘기면 공개하지 않기로 한 사진·메모가 카드에 들어간다.
  const [storyCardMoments, setStoryCardMoments] = useState<StoryCardMoment[]>([]);
  const [storyCardBusy, setStoryCardBusy] = useState(false);
  // ── SSOT: city_spots — PlaceModal 제휴 정보 통합 ─────────────────────────────
  const [citySpots, setCitySpots] = useState<CitySpot[]>([]);

  // ── 취향 태그 (cart 기반 — 세션 내 고정) ──────────────────
  const [prefTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cart = getCityCart(paramCity);
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

  // TASK-060-F: 도시별 공항 저녁 도착 배너 게이팅 — includes("gimhae") 하드코딩 제거
  // city preset에 entry가 없는 도시(Seoul/Jeju/Gyeongju)는 배너 미표시
  const _airportBannerCfg = CITY_AIRPORT_ARRIVAL_BANNERS[paramCity];
  const shouldShowAirportBanner =
    !shareId &&
    paramArrivalType === "airport" &&
    !!_airportBannerCfg &&
    arrivalHour >= _airportBannerCfg.minArrivalHour;

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
          // TASK-060-E2 B안: 거리 체크(tooFar)와 keyword 체크(keywordBlocked)를 독립 실행,
          // OR 결합. 삼항연산자(A안) 금지 — 좌표가 있어도 keyword는 항상 검사.
          const cityMaxKm = CITY_DAY1_MAX_DISTANCE_KM[paramCity];
          cleaned = sorted.filter(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
            const tooFar =
              paramArrivalCoord && p.lat != null && p.lng != null && cityMaxKm != null
                ? haversineKm(paramArrivalCoord.lat, paramArrivalCoord.lng, p.lat, p.lng) > cityMaxKm
                : false;
            const keywordBlocked = PROHIBITED_DAY1.some(
              kw => p.name.toLowerCase().includes(kw) || p.location.toLowerCase().includes(kw)
            );
            return h >= arrivalHour && !(tooFar || keywordBlocked);
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
  //  Effect 1: 공유 링크 모드 (?id=UUID) → 소유자 전용 API 로드
  //  GET /api/itinerary/[id] 는 owner-only (x-device-id 필수).
  //  null → 비소유자 or 미존재 → /shared/[id] 공개 뷰어로 리다이렉트.
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!shareId) return;
    setLoading(true);

    const loadItinerary = async () => {
      // owner-only GET — 비소유자는 404 → record null
      const record = await apiFetchItinerary(shareId, getDeviceId());

      if (!record) {
        router.replace(`/shared/${shareId}`);
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
        setError({ key: "errCorrupted" });
        setLoading(false);
        return;
      }
      if (sharedDays.length === 0) {
        setError({ key: "errEmpty" });
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
      if (record.is_public !== undefined) setIsPublic(record.is_public);
      if (record.cover_kind) setCoverKind(record.cover_kind);
      setCoverMomentId(record.cover_moment_id ?? null);
      setHelpfulOrigin(record.copy_of ?? null); // 복사본이면 원본 id 보관
      setIsOwner(true); // GET is owner-only; having a record confirms ownership
      setSyncStatus("saved");
      setLoading(false);
    };

    loadItinerary().catch(err => {
      setError({ key: "errLoadFailed", message: (err as Error).message });
      setLoading(false);
    });
  }, [shareId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  //  Effect 2: 일반 모드 → Supabase 우선, 없으면 AI 생성
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (shareId) return; // Effect 1이 처리
    if (!paramStartDate || !paramEndDate) {
      setError({ key: "errNoDates" });
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

    // 체크인 시각은 이 기기에서만 산다. 새로 만들 때 쓰고, 저장된 일정을 다시
    // 열 때 되살린다. 없으면 숙소 카드에 시각 없이 이름만 남는다 — 공유받은
    // 사람이 보는 것과 같은 모습이다.
    try {
      const saved = localStorage.getItem(`koreamate_checkin_${id}`);
      if (saved) setCheckinTime(saved);
    } catch { /* ignore */ }

    // ── API 우선 로드 + Layer 2: 내용 검증
    apiFetchItinerary(id, getDeviceId()).then(record => {
      // v2 포맷 파싱 헬퍼 — { __v:2, scheduled, unscheduled } 또는 구버전 Day[]
      const raw = record?.days as Record<string, unknown> | Day[] | undefined;
      let loadedDays: Day[];
      if (raw && !Array.isArray(raw) && (raw as Record<string, unknown>).__v === 2) {
        // v2 는 { scheduled, unscheduled } 두 필드를 갖는다. 여기서 읽는 것은
        // scheduled 뿐이다 — unscheduled 는 "미배치 장소" 가 아니라 저장 당시
        // This Trip 전체 snapshot 이라 현재 계획을 되살릴 권한이 없다.
        // shape 은 기존 레코드 호환을 위해 그대로 둔다.
        const v2 = raw as { scheduled: Day[]; unscheduled: CartItem[] };
        loadedDays = v2.scheduled ?? [];
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
          generateWithNewApi(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle, paramArrivalTime || undefined, paramDepartureTime || undefined, paramDepartureType || undefined, paramArrivalCoord, paramDepartureCoord, buildSingleStay(paramCity, paramStayArea, paramStartDate, paramEndDate, exactStay?.coordinate), exactStay, paramTripPace)
            .then(({ days, isFallback, conflictDayNumbers, affiliateMap: aMap, skippedCartNames: skipped, fixedOutOfWindowNames: outOfWindow, unplacedPicks: unplaced, hadDeferredCartHints: deferred, usedCartHintCentroid: centroidUsed, checkinTime: ct }) => {
              // 여행 전체가 끝난 뒤 한 번만 판정한다. 남은 곳이 있으면 이 결과를
              // 일정으로 확정하지 않는다 — setDays 를 하지 않으면 저장 effect 도
              // 시작되지 않는다.
              const reduce = reduciblePicks(unplaced, outOfWindow);
              if (reduce.length > 0) {
                if (skipped.length > 0) setSkippedCartNames(skipped);
                setUnplacedPicks(unplaced);
                setNeedsReduction(reduce);
                setLoading(false);
                return;
              }
              // 여기부터가 "새로 만든 일정" 이다. 저장에 성공하면 This Trip 을 비운다.
              clearOnFirstSaveRef.current = true;
              setDays(sanitizeDays(days));
              setCheckinTime(ct);
              if (isFallback) setIsFallback(true);
              if (conflictDayNumbers.length > 0) setConflictDays(new Set(conflictDayNumbers));
              if (Object.keys(aMap).length > 0) setAffiliateMap(aMap);
              if (skipped.length > 0) setSkippedCartNames(skipped);
          if (outOfWindow.length > 0) setFixedOutOfWindow(outOfWindow);
              if (outOfWindow.length > 0) setFixedOutOfWindow(outOfWindow);
              setUnplacedPicks(unplaced);
              const notes: string[] = [];
              if (deferred)     notes.push("Some of your picks were saved for a later day to keep the route efficient.");
              if (centroidUsed) notes.push("Nearby places were added around your selected spots.");
              if (notes.length > 0) setTripNotes(notes);
              if (days.length > 0 && conflictDayNumbers.length === days.length) {
                setError({ key: "errGenerate" });
              }
              setLoading(false);
            })
            .catch(() => { setError({ key: "errNetwork" }); setLoading(false); });
          return;
        }
        // 정상 레코드 → sanitize 후 저장된 일정만 쓴다.
        //
        // 예전에는 여기서 legacy unscheduled 로 koreamate_cart 를 통째 덮어썼다.
        // 저장된 일정은 이미 완성된 결과이지 지금 짜고 있는 This Trip 의 주인이
        // 아니다. 같은 도시든 다른 도시든, 과거 snapshot 으로 현재 고른 곳을
        // 되돌리지 않는다 — 방금 담은 장소가 조용히 사라지던 자리다.
        setDays(sanitizeDays(loadedDays));
        if (record.trip_title) setTripTitle(record.trip_title);
        if (record.is_public !== undefined) setIsPublic(record.is_public);
        if (record.cover_kind) setCoverKind(record.cover_kind);
        setCoverMomentId(record.cover_moment_id ?? null);
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
      generateWithNewApi(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle, paramArrivalTime || undefined, paramDepartureTime || undefined, paramDepartureType || undefined, paramArrivalCoord, paramDepartureCoord, buildSingleStay(paramCity, paramStayArea, paramStartDate, paramEndDate, exactStay?.coordinate), exactStay, paramTripPace)
        .then(({ days, isFallback, conflictDayNumbers, affiliateMap: aMap, skippedCartNames: skipped, fixedOutOfWindowNames: outOfWindow, unplacedPicks: unplaced, hadDeferredCartHints: deferred, usedCartHintCentroid: centroidUsed, checkinTime: ct }) => {
          const reduce = reduciblePicks(unplaced, outOfWindow);
          if (reduce.length > 0) {
            if (skipped.length > 0) setSkippedCartNames(skipped);
            setUnplacedPicks(unplaced);
            setNeedsReduction(reduce);
            setLoading(false);
            return;
          }
          clearOnFirstSaveRef.current = true;
          setDays(sanitizeDays(days));
              setCheckinTime(ct);
          if (isFallback) setIsFallback(true);
          if (conflictDayNumbers.length > 0) setConflictDays(new Set(conflictDayNumbers));
          if (Object.keys(aMap).length > 0) setAffiliateMap(aMap);
          if (skipped.length > 0) setSkippedCartNames(skipped);
          const notes: string[] = [];
          if (deferred)     notes.push("Some of your picks were saved for a later day to keep the route efficient.");
          if (centroidUsed) notes.push("Nearby places were added around your selected spots.");
          if (notes.length > 0) setTripNotes(notes);
          if (days.length > 0 && conflictDayNumbers.length === days.length) {
            setError({ key: "errGenerate" });
          }
          setLoading(false);
        })
        .catch((err) => { setError({ key: "errGenerateFailed", message: (err as Error).message }); setLoading(false); });
    }).catch((err) => { setError({ key: "errLoadSavedFailed", message: (err as Error).message }); setLoading(false); });
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
    // `unscheduled` 에는 아무것도 담지 않는다.
    //
    // 예전에는 저장할 때마다 This Trip 을 통째로 여기 넣었다. 그런데 이 일정을
    // 공개하면 `get_shared_itinerary` 가 `days` 전체를 돌려주므로, 그 목록이
    // 링크를 아는 누구에게나 함께 나간다. My Place 를 This Trip 에 담았다면
    // 그 장소의 **비공개 메모까지** 공개 응답에 실렸다 — 공개 미리보기가
    // "메모는 비공개로 유지됩니다" 라고 약속하는 바로 그 값이다.
    //
    // 이 필드를 읽는 곳은 없다. reopen 이 이것으로 cart 를 덮어쓰던 경로를
    // 없앤 뒤로 소비자가 하나도 남지 않았고, 저장 형식(__v:2 · scheduled ·
    // unscheduled)은 그대로라 기존 레코드 호환도 깨지 않는다.
    const snapUnscheduled: CartItem[] = [];

    syncTimerRef.current = setTimeout(async () => {
      const ok = await apiSaveItinerary({
        id: snapId, city: snapCity,
        start_date: snapStartDate, end_date: snapEndDate,
        travelers: snapTravelers, travel_style: snapTravelStyle,
        days: { __v: 2, scheduled: snapDays, unscheduled: snapUnscheduled },
      }, getDeviceId());
      setSyncStatus(ok ? "saved" : "error");
      // 방금 만든 일정이 실제로 저장된 그 순간에만, 그 도시의 This Trip 을 비운다.
      // 실패하면 그대로 둔다 — 저장 안 된 일정 때문에 고른 곳을 잃게 하지 않는다.
      // 플래그를 먼저 내려 다음 autosave 가 다시 비우지 않게 한다.
      if (ok && clearOnFirstSaveRef.current) {
        clearOnFirstSaveRef.current = false;
        try {
          // 비우기 **전에** 읽는다. 비우고 나면 무엇을 골랐는지 알 수 없다.
          //
          // Saved 에서 올라와 일정에 확정된 곳은 더 이상 후보가 아니다. 목록에
          // 남겨 두면 다음 여행에서 이미 다녀오기로 한 곳을 다시 고민하게 된다.
          // 고르지 않은 Saved 와 My Places 원본은 그대로 둔다.
          const release = savedSelectionsToRelease(
            getCityCart(paramCity).map(item => ({ id: item.id, sourceKey: getItemSourceKey(item) })),
            getFavoriteSourceKeys(),
            getFavorites(),
          );
          for (const r of release) removeFavorite(r.id, r.sourceKey);
        } catch { /* ignore */ }
        // 바로 위 `snapUnscheduled` 와 같은 열쇠로 비운다 — 읽은 것과 지우는 것이
        // 달라지면 다른 도시가 지워진다.
        try { clearCityCart(paramCity); } catch { /* ignore */ }
      }
      if (ok) {
        setTimeout(() => setSyncFading(true), 2500);
        setTimeout(() => { setSyncStatus("idle"); setSyncFading(false); }, 3000);
      }
    }, 1500);

    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [days, itinId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!itinId || !checkinTime) return;
    try { localStorage.setItem(`koreamate_checkin_${itinId}`, checkinTime); } catch { /* ignore */ }
  }, [itinId, checkinTime]);

  // ── TASK-022: itinId 확정 시 moments 로드 ──────────────────
  useEffect(() => {
    if (!itinId) return;
    // shareId 로 공유 조회 중이고 본인 일정이 아니면 서버 API 소유권 오류 → 로컬만 사용
    if (shareId && !isOwner) {
      setMoments(loadMoments(itinId));
      return;
    }
    // 서버 병합 후 대기 항목(메타·사진)을 순차 재동기화한다
    const runResync = async () => {
      await resyncPendingMoments(itinId, getDeviceId());
      setMoments(loadMoments(itinId));
    };
    loadMomentsFromServer(itinId, getDeviceId()).then(async (merged) => {
      setMoments(merged);
      await runResync();
    });
    // 오프라인에서 쌓인 항목을 온라인 복귀 시 다시 시도한다.
    // resyncPendingMoments 가 single-flight 라 중복 실행되지 않는다.
    const onOnline = () => { void runResync(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [itinId, shareId, isOwner]);

  // ── #memories 앵커 스크롤 ────────────────────────────────────
  // 이 화면은 일정을 받아온 뒤에야 Memory 영역을 그린다. 브라우저의 기본
  // 해시 스크롤은 로드 시점에 한 번만 일어나므로, 그때는 대상이 아직 없어
  // 아무 일도 일어나지 않는다. 일정이 그려진 뒤 한 번 직접 옮긴다.
  const hashScrolled = useRef(false);
  useEffect(() => {
    if (hashScrolled.current) return;
    if (days.length === 0) return;
    if (window.location.hash !== "#memories") return;
    hashScrolled.current = true;
    // 레이아웃이 한 번 확정된 다음 프레임에 옮긴다
    requestAnimationFrame(() => {
      document.getElementById("memories")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [days.length]);

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
      ? `${tripTitle} — gokoreamate`
      : `My ${city} Trip — gokoreamate`;
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
  // 성공 시에만 목록 갱신 + 모달 닫기. 실패하면 false 를 돌려 모달·입력을
  // 유지하고, 캡처 화면이 현지화된 오류를 표시한다 (실패를 성공처럼 보이지 않게).
  // ── Trip Cover 변경 ────────────────────────────────────────────────────────
  //
  // 개인 사진 지정은 CoverConsentDialog 동의를 통과한 뒤에만 호출된다.
  // 해제(auto)는 공개를 줄이는 작업이라 추가 동의를 요구하지 않으며,
  // 비공개 일정에서도 허용한다(이미 지정된 개인 커버를 풀 수 있어야 한다).
  // 커버 결과 안내는 5초 후 자동으로 사라진다 (비차단)
  useEffect(() => {
    if (!coverNotice) return;
    const t = setTimeout(() => setCoverNotice(null), 5000);
    return () => clearTimeout(t);
  }, [coverNotice]);

  const applyCover = useCallback(async (
    body: { kind: "moment"; momentId: string; consent: true; consentVersion: string } | { kind: "auto" },
  ): Promise<boolean> => {
    if (!itinId) return false;
    setCoverBusy(true);
    setCoverNotice(null);
    try {
      const res = await fetch(`/api/itinerary/${encodeURIComponent(itinId)}/cover`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        // 서버 원문 오류는 노출하지 않는다. 기존 커버 상태를 그대로 유지한다.
        setCoverNotice("coverUpdateFailed");
        return false;
      }
      if (body.kind === "moment") {
        setCoverKind("moment");
        setCoverMomentId(body.momentId);
        setCoverNotice("coverUpdated");
      } else {
        setCoverKind("auto");
        setCoverMomentId(null);
        setCoverNotice("tourismCoverRestored");
      }
      return true;
    } catch {
      setCoverNotice("coverUpdateFailed");
      return false;
    } finally {
      setCoverBusy(false);
    }
  }, [itinId]);

  const confirmCoverConsent = useCallback(async (momentId: string) => {
    const ok = await applyCover({
      kind: "moment", momentId, consent: true, consentVersion: CONSENT_VERSION,
    });
    if (ok) setCoverPickId(null);   // 실패 시 동의창을 유지해 재시도할 수 있게 한다
  }, [applyCover]);

  // 오프라인 우선: 로컬 저장이 되면 성공이다. 서버 메타·사진 동기화 실패는
  // "저장 실패"가 아니라 대기 상태이며, Timeline 배지로 표시된다.
  const handleMomentSave = useCallback(async (moment: TripMoment): Promise<boolean> => {
    if (!itinId) return false;
    try {
      const r = await addMomentDetailed(itinId, moment, getDeviceId());
      setMoments(r.moments);
      if (!r.localSaved) return false;          // 이때만 모달 유지 + 오류 표시
      setCaptureOpen(false);
      setCaptureDay(null);
      setCaptureStop(null);
      return true;
    } catch {
      // 서버 원문 오류·Storage 경로는 사용자에게 노출하지 않는다
      console.warn("[itinerary] moment save failed");
      return false;
    }
  }, [itinId]);

  const handleMomentDelete = useCallback(async (momentId: string) => {
    if (!itinId) return;
    try {
      const updated = await deleteMoment(itinId, momentId, getDeviceId());
      setMoments(updated);
    } catch {
      // 서버 삭제 실패 → 롤백됨. 사용자에게 재시도 안내 (조용한 데이터 손실 방지)
      alert("삭제에 실패했습니다. 네트워크 상태를 확인 후 다시 시도해주세요.");
    }
  }, [itinId]);

  // ── memo 수정 — 성공 시 서버 응답 기준으로 상태 갱신, 실패는 throw 하여
  //    Timeline 이 원본을 유지한 채 오류를 표시하게 한다.
  const handleMemoEdit = useCallback(async (momentId: string, memo: string) => {
    if (!itinId) throw new Error("NO_ITINERARY");
    const updated = await updateMomentMemo(itinId, momentId, memo, getDeviceId());
    setMoments(updated);
  }, [itinId]);

  // ── 공개/비공개 토글 ─────────────────────────────────────────
  // S3: 공개 전환은 Publish Preview에서 명시적 확인 후에만 실행.
  // 비공개 전환은 즉시 (노출 축소 방향은 미리보기 불필요).
  async function applyPublic(next: boolean): Promise<boolean> {
    if (!itinId) return false;
    setIsPublic(next);
    const ok = await apiSetPublic(itinId, next, getDeviceId());
    if (!ok) setIsPublic(!next);
    return ok;
  }
  // ── 최초 공개 ──────────────────────────────────────────────────────────
  // 순서가 이 함수의 전부다: Memory 를 원하는 모양으로 맞춘 **다음에만** 여행을
  // 공개한다. 반대로 하면 정리하는 동안 이미 바깥에서 보인다.
  async function runPublish(selectedMomentIds: string[]): Promise<PublishOutcome["status"]> {
    if (!itinId) return "tripFailed";
    const deviceId = getDeviceId();
    const out = await runFirstPublish({
      // 매번 서버의 지금 상태를 다시 읽는다 — 지난 시도의 잔재를 이 값으로만 안다
      readServerState: async () => {
        try {
          const res = await fetch(
            `/api/trip-moments?itinerary_id=${encodeURIComponent(itinId)}`,
            { headers: { "x-device-id": deviceId } },
          );
          if (!res.ok) return { ok: false, rows: [] };
          const rows = (await res.json()) as Array<Record<string, unknown>>;
          return {
            ok: true,
            rows: rows.map((r): MemoryPublicState => ({
              moment_id: String(r.moment_id ?? ""),
              is_public: r.is_public === true,
            })),
          };
        } catch { return { ok: false, rows: [] }; }
      },
      setMomentPublic: (momentId, next) =>
        setMomentPublic(momentId, next, deviceId, next ? MEMORY_PUBLIC_CONSENT_VERSION : undefined),
      setTripPublic:   () => apiSetPublic(itinId, true, deviceId),
    }, selectedMomentIds);

    if (out.status === "published") {
      setIsPublic(true);
      // 화면의 Memory 공개 표시를 서버 값으로 다시 맞춘다
      setMoments(await loadMomentsFromServer(itinId, deviceId));
    }
    return out.status;
  }

  /** 공개 Story 가 내보낸 것만으로 카드 입력을 만든다. 실패하면 열지 않는다. */
  async function openStoryCard(): Promise<boolean> {
    if (!itinId || storyCardBusy) return false;
    setStoryCardBusy(true);
    try {
      const res = await fetch(`/api/shared/${encodeURIComponent(itinId)}/story`);
      if (!res.ok) return false;
      const api = (await res.json()) as ApiStory;
      setStoryCardMoments(toStoryCardMoments(api));
      setStoryExportOpen(true);
      return true;
    } catch { return false; }
    finally { setStoryCardBusy(false); }
  }

  /** Memory 한 건의 공개/해제 — 최초 공개가 끝난 뒤의 개별 수정용 */
  async function handleSetMomentPublic(momentId: string, next: boolean): Promise<boolean> {
    if (!itinId) return false;
    const deviceId = getDeviceId();
    const ok = await setMomentPublic(momentId, next, deviceId, next ? MEMORY_PUBLIC_CONSENT_VERSION : undefined);
    if (ok) setMoments(await loadMomentsFromServer(itinId, deviceId));
    return ok;
  }

  function handleTogglePublic() {
    if (!itinId) return;
    if (isPublic) { void applyPublic(false); return; }
    setPublishPreviewOpen(true);
  }

  // ── Bug ③: 커스텀 제목 저장 ─────────────────────────────────
  async function handleTitleSave() {
    const trimmed = titleInput.trim();
    setEditingTitle(false);
    if (!trimmed || !itinId) return;
    setTripTitle(trimmed);
    await apiUpdateItineraryTitle(itinId, trimmed, getDeviceId());
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
    const refreshCart = () => { try { setCartItems(getCityCart(paramCity)); } catch { /* ignore */ } };
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
      // 이 경로만 description 이 먼저다. 보관함 카드가 원래 보여주던 문구이므로
      // 순서를 바꾸지 않는다 — 바꾸면 안전한 문구까지 전부 교체된다(실측 86/86).
      sourceKey:     getItemSourceKey(item),
      tips:          firstPublicText(item.description, item.whyItMatters),
      googleMapsUrl: item.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.shortName || item.name} ${city} Korea`)}`,
      slot:          assignSlot(defaultTime),
      cartSnapshot:  item,
    };
    setDays(prev => prev.map((day, di) =>
      di === editDay ? { ...day, places: [...day.places, newPlace] } : day
    ));
    removeFromCart(getItemSourceKey(item)); // 배치 후 Unscheduled에서 즉시 제거
  }

  // ── user_spot → 현재 editDay에 추가 (PHASE 1) ────────────────
  function addUserSpotToDay(userSpot: UserSpot, selectedTime: string, slot: string) {
    const newPlace: Place = {
      // 이름 없는 My Place 도 일정 카드에는 부를 이름이 있어야 한다.
      // 원본 user_spot 에는 아무것도 쓰지 않는다 — 화면에서만 정한다.
      name:          userSpotDisplayName(userSpot, tPicks("displayFallback")),
      title:         userSpotDisplayName(userSpot, tPicks("displayFallback")),
      source:        "user_spot",
      place_id:      userSpot.id,
      sourceKey:     userSpotSourceKey(userSpot.id),
      category:      userSpot.category || "attraction",
      location:      userSpot.address || userSpot.city || city,
      time:          selectedTime,
      duration:      "60m",
      tips:          userSpot.note || "",
      googleMapsUrl: (userSpot.lat != null && userSpot.lng != null)
        ? `https://www.google.com/maps/search/?api=1&query=${userSpot.lat},${userSpot.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [userSpot.name, userSpot.address || userSpot.city, "Korea"].filter(Boolean).join(" ")
          )}`,
      slot:          slot,
      lat:           userSpot.lat,
      lng:           userSpot.lng,
      address:       userSpot.address,
      note:          userSpot.note,
    };
    setDays(prev => prev.map((day, di) =>
      di === editDay ? { ...day, places: [...day.places, newPlace] } : day
    ));
  }

  // ── S2: Day 지도의 base 핀 → 선택 Day에 추가 (Add to this day) ─────────────
  // 저장 형식 무변경 — addUserSpotToDay와 동일한 Place 스냅샷 + place_id 메타.
  function addCitySpotToDay(spot: CitySpot, dayIdx: number) {
    const target = days[dayIdx];
    // 시간: 해당 Day 마지막 장소 +90분 (파싱 실패·빈 Day는 10:00)
    let time = "10:00";
    const last = target?.places[target.places.length - 1];
    if (last?.time) {
      const [h, m] = last.time.split(":").map(Number);
      if (!isNaN(h)) {
        const total = Math.min(h * 60 + (m || 0) + 90, 21 * 60);
        time = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      }
    }
    const newPlace: Place = {
      name:          spot.name,
      title:         spot.name,
      source:        "city_spot",
      place_id:      String(spot.id),
      category:      spot.category,
      location:      spot.district || spot.city,
      time,
      duration:      spot.durationMinutes ? `${spot.durationMinutes}m` : "60m",
      // 기존 순서(whyItMatters → description)를 유지하고 판정만 추가한다.
      sourceKey:     spot.sourceKey ?? citySpotSourceKey(spot.id),
      tips:          firstPublicText(spot.whyItMatters, spot.description),
      googleMapsUrl: spot.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.city} Korea`)}`,
      slot:          assignSlot(time),
      lat:           spot.lat,
      lng:           spot.lng,
      address:       spot.address,
      // 장소 대표 이미지 — planner 생성 경로와 같은 계약으로 보존한다
      image:         spot.image,
    };
    setDays(prev => prev.map((day, di) =>
      di === dayIdx ? { ...day, places: [...day.places, newPlace] } : day
    ));
  }

  // ── S2: 방문 체크 로컬 저장 (itinerary 계약·DB 무변경 — localStorage 전용) ──
  // 격리: 여행별 storage key(itinId 우선, 미저장은 draft) + place_id 최우선 place key.
  const visitedKey = visitedStorageKey(itinId ?? shareId);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(visitedKey);
      setVisited(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitedKey]);
  // 방문 대상 = 화면에 실제로 렌더되는 장소 (공항 저녁 도착 Day 1 의 도착 전 항목 제외)
  const visitTargets = useCallback((day: Day): Place[] =>
    isAirportEvening && day.dayNumber === 1
      ? day.places.filter(p => parseInt(p.time?.split(":")?.[0] ?? "20", 10) >= arrivalHour)
      : day.places
  , [isAirportEvening, arrivalHour]);

  // Day 완주 축하 — 미완료 → 완료로 바뀌는 순간 1회만. 축하한 day 는 로컬에 기록해
  // 렌더·새로고침마다 반복 노출하지 않는다. (Visited 저장 계약은 그대로 둔다)
  const celebratedKey = `koreamate_daydone_${itinId ?? shareId ?? "draft"}`;
  const [celebrated, setCelebrated] = useState<Set<number>>(new Set());
  const [dayDone,    setDayDone]    = useState<number | null>(null);
  // 복사본 소유자만 원작자에게 Helpful 전송 가능 — 서버가 3중 가드로 최종 판정하며
  // 여기서는 CTA 노출 여부만 결정한다. sent 이면 이후 Day 에서도 재노출하지 않는다.
  const [helpfulOrigin,   setHelpfulOrigin]   = useState<string | null>(null);
  const [helpfulEligible, setHelpfulEligible] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(celebratedKey);
      setCelebrated(raw ? new Set(JSON.parse(raw) as number[]) : new Set());
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebratedKey]);

  // 복사본이면 서버에 자격·전송 여부를 조회 (카운트 변경 없음)
  useEffect(() => {
    if (!helpfulOrigin) { setHelpfulEligible(false); return; }
    let cancelled = false;
    apiHelpfulStatus(helpfulOrigin, getDeviceId()).then(st => {
      if (!cancelled) setHelpfulEligible(!!st && st.eligible && !st.sent);
    }).catch(() => { /* 조회 실패 → CTA 미노출 */ });
    return () => { cancelled = true; };
  }, [helpfulOrigin]);

  // Helpful 전송 — 실패는 throw 하여 토스트가 재시도 가능한 오류 상태를 보여준다.
  // 성공해도 여기서 자격을 내리지 않는다: 즉시 내리면 토스트의 Helpful 블록이
  // 언마운트되어 "감사 완료" 상태가 보이지 않는다. 자격 해제는 토스트를 닫을 때
  // 수행해, 이후 Day 완주에서는 재노출되지 않게 한다.
  const helpfulSentRef = useRef(false);
  const sendHelpful = useCallback(async () => {
    if (!helpfulOrigin) throw new Error("NO_ORIGIN");
    const r = await apiHelpfulVote(helpfulOrigin, getDeviceId());
    if (!r) throw new Error("HELPFUL_FAILED");
    helpfulSentRef.current = true;
  }, [helpfulOrigin]);

  // 토스트 종료 — 전송했다면 이후 Day 에서 재노출하지 않는다.
  const closeDayDone = useCallback(() => {
    setDayDone(null);
    if (helpfulSentRef.current) setHelpfulEligible(false);
  }, []);

  function toggleVisited(dayNumber: number, place: Place) {
    setVisited(prev => {
      const next = new Set(prev);
      const key = visitedPlaceKey(dayNumber, place);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(visitedKey, JSON.stringify([...next])); } catch { /* ignore */ }

      // 완주 판정: 소유자 화면 + 방문 대상이 1곳 이상 + 전부 체크 + 아직 축하 안 함
      if (!shareId || isOwner) {
        const day = days.find(d => d.dayNumber === dayNumber);
        const targets = day ? visitTargets(day) : [];
        const allDone = targets.length > 0 && targets.every(p => next.has(visitedPlaceKey(dayNumber, p)));
        if (allDone && !celebrated.has(dayNumber)) {
          const nextCel = new Set(celebrated).add(dayNumber);
          setCelebrated(nextCel);
          try { localStorage.setItem(celebratedKey, JSON.stringify([...nextCel])); } catch { /* ignore */ }
          setDayDone(dayNumber);
        }
      }
      return next;
    });
  }

  // ── 로딩 화면 — 단계 표시 + 진행바 + 스켈레톤 ──────────
  if (loading) {
    const phaseKey = LOAD_PHASES[Math.min(loadPhase, LOAD_PHASES.length - 1)];
    return (
      <div className="flex-1 flex flex-col items-center py-12 px-4 max-w-4xl mx-auto w-full">

        {/* ── 페이즈 표시기 ── */}
        <div className="text-center mb-8 w-full max-w-lg">
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface-dim/60 border border-line mb-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-coral shrink-0" />
            <span className="text-sm font-black text-ink">
              {shareId ? t("loadingShared") : t(phaseKey)}
            </span>
          </div>
          {!shareId && (
            <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-accent-coral rounded-full transition-all duration-700 ease-out"
                style={{ width: `${((loadPhase + 1) / LOAD_PHASES.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* ── 스켈레톤 일정 카드 ── */}
        <div className="w-full space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-line p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-surface-dim" />
                <div className="h-5 bg-surface-dim rounded w-24" />
                <div className="h-4 bg-surface-dim rounded w-16 ml-2" />
              </div>
              <div className="space-y-2.5">
                <div className="h-3.5 bg-surface-dim rounded w-3/4" />
                <div className="h-3.5 bg-surface-dim rounded w-1/2" />
                <div className="h-3.5 bg-surface-dim rounded w-2/3" />
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

  // ── 고른 곳이 다 들어가지 않았다 ────────────────────────
  //
  // 반쯤 만들어진 일정을 보여 주지 않는다. 화면에 띄우는 순간 사용자는 그것을
  // 완성본으로 읽고, 자기가 고른 곳이 빠졌다는 사실을 여행지에서 알게 된다.
  //
  // 어느 곳을 뺄지는 정해 주지 않는다. 짧은 곳 여럿을 빼도 되고 반나절짜리
  // 하나를 빼도 된다 — 무엇을 포기할지는 그 여행을 가는 사람이 안다.
  if (needsReduction.length > 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <h2 className="text-2xl font-black text-ink mb-3">{tPicks("reduceTitle")}</h2>
        <p className="text-sm text-sub max-w-sm mb-6 font-medium leading-relaxed">
          {tPicks("reduceBody")}
        </p>
        <ul className="mb-8 space-y-1">
          {needsReduction.map(u => (
            <li key={u.key} className="text-xs text-faint font-medium">· {u.name}</li>
          ))}
        </ul>
        <Link
          href="/picks/?tab=selected"
          className="gkm-focus inline-flex items-center justify-center min-h-11 px-6 py-3.5 text-sm font-black text-white rounded-xl transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--gkm-accent-coral)" }}
        >
          {tPicks("reduceAction")}
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-3xl font-black text-red-600 mb-4">{t("somethingWrong")}</h2>
        <p className="text-lg text-sub max-w-md mb-8 font-bold">
          {"message" in error ? t(error.key, { message: error.message }) : t(error.key)}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/" className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-ink text-surface-dim rounded-xl hover:bg-black transition-colors">
            ← {t("backHome")}
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

      {/* ── 공유 링크 뷰 배너 ──
            `?id=` 가 붙어 있다는 것만으로 남의 일정이라고 보면 안 된다. 내 여행
            목록에서 여는 정규 경로가 바로 `?id=` 라서, 자기 일정을 열 때마다
            "공유받은 일정을 보고 있다"는 말이 붙어 있었다. 소유 여부로 판단한다. */}
      {shareId && !isOwner && (
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
            AI is busy right now, so we prepared a safe gokoreamate recommended plan for you.
          </p>
        </div>
      )}

      {/* ── TASK-049: 좌표 없는 cart 아이템 경고 배너 ── */}
      {skippedCartNames.length > 0 && (
        <div className="mb-6 px-5 py-4 rounded-2xl bg-orange-50 border border-orange-200">
          <p className="text-sm font-bold text-orange-700 mb-1">
            {t("skippedTitle")}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {skippedCartNames.map(name => (
              <li key={name} className="text-xs text-orange-600 font-medium">· {name}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-orange-500">
            {t("skippedNote")}
          </p>
        </div>
      )}

      {/* This Trip 이 다 들어가지 못했다. 순위를 매기게 하지 않는다 —
          시간을 정해 둔 일정은 그대로 두고, 몇 곳만 빼고 다시 만들면 된다. */}
      {unplacedPicks.length > 0 && (
        <div className="mb-6 px-5 py-4 rounded-2xl bg-surface border border-line">
          <p className="text-sm font-bold text-ink mb-1">{tPicks("overflowTitle")}</p>
          <p className="text-xs text-sub leading-relaxed">{tPicks("overflowBody")}</p>
          <ul className="mt-2 space-y-0.5">
            {unplacedPicks.map(u => (
              <li key={u.key} className="text-xs text-faint font-medium">· {u.name}</li>
            ))}
          </ul>
          <Link href="/picks/?tab=selected"
            className="gkm-focus mt-3 inline-flex items-center min-h-11 text-xs font-bold text-action hover:text-action-hover">
            {tPicks("overflowAction")} →
          </Link>
        </div>
      )}

      {/* 시간을 정해 둔 일정끼리 이동이 빠듯할 수 있다. 해결 메뉴를 만들지 않는다. */}
      {conflictDays.size > 0 && (
        <div className="mb-6 px-5 py-4 rounded-2xl bg-surface border border-line">
          <p className="text-sm font-bold text-ink">{tPicks("conflictTitle")}</p>
          <Link href="/picks/?tab=selected"
            className="gkm-focus mt-2 inline-flex items-center min-h-11 text-xs font-bold text-action hover:text-action-hover">
            {tPicks("overflowAction")} →
          </Link>
        </div>
      )}

      {/* 고정 일정이 그날 시간 창 밖이라 배치할 수 없었다. 조용히 넘기지 않는다. */}
      {fixedOutOfWindow.length > 0 && (
        <div className="mb-6 px-5 py-4 rounded-2xl bg-orange-50 border border-orange-200">
          <p className="text-sm font-bold text-orange-700 mb-1">
            Some fixed times fall outside that day&apos;s schedule window.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {fixedOutOfWindow.map(name => (
              <li key={name} className="text-xs text-orange-600 font-medium">· {name}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-orange-500">
            Open Picks and adjust the date or time.
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

      {/* ── 대표 이미지 헤더 — 도시 대표 비주얼 위에 제목·기간·제목 수정 ──
          우선순위·보안 게이트는 cover-source-core 에 있다. 여기서는 값만 넘긴다. */}
      <PlannerCoverHeader
        cover={{ coverKind, coverMomentId, itineraryId: itinId, isPublic, city }}
        title={tripTitle || `My ${city} Trip`}
        dateLine={`${startDate} — ${endDate} · ${parseInt(travelers) > 1 ? t("travelerMany", { n: travelers }) : t("travelerOne", { n: travelers })}`}
        imageAlt={tPlanner("coverAlt", { city })}
        canEditTitle={(!shareId || isOwner) && !!itinId}
        editLabel={tPlanner("editTitle")}
        onEditTitle={() => { setTitleInput(tripTitle || `My ${city} Trip`); setEditingTitle(true); }}
        editing={editingTitle}
        editSlot={
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
            aria-label={tPlanner("editTitle")}
            className="gkm-focus w-full text-[26px] sm:text-4xl font-black text-[#131b2e] bg-white/95 rounded-2xl px-4 py-2"
            placeholder={`My ${city} Trip`}
            maxLength={60}
          />
        }
      />

      {/* ── 헤더 카드 ── */}
      <div className="bg-white rounded-3xl p-8 border border-line shadow-sm mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black bg-surface-dim text-sub px-3 py-1 rounded-md uppercase tracking-wider">
              {travelStyle ? `${travelStyle} Trip` : t("tripTitleFallback")}
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
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-surface-dim text-sub capitalize"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {/* 제목·기간·제목 수정은 위 대표 이미지 헤더로 옮겼다.
              두 곳에 같은 제목이 있으면 어느 쪽이 편집 대상인지 알 수 없다. */}
        </div>

        <div className="flex flex-col gap-2 w-full sm:w-auto">
          {/* 공유 링크 복사 — 공개 일정에만 둔다. 링크를 받은 사람은
              `/shared/{id}` 로 들어가고 거기서 is_public 이 강제되므로,
              비공개 일정의 링크는 상대에게 "Itinerary not found" 만 보여준다.
              열리지 않는 링크를 복사하게 두지 않는다. 공개로 바꾸는 방법은
              바로 아래 Public/Private 토글이다. /my-trips 와 같은 규칙이다. */}
          {isPublic && (
          <button
            onClick={handleCopyShareLink}
            disabled={!itinId}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all disabled:opacity-40 active:scale-95"
            style={{ backgroundColor: "var(--gkm-accent-coral)" }}
          >
            {copied ? t("copied") : t("copyShareLink")}
          </button>
          )}

          {/* 공개/비공개 토글 */}
          {(!shareId || isOwner) && itinId && (
            <button
              onClick={handleTogglePublic}
              className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black rounded-xl transition-all active:scale-95 ${
                isPublic
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
              }`}
            >
              {isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
            </button>
          )}

          {/* TASK-022: 기억 기록 버튼 */}
          <button
            onClick={() => setCaptureOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
            style={{ backgroundColor: "#1a1a2e" }}
          >
            📸 {tMemo("captureTitle")} {moments.length > 0 && <span className="bg-accent-coral text-white text-xs font-black px-1.5 py-0.5 rounded-full">{moments.length}</span>}
          </button>

          {/* 공유 카드 — 공개 Story 의 시각적 표현이다.
              비공개 여행에는 공개 Story 가 없으므로 카드를 만들지 않고 공개
              절차(Publish)로 보낸다. 소유자의 비공개 Memory 를 그대로 카드에
              담던 예전 경로는 없앴다 — 공개하지 않기로 한 것이 나갔다. */}
          {(!shareId || isOwner) && itinId && (
            <button
              onClick={() => { if (isPublic) void openStoryCard(); else setPublishPreviewOpen(true); }}
              disabled={storyCardBusy}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black rounded-xl transition-all active:scale-95 border-2 disabled:opacity-50"
              style={{ borderColor: "var(--gkm-accent-coral)", color: "var(--gkm-accent-coral)", backgroundColor: "transparent" }}
            >
              🎴 {tPublish("openStoryCard")}
            </button>
          )}

          <Link href="/" className="inline-flex items-center justify-center px-6 py-3 text-sm font-extrabold bg-surface-dim hover:bg-[#F3EEE3] text-ink border border-line rounded-xl transition-all shadow-sm">
            ← {t("backHome")}
          </Link>

          {/* Compact 편집 캔버스 진입 — 비공유 or 본인 일정. 끝난 여행은 읽기 전용 */}
          {(!shareId || isOwner) && !isPastTrip && (
            <button
              onClick={() => { setViewMode("compact"); setEditDay(0); }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: viewMode === "compact" ? "#16a34a" : "var(--gkm-ink)" }}
            >
              {viewMode === "compact" ? t("editing") : t("editTrip")}
            </button>
          )}

          {/* Compact / Full View 토글 — 끝난 여행은 읽기 전용이라 숨긴다 */}
          {!isPastTrip && (
          <div className="flex gap-1.5 p-1 border border-line rounded-xl bg-surface-dim">
            {(["full", "compact"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  viewMode === mode
                    ? "bg-ink text-surface-dim shadow-sm"
                    : "text-sub hover:text-ink"
                }`}
              >
                {mode === "compact" ? t("viewCompact") : t("viewFull")}
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* ── 일정 | Story — 같은 여행의 두 view (TASK-STORY-LIVE-BASELINE-V1) ── */}
      {(!shareId || isOwner) && itinId && (
        <div
          role="tablist"
          aria-label={t("viewSwitchLabel")}
          className="flex gap-1.5 p-1 border border-line rounded-xl bg-surface-dim mb-5 max-w-xs mx-auto"
        >
          {(["itinerary", "story"] as const).map(v => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tripView === v}
              onClick={() => setTripView(v)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-black transition-all ${
                tripView === v ? "bg-ink text-surface-dim shadow-sm" : "text-sub hover:text-ink"
              }`}
            >
              {v === "itinerary" ? t("viewItinerary") : t("viewStory")}
            </button>
          ))}
        </div>
      )}

      {tripView === "story" && (
        <section
          className="mb-12 rounded-3xl overflow-hidden border border-line"
          style={{ backgroundColor: STORY_PAGE_BG }}
        >
          <div className="flex items-center justify-between gap-3 px-5 pt-6">
            <p className="text-xs font-bold text-sub">
              {isPastTrip ? t("storyPastHint") : t("storyLiveHint")}
            </p>
            {(!shareId || isOwner) && (
              <button
                type="button"
                onClick={() => setCaptureOpen(true)}
                className="shrink-0 text-xs font-black px-3 py-2 rounded-lg border border-line bg-white text-ink"
              >
                + {tMemo("addMemory")}
              </button>
            )}
          </div>
          {storyDays.length > 0 ? (
            <StoryJournal
              days={storyDays}
              onOpenPhoto={(m, i) => setStoryFocus({ m, i })}
              onPhotoError={(m) => handlePhotoError(m.id)}
            />
          ) : (
            /* 진행 중인데 아직 지난 장소가 없다. 미래 장소를 미리 넣지 않는다. */
            <p className="px-6 py-16 text-center text-sm text-sub font-medium">{t("storyEmptyLive")}</p>
          )}
        </section>
      )}

      {/* 일정 본문은 Story 를 볼 때도 언마운트하지 않고 감춘다 — 지도·Day 선택·
          편집 상태가 그대로 남아 돌아오면 보던 자리부터 이어진다. */}
      <div className={tripView === "itinerary" ? undefined : "hidden"} aria-hidden={tripView !== "itinerary"}>
      <p className="text-center text-sm text-sub font-bold mb-4 bg-surface-dim/40 rounded-xl py-2.5">
        {t("hintTapCard")}
      </p>

      {/* ── 공항 저녁 도착 전용 배관 배너 ── */}
      {/* Post-Plan Commerce (§14-1-B) — 일정 확정 후 문맥 상품. 정상화 전까지 비활성 */}
      {POST_PLAN_COMMERCE_ENABLED && shouldShowAirportBanner && (
        <div className="mb-6 rounded-2xl border border-accent-coral/40 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
          <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-3">✈️ Gimhae Airport Evening Arrival — Essential Setup</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={resolveOffer("airport_transfer", locale, { variant: "gimhae" })?.url ?? ""}
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
              href={resolveOffer("esim", locale, { variant: "envOverride" })?.url ?? ""}
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
              href={resolveOffer("accommodation", locale, { variant: "busanNampo", checkin: startDate, checkout: endDate })?.url ?? ""}
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
              {t("editCanvasHint")}
            </p>
            <button
              onClick={() => setViewMode("full")}
              className="shrink-0 text-xs font-black text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              {t("viewFull")}
            </button>
          </div>

          {/* 주황 Spot 탐색 버튼 — /all-spots 검색 페이지로 이동 */}
          {(!shareId || isOwner) && (
            <Link
              href="/all-spots"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black text-white mb-4 transition-opacity hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "var(--gkm-accent-coral)" }}
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
                    : "bg-white text-sub border border-line hover:border-accent-coral"
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
                    ? { backgroundColor: "var(--gkm-accent-coral)", color: "#fff" }
                    : { backgroundColor: "#f3f4f6", color: "#374151" }}
                >
                  {day.places.length}
                </span>
              </button>
            ))}
          </div>

          {/* 현재 Day 편집 리스트 — 시간순 플랫 리스트 (슬롯 그루핑 제거로 누락 방지) */}
          {days[editDay] && (
            <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm">
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
                  className="flex items-center gap-3 px-4 py-3 border-b border-line/40 last:border-0 hover:bg-surface-dim/60 group transition-colors"
                >
                  {/* 방문 시각 대신 순서 번호. ↑↓ 로 바꾸는 것이 바로 이 순서다.
                      시각은 출처를 구분할 계약이 없어 표시하지 않는다(상세 모달과 같은 이유). */}
                  <span className="text-xs font-bold text-sub w-6 shrink-0 tabular-nums text-right">{pi + 1}</span>
                  <span
                    className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0 hidden sm:inline"
                    style={{ backgroundColor: getCategoryColor(p.category) }}
                  >
                    {p.category.slice(0, 5)}
                  </span>
                  <span className="flex-1 text-sm font-bold text-ink truncate">{p.name}</span>
                  {(!shareId || isOwner) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => movePlace(editDay, pi, "up")}
                        disabled={pi === 0}
                        className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-25 text-xs font-black flex items-center justify-center cursor-pointer transition-colors"
                        title={t("moveUp")}
                      >↑</button>
                      <button
                        onClick={() => movePlace(editDay, pi, "down")}
                        disabled={pi === days[editDay].places.length - 1}
                        className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-25 text-xs font-black flex items-center justify-center cursor-pointer transition-colors"
                        title={t("moveDown")}
                      >↓</button>
                      <button
                        onClick={() => deletePlace(editDay, pi)}
                        className="w-7 h-7 rounded-full bg-red-500 text-white hover:bg-red-600 text-xs font-black flex items-center justify-center cursor-pointer transition-colors"
                        title={t("removePlace")}
                      >×</button>
                    </div>
                  )}
                </div>
              ))}

              {days[editDay].places.length === 0 && (
                <div className="py-10 text-center text-sm text-sub/40 italic">
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
                  <span className="text-xs font-black text-sub">{t("unscheduledTitle")}</span>
                  <span className="text-[10px] font-bold bg-surface-dim/60 text-sub px-2 py-0.5 rounded-full">
                    {unscheduled.length}
                  </span>
                  <span className="text-[10px] text-sub/50 ml-auto">{t("unscheduledHint")}</span>
                </div>
                <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm">
                  {unscheduled.map((item) => (
                    <div
                      /* 같은 `local-<n>` 을 가진 다른 소스의 장소가 함께 있을 수 있다.
                         id 를 key 로 쓰면 React 가 두 행을 같은 것으로 보고 재사용한다. */
                      key={getItemSourceKey(item)}
                      className="flex items-center gap-3 px-4 py-3 border-b border-line/40 last:border-0 hover:bg-surface-dim/60 transition-colors"
                    >
                      <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0 hidden sm:inline"
                        style={{ backgroundColor: getCategoryColor(item.type) }}
                      >
                        {item.type.slice(0, 5)}
                      </span>
                      <span className="flex-1 text-sm font-bold text-ink truncate">
                        {item.shortName || item.name}
                      </span>
                      <span className="text-[10px] text-sub/50 shrink-0 hidden sm:inline">
                        {item.recommendedDurationMinutes}m
                      </span>
                      <button
                        onClick={() => addCartItemToDay(item)}
                        className="shrink-0 w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center hover:opacity-80 cursor-pointer transition-opacity"
                        style={{ backgroundColor: "var(--gkm-accent-coral)" }}
                        title={`Add to Day ${editDay + 1}`}
                      >+</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* My Places (user_spots) — PHASE 1 */}
          {(!shareId || isOwner) && !isPastTrip && (
            <UserSpotsPanel
              city={city}
              selectedDayIndex={editDay}
              selectedDayLabel={`Day ${days[editDay]?.dayNumber ?? editDay + 1}`}
              existingPlaces={days[editDay]?.places ?? []}
              onAddToDay={addUserSpotToDay}
            />
          )}

          <p className="text-center text-xs text-sub/50 mt-4">
            {t("editCanvasFooter")}
          </p>
        </div>
      ) : (
        /* ── Full View ── */
        <div className="space-y-12 mb-16">
          {/* STAGE A: 하루씩 본다. 14일 일정에서 전체를 세로로 쌓으면 아무것도 못 찾는다.
              선택 Day 는 지도와도 같이 움직인다 — 두 곳이 서로 다른 날을 가리키면 안 된다. */}
          {days.length > 0 && (() => {
            const currentDay = clampDay(days.length, plannerDay);
            const selectDay = (n: number) => {
              const d = clampDay(days.length, n);
              setPlannerDay(d);
              setMapDay(d - 1);
            };
            return (
              <PlannerDayNav
                days={days.map(d => ({
                  dayNumber: d.dayNumber,
                  dateLabel: formatDayChipDate(d.date, locale),
                  placeCount: d.places.length,
                }))}
                currentDay={currentDay}
                onSelectDay={selectDay}
                labels={{
                  dayOfTotal:    tPlanner("dayOfTotal", { n: currentDay, total: days.length }),
                  dayTabList:    tPlanner("dayTabList"),
                  openSelector:  tPlanner("openSelector", { n: currentDay, total: days.length }),
                  selectorTitle: tPlanner("selectorTitle"),
                  close:         tPlanner("close"),
                  weather:       tPlanner("weather"),
                  weatherAria:   tPlanner("weatherAria"),
                  placesLabel:   (n: number) => tPlanner("places", { n }),
                  dayAria:       (n: number, date: string) => tPlanner("dayAria", { n, date }),
                }}
              />
            );
          })()}
          {/* S2: 선택 Day 지도 — 번호 마커·순서선·Add to this day.
              Day 칩은 끈다 — 위 PlannerDayNav 가 선택을 맡는다. 두 벌이 같이 보이면
              어느 쪽이 진짜 선택인지 알 수 없고 스크린리더도 Day 탭을 두 번 읽는다. */}
          {days.length > 0 && (
            <ItineraryDayMap
              days={days}
              city={city}
              selectedDay={Math.min(mapDay, days.length - 1)}
              onSelectDay={(i) => { setMapDay(i); setPlannerDay(i + 1); }}
              onAddToDay={(!shareId || isOwner) && !isPastTrip ? addCitySpotToDay : undefined}
              showDayTabs={false}
            />
          )}
          {days.filter(day => day.dayNumber === clampDay(days.length, plannerDay)).map((day) => {
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
              <div key={day.dayNumber} className="relative pl-6 sm:pl-8 border-l-2 border-accent-coral/30">
                <div className="absolute -left-[11px] top-1.5 bg-surface-dim border-4 border-accent-coral w-5 h-5 rounded-full z-10" />
                <h2 className="text-2xl sm:text-3xl font-black text-ink mb-5 flex items-center gap-3 flex-wrap">
                  <span>Day {day.dayNumber}</span>
                  <span className="text-lg font-bold text-sub bg-surface-dim/40 px-3 py-0.5 rounded-full">{day.date}</span>
                  <span className="text-sm font-semibold text-sub">{t("placesCount", { n: day.places.length })}</span>
                  {/* S2: 방문 진행률 — 체크된 게 있을 때만 표시 (실측치만) */}
                  {(() => {
                    const done = day.places.filter(p => visited.has(visitedPlaceKey(day.dayNumber, p))).length;
                    return done > 0 ? (
                      <span className="text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-0.5 rounded-full">
                        ✓ {t("progress", { done, total: day.places.length })}
                      </span>
                    ) : null;
                  })()}
                </h2>

                {conflictDays.has(day.dayNumber) && (
                  <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
                    <span className="text-lg shrink-0">⚠️</span>
                    <p className="text-sm font-bold text-amber-700">
                      {t("conflictNotice", { n: day.dayNumber })}
                    </p>
                  </div>
                )}

                {/* TASK-058-D: 마지막 날 출발 버퍼 안내 — 일정이 짧은 이유를 사용자에게 설명 */}
                {day.dayNumber === days.length && paramDepartureTime && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-dim/40 border border-accent-coral/30">
                    <span className="text-sm shrink-0">🕐</span>
                    <p className="text-xs font-semibold text-sub">
                      {t("departureNotice", { time: paramDepartureTime })}
                    </p>
                  </div>
                )}

                {/* STAGE A 타임라인 — 하루를 하나의 흐름으로 편다.
                    시간대마다 불투명 카드를 두면 하루가 네 덩어리로 보이고 점선도
                    카드 안에서만 이어져 끊긴다. 슬롯 분류·정렬 로직(TIME_SLOTS,
                    assignSlot)은 그대로 두고 화면만 평평하게 만든다. */}
                <div className="rounded-2xl border border-line overflow-hidden bg-white" id={`day-${day.dayNumber}`}>
                  {(() => {
                    const rows = buildTimeline(
                      slotAssigned.map(x => ({ item: x.place, index: x.idx, slot: x.slot })),
                      TIME_SLOTS.map(ts => ts.key),   // 정렬 순서 정의는 기존 것 하나만 쓴다
                    );
                    return rows.map((row) => {
                            const place = row.item;
                            const idx   = row.index;
                              const naverUrl = naverPlaceSearchUrl(place.name, city);
                              const googleUrl =
                                place.googleMapsUrl ||
                                googlePlaceSearchUrl(place.name, city);
                              const naverIsGoogle = naverUrl.includes("google.com");

                              return (
                                <div
                                  key={idx}
                                  className="flex items-stretch hover:bg-surface-dim/40 transition-colors group relative"
                                >
                                  {/* 타임라인 레일 — 위 선 · 아이콘 · 아래 선.
                                      flex 로 행 높이를 그대로 따라가므로 카드가 길어지거나
                                      슬롯 라벨이 붙어도 선이 끊기지 않는다. 슬롯이 바뀌는
                                      자리에서도 위 선을 그대로 이어 하루가 한 줄로 보인다.
                                      의미는 옆의 category 배지가 글자로 전하므로 숨긴다. */}
                                  <div
                                    aria-hidden
                                    className="w-[68px] shrink-0 flex flex-col items-center pointer-events-none"
                                  >
                                    <span
                                      className={`w-0 flex-none ${row.railAbove ? "border-l-2 border-dotted border-line" : ""}`}
                                      style={{ height: row.showSlotLabel ? 46 : 22 }}
                                    />
                                    <span
                                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                                      style={{ backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-action-primary)" }}
                                    >
                                      <TimelineIcon category={place.category} size={16} />
                                    </span>
                                    <span
                                      className={`w-0 flex-1 ${row.railBelow ? "border-l-2 border-dotted border-line" : ""}`}
                                    />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                  {/* 시간대 흐름 라벨 — 그 시간대의 첫 장소에만. 정확한 도착
                                      시각이 아니므로 작은 보조 텍스트로만 둔다. */}
                                  {row.showSlotLabel && (
                                    <p className="pt-4 pb-0.5 pr-5 text-[11px] font-black uppercase tracking-[0.14em] text-faint">
                                      {tPlanner(`slot_${row.slot}`)}
                                    </p>
                                  )}
                                  {/* 장소 정보 + 지도 버튼 행 */}
                                  <div className="flex flex-col sm:flex-row justify-between gap-4 py-5 pr-5">
                                    <div
                                      className="space-y-2 flex-1 cursor-pointer min-w-0"
                                      onClick={() => setSelectedPlace(place)}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className="text-xs font-black uppercase px-2.5 py-0.5 rounded-md text-white"
                                          style={{ backgroundColor: getCategoryColor(place.category) }}
                                        >{place.category}</span>
                                        {/* 정확한 방문 시각은 표시하지 않는다 — 시간대 흐름 라벨이
                                            그 자리를 대신한다. place.time 자체는 슬롯 판정에 계속 쓴다.

                                            숙소 체크인만 예외다. 몇 시부터 들어갈 수 있는지가 그
                                            자체로 쓸모 있는 정보이기 때문이다. 그 시각은 저장된
                                            일정이 아니라 이 기기에서 온다 — 공유 링크에는 없다. */}
                                        {place.isAccommodation && checkinTime && (
                                          <span className="text-xs font-bold text-sub">
                                            {t("checkinAt", { time: checkinTime })}
                                          </span>
                                        )}
                                        <span className="text-xs font-bold text-sub">📍 {place.location}</span>
                                        {/* S2: 방문 체크 (로컬 전용 — DB·저장 형식 무변경) */}
                                        <button
                                          onClick={(e) => { e.stopPropagation(); toggleVisited(day.dayNumber, place); }}
                                          aria-pressed={visited.has(visitedPlaceKey(day.dayNumber, place))}
                                          className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                                            visited.has(visitedPlaceKey(day.dayNumber, place))
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                              : "bg-white text-sub/60 border-line hover:border-sub/40"
                                          }`}
                                        >
                                          {visited.has(visitedPlaceKey(day.dayNumber, place)) ? "✓ " : "○ "}{t("visited")}
                                        </button>
                                        {/* 이 장소에서 순간 남기기 — 장소명과 공식 장소 id 를 들고 Capture 를 연다.
                                            그래야 Story 가 이 장소 항목을 정확히 개인화한다 (장소명 추측 결합 없음).
                                            열쇠(stopKeyOf: 공식 장소·내 장소·행사 출처 키)가 있는 항목에만 둔다. 숙소처럼
                                            출처 id 가 없는 항목은 결합할 수 없으므로 열지 않는다 — 열어 주면 같은 장소가
                                            Story 에 기본 항목 + 자유 순간으로 두 번 보인다. 그런 기록은 자유 순간으로 남긴다. */}
                                        {(!shareId || isOwner) && itinId && stopKeyOf(place) !== null && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCaptureDay(day.dayNumber);
                                              setCaptureStop({ placeName: place.name, citySpotId: stopCitySpotId(place), stopKey: stopKeyOf(place) });
                                              setCaptureOpen(true);
                                            }}
                                            aria-label={`${tMemo("addMemory")} · ${place.name}`}
                                            className="text-xs font-bold px-2.5 py-1 rounded-full border border-line bg-white text-sub/70 hover:border-sub/40 transition-colors cursor-pointer"
                                          >
                                            + {tMemo("addMemory")}
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-start gap-3">
                                        {hasRealSpotImage(place.cartSnapshot?.image) && (
                                          <img
                                            src={resolveSpotImageSrc(place.cartSnapshot?.image)}
                                            alt={place.name}
                                            className="w-16 h-16 rounded-xl object-cover shrink-0 border border-line"
                                            onError={swapToPlaceholderOnError}
                                          />
                                        )}
                                        <div className="min-w-0">
                                          {/* 장소명만 Place Detail 로 보낸다. 카드 전체를 링크로
                                              바꾸면 Visited·지도·상세 모달과 클릭이 겹친다.
                                              stopPropagation 으로 카드의 모달 열기를 막는다. */}
                                          <h3 className="text-lg sm:text-xl font-black text-ink group-hover:text-sub transition-colors">
                                            {citySpotHref(place) ? (
                                              <Link
                                                href={citySpotHref(place)!}
                                                onClick={(e) => e.stopPropagation()}
                                                className="hover:text-accent-coral hover:underline underline-offset-4 decoration-2 transition-colors"
                                              >
                                                {place.name?.trim()
                                                  || (place.isAccommodation ? tStay("placeFallback") : "")}
                                              </Link>
                                            ) : place.name}
                                          </h3>
                                          <div className="bg-surface-dim/60 border border-line/60 rounded-xl p-3 mt-1">
                                            <p className="text-xs text-sub leading-relaxed line-clamp-2">
                                              {firstPublicText(place.cartSnapshot?.whyItMatters, place.cartSnapshot?.description, place.tips)}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                      <p className="text-xs text-accent-coral font-bold opacity-0 group-hover:opacity-100 transition-opacity">
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
                                        {naverIsGoogle ? t("moreSearch") : "💚 Naver Maps"}
                                      </a>
                                    </div>
                                  </div>
                                  {/* 수익화 제휴 버튼 스트립 — slotItems.map 내부, 즉
                                      **일정 항목 내부**이므로 Post-Plan 이 아니라
                                      Trip-Flow Commerce (§14-1-A) 로 분류한다. */}
                                  {TRIP_FLOW_COMMERCE_ENABLED && (
                                  <div
                                    className="flex gap-2 overflow-x-auto px-5 pb-4 pt-0 border-t border-line/40"
                                    style={{ scrollbarWidth: "none" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <a
                                      href={resolveOffer("esim", locale, { variant: "envOverride" })?.url ?? ""}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "var(--gkm-accent-coral)" }}
                                    >
                                      📱 Get Korea eSIM
                                    </a>
                                    <a
                                      href={resolveOffer("accommodation", locale, { variant: "busanCity", checkin: startDate, checkout: endDate })?.url ?? ""}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#003580" }}
                                    >
                                      🏨 Book Hotels
                                    </a>
                                    <a
                                      href={resolveOffer("activities", locale, { variant: "koreaHub" })?.url ?? ""}
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
                                  )}
                                  </div>
                                </div>
                              );
                            });
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TASK-021: Korea Ready Partner Deals (Supabase affiliate_links) ── */}
      {Object.keys(affiliateMap).length > 0 && (
        <div className="mb-12">
          <p className="text-xs font-black uppercase tracking-widest text-sub mb-4">
            Korea Ready Partner Deals
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(affiliateMap).map(([id, deal]) => (
              <a
                key={id}
                href={deal.destination_url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-line shadow-sm hover:border-accent-coral transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-surface-dim flex items-center justify-center text-xl shrink-0">
                  🇰🇷
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-sub mb-0.5">
                    {deal.provider}
                  </p>
                  <p className="text-sm font-black text-ink leading-tight">{deal.title}</p>
                  <p className="text-xs text-sub leading-relaxed mt-1 line-clamp-2">{deal.description}</p>
                </div>
                <span className="text-accent-coral text-sm shrink-0 mt-0.5">→</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── TASK-022: Trip Journal — 나만의 여행 기억 타임라인 ──
            Memory 는 별도 화면이 아니라 이 Trip 안의 한 구간이다. /my-trips 의
            Memories 진입이 이 앵커로 내려온다 — scroll-mt 는 상단 고정 바에
            제목이 가려지지 않게 하는 여백이다. */}
      <div id="memories" className="mb-12 scroll-mt-24">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-black text-ink">📸 {tMemo("memoriesTitle")}</h2>
            <p className="text-sm text-sub mt-0.5">{tMemo("memoriesSubtitle")}</p>
          </div>
          <button
            onClick={() => setCaptureOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-95"
            style={{ backgroundColor: "#1a1a2e" }}
          >
            + {tMemo("addMemory")}
          </button>
        </div>
        <TripMomentTimeline
          moments={displayMoments}
          onPhotoError={handlePhotoError}
          onDelete={handleMomentDelete}
          onEditMemo={(!shareId || isOwner) ? handleMemoEdit : undefined}
          onAddMemory={(day) => { setCaptureDay(day ?? null); setCaptureOpen(true); }}
          dayNumbers={days.map(d => d.dayNumber)}
          isPublic={isPublic}
          currentCoverMomentId={coverKind === "moment" ? coverMomentId : null}
          coverBusy={coverBusy}
          onUseAsCover={(!shareId || isOwner) ? (mid) => setCoverPickId(mid) : undefined}
          onClearCover={(!shareId || isOwner) ? () => void applyCover({ kind: "auto" }) : undefined}
          onSetPublic={(!shareId || isOwner) ? handleSetMomentPublic : undefined}
        />
      </div>
      </div>

      {/* Story 의 사진 확대 — 공개 Story 와 같은 Focus. 상호작용은 바꾸지 않는다 */}
      {storyFocus && (
        (() => {
          // 여행 전체를 한 줄로 — 누른 사진에서 시작해 Day·장소 순서대로 넘긴다
          const slides = buildFocusSequence(storyDays);
          return (
            <StoryMemoryFocus
              slides={slides}
              startIndex={findSlideIndex(slides, storyFocus.m, storyFocus.i)}
              onClose={() => setStoryFocus(null)}
            />
          );
        })()
      )}

      <AdBanner />

      {/* eSIM 배너 — 같은 코드가 두 문맥에서 렌더된다 (§14-1 문맥별 판정)
            본인 일정 (!shareId) → 일정 확정 후 별도 상품 영역 → Post-Plan
            공유 일정 (shareId)  → 다른 사용자가 보는 공유 일정 → Trip-Flow
          두 조건을 모두 만족할 때만 anchor 를 생성한다. Post-Plan 을 미래에
          활성화해도 공유 일정에서는 shareId 때문에 계속 0 이다. */}
      {!shareId && POST_PLAN_COMMERCE_ENABLED && (
      <div className="bg-gradient-to-r from-accent-coral to-[#D93317] rounded-3xl p-8 sm:p-10 shadow-xl text-white mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-2xl sm:text-3xl font-black">📱 Don&apos;t forget your eSIM!</h3>
          <p className="text-base sm:text-lg font-bold text-white/85">Stay connected throughout your Korea trip with 10% off.</p>
        </div>
        <a href={resolveOffer("esim", locale)?.url ?? ""} target="_blank" rel="noopener noreferrer sponsored"
          className="inline-flex items-center justify-center px-6 py-4 text-base font-black uppercase tracking-wider bg-ink text-surface-dim rounded-xl hover:bg-black transition-all shadow-md">
          Get eSIM Now
        </a>
      </div>
      )}

      {selectedPlace && (
        <PlaceModal place={selectedPlace} city={city} citySpots={citySpots} onClose={() => setSelectedPlace(null)} />
      )}

      {/* Trip Cover — Timeline 에서 고른 사진의 공개 동의 (기존 다이얼로그 재사용) */}
      {coverPickId && (() => {
        const pick = moments.find((m) => m.moment_id === coverPickId);
        if (!pick?.photo_data) return null;
        return (
          <CoverConsentDialog
            photos={[{ momentId: pick.moment_id, previewUrl: pick.photo_data, label: pick.memo }]}
            busy={coverBusy}
            onCancel={() => setCoverPickId(null)}
            onApply={(mid) => void confirmCoverConsent(mid)}
          />
        );
      })()}

      {/* 커버 변경 결과 — 비차단 안내. Publish·Memory 저장과 독립이다.
          z-80: 동의 다이얼로그(z-70) 위에 떠야 한다. 실패 시 다이얼로그는 재시도를 위해
          열린 채로 남으므로, 그 아래 깔리면 실패가 사용자에게 전혀 보이지 않는다. */}
      {coverNotice && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[80] max-w-[92vw] px-4 py-3 rounded-xl text-sm font-bold shadow-modal"
          style={coverNotice === "coverUpdateFailed"
            ? { backgroundColor: "#FFF1EC", color: "#B33A22" }
            : { backgroundColor: "var(--gkm-ink)", color: "#ffffff" }}
          onClick={() => setCoverNotice(null)}
        >
          {tMemo(coverNotice)}
        </div>
      )}

      {/* TASK-022: 순간 캡처 모달 */}
      {captureOpen && itinId && (
        <TripMomentCapture
          itineraryId={itinId}
          deviceId={getDeviceId()}
          dayNumber={captureDay ?? (days.length > 0 ? 1 : null)}
          initialPlaceName={captureStop?.placeName ?? null}
          citySpotId={captureStop?.citySpotId ?? null}
          stopKey={captureStop?.stopKey ?? null}
          onSave={handleMomentSave}
          onClose={() => { setCaptureOpen(false); setCaptureDay(null); setCaptureStop(null); }}
        />
      )}

      {/* Day 완주 축하 → Add a memory (완료한 day 를 기본 선택) */}
      {dayDone !== null && (!shareId || isOwner) && !isPastTrip && (
        <DayCompleteToast
          dayNumber={dayDone}
          onAddMemory={() => { setCaptureDay(dayDone); closeDayDone(); setCaptureOpen(true); }}
          onSendHelpful={helpfulEligible ? sendHelpful : undefined}
          onClose={closeDayDone}
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
          moments={storyCardMoments}
          travelStyle={travelStyle}
          shareUrl={publicStoryUrl(window.location.origin, itinId ?? "")}
          onClose={() => setStoryExportOpen(false)}
        />
      )}

      {/* S3: 공개 전 Publish Preview — 명시적 확인 후에만 is_public 전환 */}
      {publishPreviewOpen && (
        <PublishPreviewModal
          title={tripTitle || `My ${city} Trip`}
          city={city}
          startDate={startDate}
          endDate={endDate}
          days={days}
          momentCount={moments.length}
          shareUrl={itinId && typeof window !== "undefined" ? `${window.location.origin}/shared/${itinId}` : null}
          itineraryId={itinId}
          // 서버 동기화가 끝난 사진만 커버 후보로 준다. 미동기화 사진을 고르면
          // 커버 PUT 이 storage_path 부재로 404 가 되므로 애초에 노출하지 않는다.
          coverPhotos={moments
            .filter((m) => Boolean(m.photo_data) && m.has_photo === true && m.synced)
            .map((m) => ({ momentId: m.moment_id, previewUrl: m.photo_data as string, label: m.memo }))}
          coverPendingCount={moments.filter(
            (m) => Boolean(m.photo_data) && m.has_photo !== true,
          ).length}
          // 미리보기 문구용 커버 종류. cover_moment_id 가 비면 사진이 지워져
          // FK 가 NULL 로 만든 상태이므로 개인 커버로 보지 않는다.
          coverKind={coverKind === "moment" && coverMomentId ? "personal" : "tourism"}
          onConfirm={runPublish}
          memories={moments.map(m => ({
            momentId:   m.moment_id,
            dayNumber:  m.day_number,
            placeName:  m.place_name ?? null,
            photoCount: (m.photo_data ? 1 : 0) + (m.photo_data_extra?.length ?? 0),
            hasMemo:    m.memo.trim().length > 0,
            isPublic:   m.is_public === true,
            // 아직 서버에 없는 Memory 는 공개 요청이 404 다 — 고를 수 없게 둔다
            selectable: m.synced === true,
          }))}
          onOpenStoryCard={openStoryCard}
          onClose={() => setPublishPreviewOpen(false)}
        />
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════
//  페이지 레이아웃 (Suspense wrapper)
// ══════════════════════════════════════════════════════════════
export default function ItineraryPage() {
  const t = useTranslations("itin");
  // 저작권 문구는 footer 네임스페이스에 이미 4개 언어로 있다.
  const tFooter = useTranslations("footer");
  return (
    <div className="min-h-screen flex flex-col bg-surface-dim text-ink font-sans antialiased">
      <header className="border-b border-line bg-surface-dim/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-normal tracking-tight text-ink flex items-center gap-1.5">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-accent-coral mb-8" />
            <h2 className="text-3xl font-black text-ink mb-3">{t("loadingItinerary")}</h2>
          </div>
        }
      >
        <ItineraryResult />
      </Suspense>

      <footer className="mt-auto border-t border-line bg-surface-dim py-8 text-center text-sm text-sub px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          <p className="font-bold tracking-wide">{t("attribution")}</p>
        </div>
      </footer>
    </div>
  );
}
