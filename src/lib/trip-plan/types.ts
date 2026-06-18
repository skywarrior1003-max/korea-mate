// GoKoreaMate / gokoreamate.com — Trip Plan Combo API Types
// TASK-017: Trip Plan Combo API (Facade Pattern)
// Orchestrates: runNearMe → nearMeAdapter → runScheduler | personalize

import type {
  Coordinate,
  TripPace,
  TripAnchor,
  FixedEventItem,
  ItineraryItem,
  RouteTemplateStay,
  AffiliateContext,
  ScheduledDay,
  ConflictError,
} from "../scheduler/types";
import type { PlaceCategory } from "../near-me/types";
import type { PersonalizedScheduledDay } from "../scheduler/ai/personalization-types";

export type {
  Coordinate,
  TripPace,
  ScheduledDay,
  ConflictError,
  PersonalizedScheduledDay,
};

// ─── Trip Plan Input ──────────────────────────────────────────────────────────

export interface TripPlanInput {
  // ── Near Me 입력 (후보 생성 레이어) ──────────────────────────────────────
  coordinate:        Coordinate;       // GPS 현재 위치 (필수)
  timestamp:         string;           // "HH:MM" — F3 시간 점수용

  // ── 스케줄러 공통 입력 (필수) ─────────────────────────────────────────────
  trip_date:         string;           // "YYYY-MM-DD"
  start_time:        string;           // "HH:MM" — 여행 시작
  end_time:          string;           // "HH:MM" — 여행 종료 (start_time 초과 필수)
  pace:              TripPace;         // "relaxed" | "normal" | "packed"

  // ── Near Me 필터 (선택) ───────────────────────────────────────────────────
  categories?:       PlaceCategory[];  // Near Me 카테고리 필터
  liked_place_ids?:  string[];         // F5 선호 신호 (좋아요 place_id 목록)
  itinerary_coords?: Coordinate[];     // F6 동선 근접 신호
  event_coords?:     Coordinate[];     // F7 이벤트 venue 좌표 (Events API geo_events)
  near_me_limit?:    number;           // 스케줄러 주입 후보 수 (기본: 12)

  // ── 스케줄러 고정 입력 (선택) ────────────────────────────────────────────
  anchors?:               TripAnchor[];
  fixed_events?:          FixedEventItem[];     // Events API as_fixed_event 배열
  preferred_items?:       ItineraryItem[];      // Add to Itinerary 장소
  route_template_stays?:  RouteTemplateStay[];  // Story Routes 체류 시간 힌트
  affiliate_context?:     AffiliateContext;     // Korea Ready 어필리에이트

  // ── AI 개인화 제어 ────────────────────────────────────────────────────────
  with_ai?:          boolean;          // 기본 false — personalize() 활성화 여부

  // ── TASK-021: 제휴 컨텍스트 자동 조회 힌트 (선택) ────────────────────────
  city?:             string;           // "busan" | "seoul" | ... — affiliate 도시 필터
  locale?:           string;           // "en" | "ko" | "ja" | "zh" — 다국어 표시 결정
}

// ─── Trip Plan Response (Discriminated Union) ─────────────────────────────────

export type TripPlanResponse =
  | {
      kind:           "scheduled";      // 규칙 기반 완료 — AI 미사용
      plan:           ScheduledDay;
      near_me_count:  number;           // 스케줄러에 주입된 실제 후보 수
    }
  | {
      kind:           "personalized";   // Gemini 개인화 성공
      plan:           PersonalizedScheduledDay;
      near_me_count:  number;
    }
  | {
      kind:           "fallback";       // AI 요청했으나 규칙 기반으로 자동 Fallback
      plan:           ScheduledDay;
      near_me_count:  number;
      fallback_reason: string;          // Gemini 실패 원인 (디버깅/로깅용)
    }
  | {
      kind:           "conflict";       // 스케줄러 하드 제약 위반 (HC-1 ~ HC-7)
      error:          ConflictError;
    };
