// 여행 기간을 줄일 때 잘려 나가는 Day 의 장소를 **지우지 않고 This Trip 미배정으로 돌려보낸다**
// (TASK-MY-TRIP-FINAL-PRODUCT-CORRECTION-AND-059-PROD-V1, Owner 확정).
//
// 화면 없이. 일정 항목(Place) 하나를 보관함(cart) 항목으로 바꾸는 순수 변환이다.
//   · 보관함에서 온 항목은 저장해 둔 cartSnapshot 을 그대로 되살린다 — 사용자가 고른 원본 그대로.
//   · 스케줄러가 넣은 항목은 일정이 아는 값(이름·카테고리·좌표·설명·체류)으로 보관함 항목을 만든다.
//   · fixed 일정은 CartFixed(날짜·시작·소요) 로 보존한다 — hard constraint 가 사라지지 않는다.
//   · 사용자가 직접 정한 시각(timeSource "user")·체류시간은 unplacedMeta 로 남겨 다시 배치할 때 되살린다.
// 데이터를 지어내지 않는다: 모르는 값은 빈 문자열/null 로 둔다.

import type { CartFixed, CartItem, EventItem } from "../cart";
import { parseDurationMinutes } from "./planning-view-core.ts";

export interface UnplaceablePlace {
  name: string;
  category?: string | null;
  location?: string | null;
  time?: string | null;
  duration?: string | null;
  tips?: string | null;
  googleMapsUrl?: string | null;
  cartSnapshot?: CartItem | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  source?: string | null;
  sourceKey?: string | null;
  address?: string | null;
  image?: string | null;
  isFixed?: boolean | null;
  timeSource?: "scheduler" | "user" | null;
  isAccommodation?: boolean | null;
}

export interface UnplacedConversion {
  event: EventItem;
  fixed: CartFixed | null;
  meta: NonNullable<CartItem["unplacedMeta"]>;
}

/** 숙소 체크인 항목은 장소가 아니라 "머무는 곳" — 보관함으로 보내지 않는다(설정은 TripDraft 에 있다). */
export function isUnplaceable(place: UnplaceablePlace): boolean {
  return !place.isAccommodation;
}

function mapUrlFor(place: UnplaceablePlace, city: string): string {
  if (place.googleMapsUrl) return place.googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;
}

export function placeToUnplacedCartEvent(place: UnplaceablePlace, fromDate: string, city: string): UnplacedConversion {
  const stayMin = parseDurationMinutes(place.duration ?? null);
  const meta: UnplacedConversion["meta"] = {
    time: place.time ?? null,
    timeSource: place.timeSource ?? null,
    duration: place.duration ?? null,
    fromDate,
  };
  const fixed: CartFixed | null = place.isFixed && place.time
    ? { date: fromDate, startTime: place.time, durationMinutes: stayMin ?? 60 }
    : null;

  if (place.cartSnapshot) {
    // 보관함 원본을 그대로 — addedAt/sortOrder/tripCity 는 addToCart 가 다시 매긴다.
    const { addedAt: _a, sortOrder: _s, tripCity: _t, fixed: _f, unplacedMeta: _m, ...event } = place.cartSnapshot;
    void _a; void _s; void _t; void _f; void _m;
    return { event: { ...event, unplacedMeta: meta } as EventItem, fixed, meta };
  }

  const key = place.sourceKey ?? (place.place_id ? `${place.source ?? "place"}:${place.place_id}` : `name:${city.toLowerCase()}:${place.name.toLowerCase()}`);
  const event: EventItem & { unplacedMeta: UnplacedConversion["meta"] } = {
    id: `unplaced-${key}`,
    sourceKey: key,
    type: place.category || "attraction",
    isAnchor: false,
    journeyCluster: null,
    stage: "",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: [],
    transitFromAnchor: null,
    name: place.name,
    shortName: place.name,
    tags: [],
    city,
    district: place.location ?? "",
    address: place.address ?? "",
    mapUrl: mapUrlFor(place, city),
    description: place.tips ?? "",
    whyItMatters: "",
    recommendedDurationMinutes: stayMin ?? 60,
    bestTimeSlot: "",
    openingHours: null,
    image: place.image ?? null,
    startDate: null,
    endDate: null,
    isTrending: false,
    soloFriendly: false,
    foreignCardAccepted: false,
    cashOnly: false,
    englishMenu: false,
    barrierFree: false,
    koreanSurvivalScore: 0,
    notice: null,
    ...(place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : {}),
    unplacedMeta: meta,
  };
  return { event, fixed, meta };
}
