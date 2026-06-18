// GoKoreaMate / gokoreamate.com — Events API Types
// TASK-016: Explore & Events API

import type { Coordinate, ZoneId, FixedEventItem } from "../scheduler/types";

export type { Coordinate, ZoneId, FixedEventItem };

// ─── Raw JSON Shape (public/data/events.json) ─────────────────────────────────

export type EventType =
  | "concert"
  | "pilgrimage"
  | "permanent"
  | "event"
  | "festival"
  | "restaurant"
  | "logistics";

export type EventStage =
  | "Event-Day"
  | "Pre-Event"
  | "Early-Bird"
  | "Post-Event"
  | "Standalone";

export interface RawEventOpeningHours {
  open:  string;  // "HH:MM"
  close: string;  // "HH:MM"
}

export interface RawEventCommerce {
  affiliateType:    string | null;
  hasAffiliate:     boolean;
  affiliatePartner: string | null;
  affiliateUrl:     string | null;
  hasMerchandise:   boolean;
  hasTicketing:     boolean;
  bookingUrl:       string | null;
}

export interface RawEvent {
  id:                         string;
  type:                       EventType;
  isAnchor:                   boolean;
  journeyCluster:             string;
  stage:                      EventStage;
  anchorEventId:              string | null;
  name:                       string;
  shortName?:                 string;
  tags:                       string[];
  city:                       string;
  district?:                  string;
  address?:                   string;
  description?:               string;
  recommendedDurationMinutes: number;
  bestTimeSlot?:              "morning" | "afternoon" | "evening";
  openingHours:               RawEventOpeningHours | null;
  startDate:                  string | null;  // "YYYY-MM-DD"
  endDate:                    string | null;  // "YYYY-MM-DD"
  displayUntil?:              string;         // "YYYY-MM-DD" — soft-hide (trip_date 모드에서 무시)
  isTrending:                 boolean;
  notice?:                    string;
  commerce:                   RawEventCommerce;
  lat?:                       number;
  lng?:                       number;
  spotCategory?:              string;
}

// ─── Events API Input ─────────────────────────────────────────────────────────

export interface EventsInput {
  trip_date:         string;         // "YYYY-MM-DD" — Required. "오늘 탐색" 시 클라이언트가 당일 날짜 전달
  journey_clusters?: string[];       // 기본: 전체. e.g. ["bts-busan-2026", "busan-explore"]
  types?:            EventType[];    // 이벤트 타입 필터
  coordinate?:       Coordinate;     // 선택 — 거리 정렬 + zone_id 계산용
  radius_km?:        number;         // 기본 100km — geo 이벤트 반경 (coordinate 제공 시)
  limit?:            number;         // 기본 30
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface EventCommerce {
  has_affiliate:  boolean;
  affiliate_url?: string;
  has_ticketing:  boolean;
  booking_url?:   string;
}

export interface EventResult {
  event_id:            string;
  name:                string;
  short_name?:         string;
  type:                EventType;
  stage:               EventStage;
  journey_cluster:     string;
  is_anchor:           boolean;
  city:                string;
  district?:           string;
  opening_hours?:      RawEventOpeningHours;
  recommended_minutes: number;
  best_time_slot?:     "morning" | "afternoon" | "evening";
  has_coordinates:     boolean;
  tags:                string[];
  is_trending:         boolean;
  safety_notice?:      string;     // events.json `notice` 필드 그대로 노출 (안전 법령 인터페이스)
  commerce:            EventCommerce;
}

// GPS 보유 이벤트 — F7 bonus 좌표 풀 + FixedEventItem 어댑터 포함
export interface GeoEventResult extends EventResult {
  coordinate:      Coordinate;
  distance_m?:     number;          // input.coordinate 제공 시만 계산
  zone_id:         ZoneId;          // 사용자 위치 기준 (없으면 기본 3)
  as_fixed_event?: FixedEventItem;  // openingHours 있는 이벤트만 존재 (absent ≠ null)
}

export interface EventsResponse {
  events:      EventResult[];      // 전체 이벤트 목록 (Explore & Events UI용)
  geo_events:  GeoEventResult[];   // GPS 보유 이벤트 (F7 bonus 좌표 풀 + 스케줄러 연동용)
  total_count: number;
  mock:        boolean;            // 항상 false — events.json은 static source
}
