// GoKoreaMate / gokoreamate.com — Scheduler Engine Types
// TASK-013: Rule-based Scheduler v1
// NearMeCandidate is a local adapter; will be replaced by TASK-011 export when implemented.

// ─── Coordinate ───────────────────────────────────────────────────────────────

export interface Coordinate {
  lat: number;
  lng: number;
}

// ─── Zone (from Near Me 2.0 design) ──────────────────────────────────────────

export type ZoneId = 1 | 2 | 3;

// ─── Category ─────────────────────────────────────────────────────────────────

export type PlaceCategory =
  | "food"
  | "cafe"
  | "attraction"
  | "kpop"
  | "event"
  | "walking"
  | "temple"
  | "nightview"
  | "shopping"
  | "rainy_day";

// ─── Pace ─────────────────────────────────────────────────────────────────────

export type TripPace = "relaxed" | "normal" | "packed";

// ─── NearMeCandidate (adapter — future: import from TASK-011) ─────────────────

export interface NearMeCandidate {
  place_id: string;
  category: PlaceCategory;
  coordinate: Coordinate;
  zone_id: ZoneId;
  score: number;
  stay_minutes_override?: number; // from route_template if set
}

// ─── Scheduler Input ──────────────────────────────────────────────────────────

export interface TripAnchor {
  place_id: string;
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  is_fixed: true;
}

export interface FixedEventItem {
  event_id: string;
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  coordinate: Coordinate;
  zone_id: ZoneId;
}

export interface ItineraryItem {
  place_id: string;
  preferred_time_slot?: "morning" | "afternoon" | "evening";
}

export interface RouteTemplateStay {
  place_id: string;
  stay_minutes: number;
}

export interface AffiliateContext {
  affiliate_link_ids: string[];
  max_cards: number;
}

export interface SchedulerInput {
  trip_date: string;            // "YYYY-MM-DD"
  start_time: string;           // "HH:MM"
  end_time: string;             // "HH:MM"
  base_coordinate: Coordinate;
  pace: TripPace;
  anchors?: TripAnchor[];
  fixed_events?: FixedEventItem[];
  preferred_items?: ItineraryItem[];
  candidates: NearMeCandidate[];
  route_template_stays?: RouteTemplateStay[];
  affiliate_context?: AffiliateContext;
}

// ─── Scheduled Item ───────────────────────────────────────────────────────────

export type ScheduledItemType = "place" | "event" | "affiliate";

export type StaySource = "route_template" | "category_default" | "pace_adjusted";

export interface ScheduledItem {
  slot_order: number;
  item_type: ScheduledItemType;
  source: "anchor" | "fixed_event" | "greedy" | "affiliate";
  place_id?: string;
  event_id?: string;
  affiliate_link_id?: string;
  start_time: string;           // "HH:MM"
  end_time: string;             // "HH:MM"
  stay_minutes: number;
  travel_minutes_from_prev: number;
  is_fixed: boolean;
  zone_id?: ZoneId;
  stay_source: StaySource;
}

// ─── Scheduled Day ────────────────────────────────────────────────────────────

export interface ScheduledDay {
  trip_date: string;
  items: ScheduledItem[];
  ai_used: false;               // always false — Gemini Live forbidden
  scheduler_version: "rule-based-v1";
  generated_at: string;         // ISO 8601
}

// ─── Hard Constraint Violation ────────────────────────────────────────────────

export type HardConstraintCode =
  | "HC-1" // duplicate place
  | "HC-2" // out of operating hours
  | "HC-3" // travel time exceeds gap
  | "HC-4" // stay time exceeds gap
  | "HC-5" // anchor conflict
  | "HC-6" // daily time window exceeded
  | "HC-7" // max items exceeded

export interface ConflictError {
  code: HardConstraintCode;
  message: string;
  conflicting_item?: Partial<ScheduledItem>;
}

// ─── Scheduler Result ─────────────────────────────────────────────────────────

export type SchedulerResult =
  | { success: true; data: ScheduledDay }
  | { success: false; error: ConflictError };

// ─── Timeline Slot ────────────────────────────────────────────────────────────

export interface TimelineSlot {
  start_minutes: number;  // minutes from midnight
  end_minutes: number;
  is_occupied: boolean;
  item?: ScheduledItem;
}
